import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { normalizeArticleActions } from '../../actions/actionRegistry.js';
import { searchKnowledge } from '../../intelligence/knowledgeSearch.js';
import { buildEmbeddingPatch } from '../../intelligence/articleIndexing.js';
import { embeddingProviderReady } from '../../intelligence/embeddingClient.js';
import { normalizeText } from '../../intelligence/text.js';
import { evaluateKnowledgeEvidence } from '../../intelligence/evidenceQuality.js';

const ARTICLE_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'REVIEW_REQUIRED', 'EXPIRED', 'ARCHIVED']);
const VISIBILITIES = new Set(['PUBLIC', 'STAFF_ONLY', 'INTERNAL']);
const SAFE_FIELDS = [
  'slug', 'title', 'summary', 'content', 'category', 'keywords', 'clusterKeys', 'actions',
  'enabled', 'sourceLabel', 'sourceUrl', 'status', 'visibility', 'pinned',
  'expiresAt', 'reviewDueAt', 'lastReviewedAt', 'lastReviewedBy', 'qualityScore', 'confidenceFloor',
];

function slugify(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function safeJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function qualityFrom(article) {
  const helpful = Number(article.helpfulCount || 0);
  const unhelpful = Number(article.unhelpfulCount || 0);
  const total = helpful + unhelpful;
  const feedbackScore = total ? helpful / total : 1;
  return Math.max(0, Math.min(1, Number(article.qualityScore ?? feedbackScore)));
}

function lifecycleFor(article) {
  const now = Date.now();
  const expired = article.expiresAt && new Date(article.expiresAt).getTime() <= now;
  const reviewDue = article.reviewDueAt && new Date(article.reviewDueAt).getTime() <= now;
  const quality = qualityFrom(article);
  let health = 'healthy';
  if (article.status === 'ARCHIVED' || !article.enabled) health = 'inactive';
  else if (expired || article.status === 'EXPIRED') health = 'expired';
  else if (reviewDue || article.status === 'REVIEW_REQUIRED' || quality < 0.65) health = 'review';
  return { expired: Boolean(expired), reviewDue: Boolean(reviewDue), quality, health };
}

function publicArticle(article, { includeContent = true } = {}) {
  if (!article) return article;
  const { embedding, ...rest } = article;
  const lifecycle = lifecycleFor(article);
  return {
    ...rest,
    ...(includeContent ? {} : { content: undefined }),
    actions: typeof rest.actions === 'string' ? safeJson(rest.actions, []) : rest.actions,
    embeddingReady: Boolean(embedding),
    aliasCount: article._count?.aliases ?? article.aliases?.length ?? 0,
    ...lifecycle,
  };
}

function cleanData(body = {}) {
  const data = {};
  for (const key of SAFE_FIELDS) if (body[key] !== undefined) data[key] = body[key];
  if (data.slug !== undefined) data.slug = slugify(data.slug);
  if (data.title !== undefined) data.title = String(data.title).trim().slice(0, 180);
  if (data.summary !== undefined) data.summary = String(data.summary).trim().slice(0, 600);
  if (data.content !== undefined) data.content = String(data.content).trim().slice(0, 30000);
  if (data.category !== undefined) data.category = String(data.category).trim().slice(0, 100);
  if (data.keywords !== undefined) data.keywords = String(data.keywords).trim().slice(0, 1200);
  if (data.clusterKeys !== undefined) data.clusterKeys = String(data.clusterKeys || '*').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).join(',').slice(0, 400) || '*';
  if (data.sourceLabel !== undefined) data.sourceLabel = String(data.sourceLabel).trim().slice(0, 120);
  if (data.sourceUrl !== undefined) {
    const url = String(data.sourceUrl || '').trim();
    data.sourceUrl = /^https?:\/\//i.test(url) ? url.slice(0, 1000) : null;
  }
  if (data.actions !== undefined) data.actions = JSON.stringify(normalizeArticleActions(data.actions));
  if (data.enabled !== undefined) data.enabled = Boolean(data.enabled);
  if (data.pinned !== undefined) data.pinned = Boolean(data.pinned);
  if (data.status !== undefined) {
    const status = String(data.status || '').toUpperCase();
    data.status = ARTICLE_STATUSES.has(status) ? status : 'DRAFT';
  }
  if (data.visibility !== undefined) {
    const visibility = String(data.visibility || '').toUpperCase();
    data.visibility = VISIBILITIES.has(visibility) ? visibility : 'PUBLIC';
  }
  for (const key of ['expiresAt', 'reviewDueAt', 'lastReviewedAt']) if (data[key] !== undefined) data[key] = dateOrNull(data[key]);
  if (data.lastReviewedBy !== undefined) data.lastReviewedBy = String(data.lastReviewedBy || '').trim().slice(0, 80) || null;
  if (data.qualityScore !== undefined) data.qualityScore = Math.max(0, Math.min(1, Number(data.qualityScore) || 0));
  if (data.confidenceFloor !== undefined) data.confidenceFloor = Math.max(0.05, Math.min(0.95, Number(data.confidenceFloor) || 0.3));
  return data;
}

function normalizeAliases(value) {
  const source = Array.isArray(value) ? value : safeJson(value, []);
  const seen = new Set();
  const aliases = [];
  for (const raw of source.slice(0, 200)) {
    const phrase = String(typeof raw === 'string' ? raw : raw?.phrase || '').trim().slice(0, 1500);
    const normalized = normalizeText(phrase).slice(0, 1500);
    if (!phrase || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push({
      phrase,
      normalized,
      weight: Math.max(0.25, Math.min(2, Number(typeof raw === 'object' ? raw.weight : 1) || 1)),
    });
  }
  return aliases;
}

async function syncAliases(tx, articleId, aliases) {
  const normalized = normalizeAliases(aliases);
  await tx.knowledgeAlias.deleteMany({ where: { articleId } });
  for (const alias of normalized) await tx.knowledgeAlias.create({ data: { articleId, ...alias } });
}

async function indexArticle(article, force = false) {
  try {
    const patch = await buildEmbeddingPatch(article, { force });
    if (!patch) return article;
    return await prisma.knowledgeArticle.update({ where: { id: article.id }, data: patch });
  } catch (error) {
    console.warn('[KNOWLEDGE EMBEDDING]', article.id, error.message);
    return article;
  }
}

export async function knowledgeOverview(_req, res) {
  try {
    const now = new Date();
    const [total, published, drafts, reviewRequired, expired, archived, lowQuality, aliases, feedback] = await Promise.all([
      prisma.knowledgeArticle.count(),
      prisma.knowledgeArticle.count({ where: { enabled: true, status: 'PUBLISHED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      prisma.knowledgeArticle.count({ where: { status: 'DRAFT' } }),
      prisma.knowledgeArticle.count({ where: { OR: [{ status: 'REVIEW_REQUIRED' }, { reviewDueAt: { lte: now } }] } }),
      prisma.knowledgeArticle.count({ where: { OR: [{ status: 'EXPIRED' }, { expiresAt: { lte: now } }] } }),
      prisma.knowledgeArticle.count({ where: { status: 'ARCHIVED' } }),
      prisma.knowledgeArticle.count({ where: { qualityScore: { lt: 0.65 }, status: { not: 'ARCHIVED' } } }),
      prisma.knowledgeAlias.count(),
      prisma.knowledgeArticle.aggregate({ _sum: { helpfulCount: true, unhelpfulCount: true, views: true } }),
    ]);
    const helpful = feedback._sum.helpfulCount || 0;
    const unhelpful = feedback._sum.unhelpfulCount || 0;
    res.json({ success: true, data: {
      total, published, drafts, reviewRequired, expired, archived, lowQuality, aliases,
      views: feedback._sum.views || 0,
      helpfulRate: helpful + unhelpful ? helpful / (helpful + unhelpful) : 1,
    } });
  } catch (error) {
    console.error('[KNOWLEDGE OVERVIEW]', error);
    res.status(500).json({ success: false, message: 'Không tải được thống kê Knowledge Base' });
  }
}

export async function listKnowledge(req, res) {
  try {
    const { search, category, clusterKey, status, health, pinned, all, page = '1', limit = '50' } = req.query;
    const where = all === 'true' ? {} : { enabled: true, status: 'PUBLISHED' };
    if (category) where.category = String(category);
    if (status && status !== 'all') where.status = String(status).toUpperCase();
    if (pinned === 'true') where.pinned = true;
    const filters = [];
    if (clusterKey) {
      const key = String(clusterKey).trim().toLowerCase();
      filters.push({ OR: [
        { clusterKeys: '*' }, { clusterKeys: key }, { clusterKeys: { startsWith: `${key},` } },
        { clusterKeys: { endsWith: `,${key}` } }, { clusterKeys: { contains: `,${key},` } },
      ] });
    }
    if (search) filters.push({ OR: ['title', 'summary', 'content', 'category', 'keywords', 'slug']
      .map((field) => ({ [field]: { contains: String(search) } })) });
    const now = new Date();
    if (health === 'expired') filters.push({ OR: [{ status: 'EXPIRED' }, { expiresAt: { lte: now } }] });
    if (health === 'review') filters.push({ OR: [{ status: 'REVIEW_REQUIRED' }, { reviewDueAt: { lte: now } }, { qualityScore: { lt: 0.65 } }] });
    if (health === 'healthy') filters.push({ status: 'PUBLISHED', enabled: true, qualityScore: { gte: 0.65 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
    if (filters.length) where.AND = filters;
    const take = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
    const skip = (Math.max(1, Number.parseInt(page, 10) || 1) - 1) * take;
    const [total, items] = await Promise.all([
      prisma.knowledgeArticle.count({ where }),
      prisma.knowledgeArticle.findMany({
        where,
        include: { aliases: { orderBy: { weight: 'desc' }, take: 5 }, _count: { select: { aliases: true, revisions: true, approvedCandidates: true } } },
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }], take, skip,
      }),
    ]);
    res.json({ success: true, data: { total, items: items.map((item) => publicArticle(item)) } });
  } catch (error) {
    console.error('[KNOWLEDGE LIST]', error);
    res.status(500).json({ success: false, message: 'Không tải được Knowledge Base' });
  }
}

export async function getKnowledge(req, res) {
  try {
    const item = await prisma.knowledgeArticle.findUnique({
      where: { id: req.params.id },
      include: {
        aliases: { orderBy: [{ weight: 'desc' }, { createdAt: 'asc' }] },
        revisions: { orderBy: { version: 'desc' }, take: 30 },
        _count: { select: { approvedCandidates: true, targetCandidates: true } },
      },
    });
    if (!item) return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
    res.json({ success: true, data: publicArticle(item) });
  } catch (error) {
    console.error('[KNOWLEDGE GET]', error);
    res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
  }
}

export async function createKnowledge(req, res) {
  try {
    const data = cleanData(req.body);
    if (!data.title || !data.content) return res.status(400).json({ success: false, message: 'Thiếu tiêu đề hoặc nội dung' });
    data.slug = data.slug || slugify(data.title);
    if (!data.slug) return res.status(400).json({ success: false, message: 'Slug không hợp lệ' });
    data.createdBy = req.user.discordId;
    data.updatedBy = req.user.discordId;
    data.lastReviewedAt ||= data.status === 'PUBLISHED' ? new Date() : null;
    data.lastReviewedBy ||= data.status === 'PUBLISHED' ? req.user.discordId : null;
    let item = await prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeArticle.create({ data });
      if (req.body.aliases !== undefined) await syncAliases(tx, created.id, req.body.aliases);
      return tx.knowledgeArticle.findUnique({ where: { id: created.id }, include: { aliases: true, _count: { select: { aliases: true } } } });
    });
    item = await indexArticle(item);
    await logAudit({ action: 'knowledge.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, title: item.title, status: item.status } });
    emit('knowledge:updated', publicArticle(item));
    res.status(201).json({ success: true, data: publicArticle(item) });
  } catch (error) {
    console.error('[KNOWLEDGE CREATE]', error);
    const duplicate = String(error.message).includes('Unique constraint');
    res.status(duplicate ? 409 : 500).json({ success: false, message: duplicate ? 'Slug hoặc alias đã tồn tại' : 'Không tạo được bài viết' });
  }
}

export async function updateKnowledge(req, res) {
  try {
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id: req.params.id }, include: { aliases: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
    const data = cleanData(req.body);
    data.updatedBy = req.user.discordId;
    data.version = { increment: 1 };
    if (data.status === 'PUBLISHED') {
      data.lastReviewedAt = new Date();
      data.lastReviewedBy = req.user.discordId;
    }
    const snapshot = JSON.stringify(publicArticle(existing));
    let item = await prisma.$transaction(async (tx) => {
      await tx.knowledgeRevision.create({
        data: { articleId: existing.id, version: existing.version, snapshot, actorId: req.user.discordId, actorName: req.user.username },
      });
      await tx.knowledgeArticle.update({ where: { id: existing.id }, data });
      if (req.body.aliases !== undefined) await syncAliases(tx, existing.id, req.body.aliases);
      return tx.knowledgeArticle.findUnique({ where: { id: existing.id }, include: { aliases: true, _count: { select: { aliases: true, revisions: true } } } });
    });
    item = await indexArticle(item);
    await logAudit({ action: 'knowledge.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, version: item.version, status: item.status } });
    emit('knowledge:updated', publicArticle(item));
    res.json({ success: true, data: publicArticle(item) });
  } catch (error) {
    console.error('[KNOWLEDGE UPDATE]', error);
    res.status(500).json({ success: false, message: 'Không cập nhật được bài viết' });
  }
}

export async function restoreKnowledgeRevision(req, res) {
  try {
    const revision = await prisma.knowledgeRevision.findUnique({ where: { id: req.params.revisionId } });
    if (!revision || revision.articleId !== req.params.id) return res.status(404).json({ success: false, message: 'Revision không tồn tại' });
    const snapshot = safeJson(revision.snapshot, null);
    if (!snapshot) return res.status(400).json({ success: false, message: 'Snapshot revision không hợp lệ' });
    const current = await prisma.knowledgeArticle.findUnique({
      where: { id: req.params.id },
      include: { aliases: true },
    });
    if (!current) return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
    const restoredData = cleanData(snapshot);
    const restoredAliases = Array.isArray(snapshot.aliases) ? snapshot.aliases : null;
    delete restoredData.slug;
    restoredData.version = { increment: 1 };
    restoredData.updatedBy = req.user.discordId;
    restoredData.lastReviewedAt = new Date();
    restoredData.lastReviewedBy = req.user.discordId;
    let item = await prisma.$transaction(async (tx) => {
      await tx.knowledgeRevision.create({
        data: { articleId: current.id, version: current.version, snapshot: JSON.stringify(publicArticle(current)), actorId: req.user.discordId, actorName: req.user.username },
      });
      await tx.knowledgeArticle.update({ where: { id: current.id }, data: restoredData });
      if (restoredAliases) await syncAliases(tx, current.id, restoredAliases);
      return tx.knowledgeArticle.findUnique({
        where: { id: current.id },
        include: { aliases: true, _count: { select: { aliases: true, revisions: true } } },
      });
    });
    item = await indexArticle(item, true);
    await logAudit({ action: 'knowledge.restore', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, revisionId: revision.id, fromVersion: revision.version } });
    emit('knowledge:updated', publicArticle(item));
    res.json({ success: true, data: publicArticle(item) });
  } catch (error) {
    console.error('[KNOWLEDGE RESTORE]', error);
    res.status(500).json({ success: false, message: 'Không khôi phục được revision' });
  }
}

export async function archiveKnowledge(req, res) {
  try {
    const item = await prisma.knowledgeArticle.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED', enabled: false, updatedBy: req.user.discordId },
    });
    await logAudit({ action: 'knowledge.archive', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, title: item.title } });
    emit('knowledge:updated', publicArticle(item));
    res.json({ success: true, data: publicArticle(item) });
  } catch {
    res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
  }
}

export async function deleteKnowledge(req, res) {
  try {
    const item = await prisma.knowledgeArticle.delete({ where: { id: req.params.id } });
    await logAudit({ action: 'knowledge.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, title: item.title } });
    emit('knowledge:deleted', { id: item.id });
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
  }
}

export async function addKnowledgeAlias(req, res) {
  try {
    const phrase = String(req.body.phrase || '').trim().slice(0, 1500);
    const normalized = normalizeText(phrase).slice(0, 1500);
    if (!phrase || !normalized) return res.status(400).json({ success: false, message: 'Alias không hợp lệ' });
    const article = await prisma.knowledgeArticle.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } });
    if (!article) return res.status(404).json({ success: false, message: 'Bài viết không tồn tại' });
    const alias = await prisma.knowledgeAlias.upsert({
      where: { articleId_normalized: { articleId: req.params.id, normalized } },
      create: { articleId: req.params.id, phrase, normalized, weight: Math.max(0.25, Math.min(2, Number(req.body.weight) || 1)) },
      update: { phrase, weight: Math.max(0.25, Math.min(2, Number(req.body.weight) || 1)) },
    });
    await logAudit({
      action: 'knowledge.alias.upsert',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { articleId: article.id, articleTitle: article.title, aliasId: alias.id, phrase: alias.phrase },
    });
    emit('knowledge:updated', { id: article.id, aliasChanged: true });
    res.status(201).json({ success: true, data: alias });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Không thêm được alias' });
  }
}

export async function deleteKnowledgeAlias(req, res) {
  try {
    const alias = await prisma.knowledgeAlias.findUnique({ where: { id: req.params.aliasId } });
    if (!alias || alias.articleId !== req.params.id) return res.status(404).json({ success: false, message: 'Alias không tồn tại' });
    await prisma.knowledgeAlias.delete({ where: { id: alias.id } });
    await logAudit({
      action: 'knowledge.alias.delete',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { articleId: alias.articleId, aliasId: alias.id, phrase: alias.phrase },
    });
    emit('knowledge:updated', { id: alias.articleId, aliasChanged: true });
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, message: 'Alias không tồn tại' });
  }
}

async function performSearch(query, { limit = 5, threshold = 0.2, useEmbeddings = true, clusterKey = null, evidenceMinScore = 0.50, evidenceMinTopGap = 0.04, freshnessDays = 180 } = {}) {
  const now = new Date();
  const allArticles = await prisma.knowledgeArticle.findMany({
    where: {
      enabled: true,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { aliases: { select: { phrase: true, normalized: true, weight: true } } },
  });
  const normalizedClusterKey = clusterKey ? String(clusterKey).trim().toLowerCase() : null;
  const articles = allArticles.filter((article) => {
    const scopes = String(article.clusterKeys || '*').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    return !normalizedClusterKey || scopes.includes('*') || scopes.includes(normalizedClusterKey);
  }).map((article) => ({
    ...article,
    keywords: [article.keywords, ...(article.aliases || []).flatMap((alias) => [alias.phrase, alias.normalized])]
      .filter(Boolean).join(','),
  }));
  const result = await searchKnowledge(query, articles, {
    limit: Math.min(50, limit * 3),
    threshold: Math.max(0, threshold * 0.7),
    useEmbeddings,
  });
  result.results = result.results
    .map((item) => ({ ...item, score: item.score * (0.72 + qualityFrom(item) * 0.28) }))
    .filter((item) => item.score >= Math.max(threshold, Number(item.confidenceFloor || 0.3)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  result.evidence = evaluateKnowledgeEvidence(result.results, {
    minScore: evidenceMinScore, minTopGap: evidenceMinTopGap, freshnessDays,
  });
  return result;
}

export async function previewKnowledgeSearch(req, res) {
  try {
    const query = String(req.query.q || '').trim().slice(0, 1500);
    if (!query) return res.status(400).json({ success: false, message: 'Thiếu câu tìm kiếm' });
    const result = await performSearch(query, {
      limit: Math.min(10, Number(req.query.limit) || 5),
      threshold: Math.max(0, Math.min(1, Number(req.query.threshold) || 0.2)),
      useEmbeddings: req.query.embeddings !== 'false',
      clusterKey: req.query.clusterKey ? String(req.query.clusterKey) : null,
    });
    res.json({ success: true, data: { ...result, results: result.results.map((item) => publicArticle(item)) } });
  } catch (error) {
    console.error(`[KNOWLEDGE SEARCH ${req.requestId || '-'}]`, error);
    res.status(500).json({ success: false, message: 'Tìm kiếm knowledge thất bại', requestId: req.requestId });
  }
}

export async function searchKnowledgeForBot(req, res) {
  try {
    const query = String(req.query.q || '').trim().slice(0, 1500);
    if (!query) return res.status(400).json({ success: false, message: 'Thiếu query' });
    const config = await prisma.guildConfig.findUnique({ where: { guildId: process.env.GUILD_ID } });
    const result = await performSearch(query, {
      limit: Math.min(5, Math.max(1, Number(req.query.limit) || config?.smartKnowledgeMaxResults || 3)),
      threshold: Math.max(0, Math.min(1, Number(req.query.threshold) || config?.smartKnowledgeThreshold || 0.3)),
      useEmbeddings: req.query.embeddings !== 'false',
      clusterKey: req.query.clusterKey ? String(req.query.clusterKey) : null,
      evidenceMinScore: Number(config?.smartEvidenceMinScore) || 0.50,
      evidenceMinTopGap: Number(config?.smartEvidenceMinTopGap) || 0.04,
      freshnessDays: Number(config?.smartKnowledgeFreshnessDays) || 180,
    });
    if (result.results.length) {
      await prisma.knowledgeArticle.updateMany({
        where: { id: { in: result.results.map((item) => item.id) } },
        data: { views: { increment: 1 } },
      });
    }
    res.json({ success: true, data: { ...result, results: result.results.map((item) => publicArticle(item)) } });
  } catch (error) {
    console.error('[KNOWLEDGE BOT SEARCH]', error);
    res.status(500).json({ success: false, message: 'Không tìm được tri thức phù hợp' });
  }
}

export async function reindexKnowledge(req, res) {
  try {
    const where = req.params.id ? { id: req.params.id } : {};
    const articles = await prisma.knowledgeArticle.findMany({ where });
    let indexed = 0;
    let failed = 0;
    for (const article of articles) {
      try {
        const updated = await indexArticle(article, true);
        if (updated.embedding) indexed += 1;
        else failed += 1;
      } catch { failed += 1; }
    }
    await logAudit({ action: 'knowledge.reindex', actorId: req.user.discordId, actorName: req.user.username, metadata: { total: articles.length, indexed, failed } });
    res.json({ success: true, data: { total: articles.length, indexed, failed, embeddingConfigured: await embeddingProviderReady() } });
  } catch (error) {
    console.error(`[KNOWLEDGE REINDEX ${req.requestId || '-'}]`, error);
    res.status(500).json({ success: false, message: 'Không reindex được knowledge', requestId: req.requestId });
  }
}

export async function importFaqs(req, res) {
  try {
    const faqs = await prisma.faq.findMany();
    let imported = 0;
    for (const faq of faqs) {
      const slug = `faq-${slugify(faq.title)}-${faq.id.slice(-6)}`;
      const item = await prisma.knowledgeArticle.upsert({
        where: { slug },
        update: {
          title: faq.title, content: faq.content, category: faq.category, keywords: faq.keywords,
          enabled: faq.enabled, status: faq.enabled ? 'PUBLISHED' : 'ARCHIVED', updatedBy: req.user.discordId, version: { increment: 1 },
        },
        create: {
          slug, title: faq.title, summary: '', content: faq.content, category: faq.category,
          keywords: faq.keywords, enabled: faq.enabled, status: faq.enabled ? 'PUBLISHED' : 'ARCHIVED',
          createdBy: req.user.discordId, updatedBy: req.user.discordId,
        },
      });
      await indexArticle(item);
      imported += 1;
    }
    await logAudit({ action: 'knowledge.import_faq', actorId: req.user.discordId, actorName: req.user.username, metadata: { imported } });
    res.json({ success: true, data: { imported } });
  } catch (error) {
    console.error('[KNOWLEDGE IMPORT FAQ]', error);
    res.status(500).json({ success: false, message: 'Không import được FAQ' });
  }
}

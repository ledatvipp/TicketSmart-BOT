import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import {
  createOrMergeCandidate,
  reviewCandidate,
  setCandidateDeliveryRefs,
  candidatePublic,
} from '../../smartlearn/smartLearnService.js';

function parseIntSafe(value, fallback, min, max) {
  return Math.min(max, Math.max(min, Number.parseInt(value, 10) || fallback));
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function serializeCandidate(row) {
  const candidate = candidatePublic(row);
  if (!candidate) return candidate;
  return {
    ...candidate,
    reviews: (candidate.reviews || []).map((review) => ({ ...review })),
  };
}

export async function createCandidateForBot(req, res) {
  try {
    const result = await createOrMergeCandidate(prisma, req.body || {});
    if (result.skipped) return res.status(202).json({ success: true, data: result });
    if (result.created) {
      emit('smartlearn:candidate', result.candidate);
      await logAudit({
        action: 'smartlearn.candidate.create',
        actorId: req.body.sourceUserId || 'bot',
        actorName: req.body.sourceUserName || 'Smart Assistant',
        actorKind: 'bot',
        ticketId: req.body.sourceTicketId || null,
        metadata: { candidateId: result.candidate.id, clusterKey: result.candidate.clusterKey, intentKey: result.candidate.intentKey },
      });
    } else if (result.merged) {
      emit('smartlearn:candidate', result.candidate);
    }
    return res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (error) {
    console.error('[SMARTLEARN CREATE]', error);
    return res.status(500).json({ success: false, message: 'Không tạo được Knowledge Candidate' });
  }
}

export async function getCandidateForBot(req, res) {
  const candidate = await prisma.knowledgeCandidate.findUnique({
    where: { id: req.params.id }, include: { reviews: true, approvedArticle: true, targetArticle: true },
  }).catch(() => null);
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate không tồn tại' });
  return res.json({ success: true, data: serializeCandidate(candidate) });
}

export async function saveDeliveryRefsForBot(req, res) {
  try {
    const candidate = await setCandidateDeliveryRefs(prisma, req.params.id, req.body.refs || []);
    res.json({ success: true, data: candidate });
  } catch {
    res.status(404).json({ success: false, message: 'Candidate không tồn tại' });
  }
}

async function runReview(req, res, actor) {
  try {
    const result = await reviewCandidate(prisma, req.params.id, {
      ...req.body,
      reviewerId: actor.discordId,
      reviewerName: actor.username,
      isAdmin: actor.isAdmin,
    });
    emit('smartlearn:reviewed', result);
    await logAudit({
      action: `smartlearn.review.${String(req.body.action || '').toLowerCase()}`,
      actorId: actor.discordId,
      actorName: actor.username,
      actorKind: actor.isAdmin ? 'admin' : 'staff',
      metadata: {
        candidateId: req.params.id,
        status: result.candidate?.status,
        articleId: result.article?.id || null,
      },
    });
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || 'Không xử lý được review';
    res.status(message.includes('không tồn tại') ? 404 : 400).json({ success: false, message });
  }
}

export async function reviewCandidateForBot(req, res) {
  const actor = {
    discordId: req.user.discordId,
    username: req.user.username,
    // Chỉ header actor đi kèm bot secret đã xác minh mới có thể khai báo admin.
    isAdmin: req.user.claimedAdmin === true,
  };
  if (!/^\d{15,22}$/.test(actor.discordId)) return res.status(400).json({ success: false, message: 'Thiếu X-Bot-Actor reviewer hợp lệ' });
  return runReview(req, res, actor);
}

export async function reviewCandidateFromDashboard(req, res) {
  if (req.user.role === 'VIEWER') {
    return res.status(403).json({ success: false, message: 'Tài khoản VIEWER không được phép duyệt kiến thức' });
  }
  return runReview(req, res, {
    discordId: req.user.discordId,
    username: req.user.username,
    isAdmin: req.user.role === 'ADMIN',
  });
}

export async function listCandidates(req, res) {
  try {
    const {
      status, clusterKey, intentKey, type, search,
      page = '1', limit = '30', sort = 'priority',
    } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = String(status).toUpperCase();
    if (clusterKey && clusterKey !== 'all') where.clusterKey = String(clusterKey);
    if (intentKey) where.intentKey = String(intentKey);
    if (type && type !== 'all') where.candidateType = String(type).toUpperCase();
    if (search) {
      where.OR = [
        { question: { contains: String(search) } },
        { proposedAnswer: { contains: String(search) } },
        { proposedTitle: { contains: String(search) } },
        { sourceUserName: { contains: String(search) } },
      ];
    }
    const take = parseIntSafe(limit, 30, 1, 100);
    const currentPage = parseIntSafe(page, 1, 1, 100000);
    const orderBy = sort === 'newest'
      ? [{ createdAt: 'desc' }]
      : sort === 'occurrences'
        ? [{ occurrenceCount: 'desc' }, { updatedAt: 'desc' }]
        : sort === 'learning'
          ? [{ learningScore: 'desc' }, { sourceDiversity: 'desc' }, { occurrenceCount: 'desc' }]
          : sort === 'conflict'
            ? [{ conflictScore: 'desc' }, { learningScore: 'desc' }, { updatedAt: 'desc' }]
            : [{ priorityScore: 'desc' }, { occurrenceCount: 'desc' }, { updatedAt: 'desc' }];
    const [total, items] = await Promise.all([
      prisma.knowledgeCandidate.count({ where }),
      prisma.knowledgeCandidate.findMany({
        where,
        include: { reviews: true, approvedArticle: true, targetArticle: true },
        orderBy,
        take,
        skip: (currentPage - 1) * take,
      }),
    ]);
    res.json({ success: true, data: { total, page: currentPage, limit: take, items: items.map(serializeCandidate) } });
  } catch (error) {
    console.error('[SMARTLEARN LIST]', error);
    res.status(500).json({ success: false, message: 'Không tải được SmartLearn queue' });
  }
}

export async function getCandidate(req, res) {
  const candidate = await prisma.knowledgeCandidate.findUnique({
    where: { id: req.params.id }, include: { reviews: { orderBy: { updatedAt: 'desc' } }, approvedArticle: true, targetArticle: true },
  }).catch(() => null);
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate không tồn tại' });
  return res.json({ success: true, data: serializeCandidate(candidate) });
}

export async function smartLearnOverview(_req, res) {
  try {
    const now = new Date();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const [pending, approved, rejected, conflicted, occurrences, quality, highConflict, strongCandidates, recent, activeArticles, reviewRequired, expired, lowQuality, byTypeRows] = await Promise.all([
      prisma.knowledgeCandidate.count({ where: { status: { in: ['PENDING', 'NEEDS_ADMIN', 'PUBLISHING'] } } }),
      prisma.knowledgeCandidate.count({ where: { status: 'APPROVED' } }),
      prisma.knowledgeCandidate.count({ where: { status: 'REJECTED' } }),
      prisma.knowledgeCandidate.count({ where: { status: 'CONFLICTED' } }),
      prisma.knowledgeCandidate.aggregate({ _sum: { occurrenceCount: true } }),
      prisma.knowledgeCandidate.aggregate({ _avg: { learningScore: true, evidenceScore: true, conflictScore: true } }),
      prisma.knowledgeCandidate.count({ where: { status: { in: ['PENDING', 'NEEDS_ADMIN', 'CONFLICTED'] }, conflictScore: { gte: 0.70 } } }),
      prisma.knowledgeCandidate.count({ where: { status: { in: ['PENDING', 'NEEDS_ADMIN'] }, learningScore: { gte: 0.70 }, conflictScore: { lt: 0.70 } } }),
      prisma.knowledgeCandidate.findMany({
        where: { createdAt: { gte: since } },
        select: { status: true, clusterKey: true, candidateType: true, occurrenceCount: true, createdAt: true },
      }),
      prisma.knowledgeArticle.count({ where: { enabled: true, status: 'PUBLISHED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      prisma.knowledgeArticle.count({ where: { OR: [{ status: 'REVIEW_REQUIRED' }, { reviewDueAt: { lte: now } }] } }),
      prisma.knowledgeArticle.count({ where: { OR: [{ status: 'EXPIRED' }, { expiresAt: { lte: now } }] } }),
      prisma.knowledgeArticle.count({ where: { qualityScore: { lt: 0.65 }, status: { not: 'ARCHIVED' } } }),
      prisma.knowledgeCandidate.groupBy({ by: ['candidateType'], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    ]);
    const byCluster = {};
    for (const row of recent) {
      const key = row.clusterKey || 'global';
      byCluster[key] ||= { pending: 0, approved: 0, occurrences: 0 };
      if (['PENDING', 'NEEDS_ADMIN', 'CONFLICTED', 'PUBLISHING'].includes(row.status)) byCluster[key].pending += 1;
      if (row.status === 'APPROVED') byCluster[key].approved += 1;
      byCluster[key].occurrences += row.occurrenceCount || 0;
    }
    const byType = Object.fromEntries(byTypeRows.map((row) => [row.candidateType, row._count._all]));
    res.json({ success: true, data: {
      pending, approved, rejected, conflicted,
      totalOccurrences: occurrences._sum.occurrenceCount || 0,
      avgLearningScore: quality._avg.learningScore || 0,
      avgEvidenceScore: quality._avg.evidenceScore || 0,
      avgConflictScore: quality._avg.conflictScore || 0,
      highConflict, strongCandidates,
      activeArticles, reviewRequired, expired, lowQuality,
      byCluster, byType,
    } });
  } catch (error) {
    console.error('[SMARTLEARN OVERVIEW]', error);
    res.status(500).json({ success: false, message: 'Không tải được thống kê SmartLearn' });
  }
}

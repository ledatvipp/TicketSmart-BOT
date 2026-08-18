import crypto from 'crypto';
import { normalizeText, tokenize } from '../intelligence/text.js';

const ADMIN_REQUIRED_INTENTS = new Set([
  'ITEM_LOSS', 'ITEM_LOSS_DUE_TO_LAG', 'TOPUP_NOT_RECEIVED', 'PAYMENT_ERROR',
  'PURCHASE_NOT_RECEIVED', 'BAN_APPEAL', 'MUTE_APPEAL', 'ACCOUNT_SECURITY',
  'STAFF_APPLICATION', 'DONATION_INFO', 'PURCHASE_RANK',
]);

const OPEN_STATUSES = ['PENDING', 'NEEDS_ADMIN', 'CONFLICTED'];
const POSITIVE_REVIEW_ACTIONS = ['APPROVE', 'ALTERNATIVE', 'LINK_EXISTING'];

function safeJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function clean(value, max = 2000) {
  return String(value ?? '')
    .replace(/@everyone|@here/gi, '@ everyone')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function tokenSimilarity(a, b) {
  const leftText = normalizeText(a);
  const rightText = normalizeText(b);
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  if (leftText.includes(rightText) || rightText.includes(leftText)) {
    const ratio = Math.min(leftText.length, rightText.length) / Math.max(leftText.length, rightText.length);
    return Math.max(0.82, ratio);
  }
  const left = new Set(tokenize(leftText, { fuzzy: false }));
  const right = new Set(tokenize(rightText, { fuzzy: false }));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const union = new Set([...left, ...right]).size;
  const jaccard = union ? common / union : 0;
  const coverage = common / Math.min(left.size, right.size);
  return Math.min(1, jaccard * 0.55 + coverage * 0.45);
}


function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

export function sourceDiversityFor(examples = []) {
  const rows = Array.isArray(examples) ? examples : safeJson(examples, []);
  const identities = new Set();
  for (const row of rows) {
    const user = clean(row?.sourceUserId, 40);
    const ticket = clean(row?.sourceTicketId, 50);
    const channel = clean(row?.sourceChannelId, 40);
    const message = clean(row?.sourceMessageId, 40);
    if (user) identities.add(`user:${user}`);
    else if (ticket) identities.add(`ticket:${ticket}`);
    else if (channel) identities.add(`channel:${channel}`);
    else if (message) identities.add(`message:${message}`);
  }
  return Math.max(1, identities.size || (rows.length ? 1 : 0));
}

export function learningScoreFor({
  occurrenceCount = 1, sourceDiversity = 1, sourceConfidence = 0.5, evidenceScore = 0.5,
  sourceType = 'SMART_MESSAGE', proposedAnswer = '', negativeSignalCount = 0,
} = {}) {
  const occurrenceSignal = Math.min(1, Math.log2(Math.max(1, Number(occurrenceCount)) + 1) / 3);
  const diversitySignal = Math.min(1, Math.max(1, Number(sourceDiversity) || 1) / 3);
  const answerLength = clean(proposedAnswer, 30000).length;
  const answerSignal = answerLength >= 80 ? 1 : answerLength >= 30 ? 0.75 : answerLength >= 8 ? 0.45 : 0.15;
  const source = String(sourceType || '').toUpperCase();
  const sourceSignal = source.includes('TICKET_RESOLUTION') ? 1
    : source.includes('NEGATIVE') ? 0.9
      : source.includes('TICKET') ? 0.72
        : source.includes('SMART') ? 0.58 : 0.5;
  const negativeBoost = Math.min(0.08, Math.max(0, Number(negativeSignalCount) || 0) * 0.025);
  const score = occurrenceSignal * 0.18
    + diversitySignal * 0.23
    + clamp01(sourceConfidence, 0.5) * 0.20
    + clamp01(evidenceScore, 0.5) * 0.14
    + answerSignal * 0.13
    + sourceSignal * 0.12
    + negativeBoost;
  return Math.round(Math.min(1, score) * 10000) / 10000;
}

function negatedConcepts(text = '') {
  const tokens = tokenize(normalizeText(text, { fuzzy: false }), { fuzzy: false });
  const negators = new Set(['khong', 'chua', 'chang', 'cam']);
  const bridges = new Set(['duoc', 'bi', 'se', 'can', 'nen', 'phai', 'co', 'the', 'con', 'tiep', 'tuc']);
  const concepts = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    if (!negators.has(tokens[index])) continue;
    for (let offset = 1; offset <= 4 && index + offset < tokens.length; offset += 1) {
      const token = tokens[index + offset];
      if (negators.has(token)) break;
      if (bridges.has(token)) continue;
      if (token.length >= 3) concepts.add(token);
      // The nearest meaningful word carries most of the negation semantics.
      break;
    }
  }
  return concepts;
}

function hasNegationMismatch(left = '', right = '') {
  const leftNegated = negatedConcepts(left);
  const rightNegated = negatedConcepts(right);
  if (!leftNegated.size && !rightNegated.size) return false;
  const leftTokens = new Set(tokenize(normalizeText(left, { fuzzy: false }), { fuzzy: false }));
  const rightTokens = new Set(tokenize(normalizeText(right, { fuzzy: false }), { fuzzy: false }));

  for (const concept of leftNegated) {
    if (rightTokens.has(concept) && !rightNegated.has(concept)) return true;
  }
  for (const concept of rightNegated) {
    if (leftTokens.has(concept) && !leftNegated.has(concept)) return true;
  }
  return false;
}

export function conflictScoreFor({ proposedAnswer = '', existingAnswer = '', matchScore = 0, sourceType = '' } = {}) {
  const proposed = clean(proposedAnswer, 30000);
  const existing = clean(existingAnswer, 30000);
  if (proposed.length < 8 || existing.length < 8) return 0;
  const similarity = tokenSimilarity(proposed, existing);
  const source = String(sourceType || '').toUpperCase();
  const sourceWeight = source.includes('NEGATIVE') || source.includes('REVISION') || source.includes('TICKET_RESOLUTION') ? 1 : 0.82;
  const matched = clamp01(matchScore, 0);
  let conflict = matched * (1 - similarity) * sourceWeight;

  // Contradictions often reuse almost all the same words (e.g. "được giữ" vs
  // "không được giữ"). Pure cosine/Jaccard similarity therefore underestimates
  // the exact cases SmartLearn most needs a human to review. Raise a conservative
  // floor when the same concept is explicitly negated on only one side.
  if (hasNegationMismatch(proposed, existing)) {
    conflict = Math.max(conflict, matched * 0.72 * sourceWeight);
  }

  return Math.round(Math.min(1, conflict) * 10000) / 10000;
}

function candidateSignals({ examples, occurrenceCount, sourceType, proposedAnswer, existingAnswer = '', matchScore = 0 }) {
  const rows = Array.isArray(examples) ? examples : safeJson(examples, []);
  const diversity = sourceDiversityFor(rows);
  const negativeSignalCount = rows.filter((row) => row?.negativeSignal || String(row?.sourceType || '').toUpperCase().includes('NEGATIVE')).length;
  const confidenceValues = rows.map((row) => clamp01(row?.sourceConfidence, NaN)).filter(Number.isFinite);
  const evidenceValues = rows.map((row) => clamp01(row?.evidenceScore, NaN)).filter(Number.isFinite);
  const sourceConfidence = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0.5;
  const evidenceScore = evidenceValues.length ? evidenceValues.reduce((a, b) => a + b, 0) / evidenceValues.length : 0.5;
  const learningScore = learningScoreFor({
    occurrenceCount, sourceDiversity: diversity, sourceConfidence, evidenceScore, sourceType, proposedAnswer, negativeSignalCount,
  });
  const conflictScore = conflictScoreFor({ proposedAnswer, existingAnswer, matchScore, sourceType });
  return { sourceDiversity: diversity, negativeSignalCount, evidenceScore: Math.round(evidenceScore * 10000) / 10000, learningScore, conflictScore };
}

function appendExample(raw, example) {
  const rows = safeJson(raw, []);
  const next = Array.isArray(rows) ? rows : [];
  const key = `${example.question}:${example.sourceMessageId || ''}`;
  if (!next.some((item) => `${item.question}:${item.sourceMessageId || ''}` === key)) next.push(example);
  return JSON.stringify(next.slice(-30));
}

export function candidatePublic(candidate) {
  if (!candidate) return candidate;
  return {
    ...candidate,
    sourceExamples: safeJson(candidate.sourceExamples, []),
    deliveryRefs: safeJson(candidate.deliveryRefs, []),
    reviews: Array.isArray(candidate.reviews) ? candidate.reviews : undefined,
  };
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'smartlearn';
}

function keywordsFrom(candidate, existing = '') {
  const explicit = clean(candidate.proposedKeywords, 800)
    .split(',').map((item) => item.trim()).filter(Boolean);
  const current = clean(existing, 1200).split(',').map((item) => item.trim()).filter(Boolean);
  const tokens = tokenize(candidate.normalizedQuestion, { fuzzy: false })
    .filter((item) => item.length >= 3)
    .slice(0, 20);
  return [...new Set([...current, ...explicit, ...tokens])].join(',').slice(0, 1200);
}

function articleScopeMatches(article, clusterKey) {
  const scopes = String(article?.clusterKeys || '*').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return scopes.includes('*') || !clusterKey || scopes.includes(String(clusterKey).toLowerCase());
}

function articleSearchText(article) {
  return [article.title, article.summary, article.keywords, article.content]
    .filter(Boolean).join(' ');
}

function articleQuality(article) {
  const votes = Number(article.helpfulCount || 0) + Number(article.unhelpfulCount || 0);
  const voteScore = votes ? Number(article.helpfulCount || 0) / votes : 1;
  return Math.max(0.2, Math.min(1, Number(article.qualityScore ?? voteScore)));
}

async function findBestArticleMatch(prisma, normalizedQuestion, clusterKey, explicitId = null) {
  if (explicitId) {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: explicitId }, include: { aliases: true },
    }).catch(() => null);
    return article ? { article, score: 1, source: 'explicit' } : null;
  }
  const now = new Date();
  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      enabled: true,
      status: { in: ['PUBLISHED', 'REVIEW_REQUIRED'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { aliases: true },
    take: 500,
  });
  let best = null;
  for (const article of articles) {
    if (!articleScopeMatches(article, clusterKey)) continue;
    let score = tokenSimilarity(normalizedQuestion, articleSearchText(article));
    let source = 'article';
    for (const alias of article.aliases || []) {
      const aliasScore = tokenSimilarity(normalizedQuestion, alias.normalized || alias.phrase) * Math.max(0.5, Math.min(1.25, Number(alias.weight) || 1));
      if (aliasScore > score) {
        score = aliasScore;
        source = 'alias';
      }
    }
    score *= 0.8 + articleQuality(article) * 0.2;
    if (!best || score > best.score) best = { article, score: Math.min(1, score), source };
  }
  return best;
}

export function candidateTypeFor(payload, match) {
  const explicit = String(payload.candidateType || '').toUpperCase();
  if (['NEW_ARTICLE', 'ADD_ALIAS', 'REVISE_ARTICLE', 'VERIFY_EXISTING'].includes(explicit)) return explicit;
  const source = String(payload.sourceType || '').toUpperCase();
  if (source.includes('NEGATIVE') || source.includes('REVISION')) return match ? 'REVISE_ARTICLE' : 'NEW_ARTICLE';
  if (!match) return 'NEW_ARTICLE';
  if (match.score >= 0.78) return 'ADD_ALIAS';
  if (match.score >= 0.48) return 'VERIFY_EXISTING';
  return 'NEW_ARTICLE';
}

export function priorityScoreFor({ occurrenceCount = 1, riskLevel, sourceType, candidateType, matchScore = 0, learningScore = 0, conflictScore = 0 }) {
  const source = String(sourceType || '').toUpperCase();
  let score = Math.log2(Math.max(1, occurrenceCount) + 1) * 12;
  if (riskLevel === 'ADMIN_REQUIRED') score += 25;
  if (source.includes('NEGATIVE')) score += 20;
  if (source.includes('TICKET')) score += 8;
  if (candidateType === 'REVISE_ARTICLE') score += 18;
  if (candidateType === 'VERIFY_EXISTING') score += 8;
  if (candidateType === 'ADD_ALIAS') score += 4;
  score += Math.round(matchScore * 10);
  score += clamp01(learningScore, 0) * 15;
  score += clamp01(conflictScore, 0) * 20;
  return Math.min(100, Math.round(score * 100) / 100);
}

export function riskForIntent(intentKey) {
  return ADMIN_REQUIRED_INTENTS.has(String(intentKey || '').toUpperCase()) ? 'ADMIN_REQUIRED' : 'NORMAL';
}

export function shouldReopenRejected(candidate, nextOccurrence, now = Date.now()) {
  const reviewedAt = candidate.reviewedAt ? new Date(candidate.reviewedAt).getTime() : 0;
  const ageMs = reviewedAt ? now - reviewedAt : Number.POSITIVE_INFINITY;
  return ageMs >= 7 * 24 * 60 * 60_000 || (ageMs >= 24 * 60 * 60_000 && nextOccurrence >= 3);
}

function pendingStatusFor(candidate) {
  return candidate.riskLevel === 'ADMIN_REQUIRED' ? 'NEEDS_ADMIN' : 'PENDING';
}

export async function createOrMergeCandidate(prisma, payload) {
  const guildId = clean(payload.guildId, 30);
  const question = clean(payload.question, 1500);
  if (!guildId || question.length < 3) return { skipped: true, reason: 'invalid_question' };

  const config = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
  if (config?.smartLearnEnabled === false) return { skipped: true, reason: 'disabled' };

  const normalizedQuestion = normalizeText(question).slice(0, 1500);
  if (normalizedQuestion.length < 3) return { skipped: true, reason: 'empty_normalized_question' };
  const clusterKey = clean(payload.clusterKey, 50) || null;
  const questionHash = hash(normalizedQuestion);
  const dedupeKey = `${guildId}:${clusterKey || 'global'}:${questionHash}`;
  const sourceExample = {
    question,
    sourceType: clean(payload.sourceType || 'SMART_MESSAGE', 40),
    sourceTicketId: clean(payload.sourceTicketId, 40) || null,
    sourceConfidence: clamp01(payload.sourceConfidence, 0.5),
    evidenceScore: clamp01(payload.evidenceScore, 0.5),
    proposedAnswer: clean(payload.proposedAnswer, 3000) || null,
    observedAnswer: clean(payload.observedAnswer, 3000) || null,
    negativeSignal: Boolean(payload.negativeSignal || String(payload.sourceType || '').toUpperCase().includes('NEGATIVE')),
    sourceChannelId: clean(payload.sourceChannelId, 30) || null,
    sourceMessageId: clean(payload.sourceMessageId, 30) || null,
    sourceUserId: clean(payload.sourceUserId, 30) || null,
    sourceUserName: clean(payload.sourceUserName, 80) || null,
    createdAt: new Date().toISOString(),
  };

  const include = { reviews: true, approvedArticle: true, targetArticle: true };
  const exact = await prisma.knowledgeCandidate.findUnique({ where: { dedupeKey }, include: { approvedArticle: true } });
  if (exact?.status === 'APPROVED' && exact.approvedArticle) {
    return { skipped: true, reason: 'already_learned', article: exact.approvedArticle };
  }
  if (exact) {
    const nextOccurrence = (exact.occurrenceCount || 1) + 1;
    const reopen = exact.status === 'REJECTED' && shouldReopenRejected(exact, nextOccurrence);
    const sourceExamples = appendExample(exact.sourceExamples, sourceExample);
    const nextAnswer = exact.proposedAnswer || clean(payload.proposedAnswer, 30000) || null;
    const signals = candidateSignals({
      examples: safeJson(sourceExamples, []),
      occurrenceCount: nextOccurrence,
      sourceType: payload.sourceType || exact.sourceType,
      proposedAnswer: clean(payload.proposedAnswer, 30000) || nextAnswer || '',
      existingAnswer: exact.proposedAnswer || '',
      matchScore: exact.matchScore || 0,
    });
    const conflictThreshold = Math.min(0.98, Math.max(0.4, Number(config?.smartLearnConflictThreshold) || 0.70));
    const conflicted = signals.conflictScore >= conflictThreshold;
    const effectiveRisk = conflicted ? 'ADMIN_REQUIRED' : exact.riskLevel;
    const updateData = {
      occurrenceCount: { increment: 1 },
      sourceExamples,
      proposedAnswer: nextAnswer,
      proposedTitle: exact.proposedTitle || clean(payload.proposedTitle, 180) || null,
      sourceDiversity: signals.sourceDiversity,
      negativeSignalCount: signals.negativeSignalCount,
      evidenceScore: signals.evidenceScore,
      learningScore: signals.learningScore,
      conflictScore: Math.max(Number(exact.conflictScore || 0), signals.conflictScore),
      lastSeenAt: new Date(),
      riskLevel: effectiveRisk,
      priorityScore: priorityScoreFor({ ...exact, occurrenceCount: nextOccurrence, riskLevel: effectiveRisk, learningScore: signals.learningScore, conflictScore: signals.conflictScore }),
      ...(conflicted ? { status: 'CONFLICTED', resolutionNote: 'Phát hiện câu trả lời mới mâu thuẫn đáng kể với candidate hiện có; cần Admin kiểm tra' } : {}),
      ...(reopen ? {
        status: conflicted ? 'CONFLICTED' : pendingStatusFor({ ...exact, riskLevel: effectiveRisk }),
        approvalCount: 0,
        rejectionCount: 0,
        reviewedAt: null,
        resolutionNote: conflicted
          ? 'Tự mở lại và phát hiện xung đột nội dung; cần Admin kiểm tra'
          : 'Tự mở lại vì câu hỏi tiếp tục xuất hiện sau lần từ chối trước',
      } : {}),
    };
    const candidate = reopen
      ? await prisma.$transaction(async (tx) => {
        // Phiếu cũ thuộc vòng review trước, phải xóa để không tự động đạt policy khi mở lại.
        await tx.knowledgeReview.deleteMany({ where: { candidateId: exact.id } });
        return tx.knowledgeCandidate.update({ where: { id: exact.id }, data: updateData, include });
      })
      : await prisma.knowledgeCandidate.update({ where: { id: exact.id }, data: updateData, include });
    if (exact.status === 'REJECTED' && !reopen) {
      return { skipped: true, reason: 'recently_rejected', candidate: candidatePublic(candidate) };
    }
    return { candidate: candidatePublic(candidate), created: false, merged: true, exact: true, reopened: reopen };
  }

  const maxPerHour = Math.min(200, Math.max(1, Number(config?.smartLearnMaxCandidatesPerHour) || 30));
  const recentCount = await prisma.knowledgeCandidate.count({
    where: { guildId, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
  if (recentCount >= maxPerHour) return { skipped: true, reason: 'hourly_limit' };

  const threshold = Math.min(0.98, Math.max(0.55, Number(config?.smartLearnDuplicateThreshold) || 0.82));
  const candidates = await prisma.knowledgeCandidate.findMany({
    where: {
      guildId,
      clusterKey,
      status: { in: OPEN_STATUSES },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
    },
    orderBy: { updatedAt: 'desc' },
    take: 150,
  });
  let nearest = null;
  let nearestScore = 0;
  for (const row of candidates) {
    if (payload.intentKey && row.intentKey && payload.intentKey !== row.intentKey) continue;
    const score = tokenSimilarity(normalizedQuestion, row.normalizedQuestion);
    if (score > nearestScore) { nearest = row; nearestScore = score; }
  }
  if (nearest && nearestScore >= threshold) {
    const nextOccurrence = (nearest.occurrenceCount || 1) + 1;
    const sourceExamples = appendExample(nearest.sourceExamples, sourceExample);
    const nextAnswer = nearest.proposedAnswer || clean(payload.proposedAnswer, 30000) || null;
    const signals = candidateSignals({
      examples: safeJson(sourceExamples, []), occurrenceCount: nextOccurrence,
      sourceType: payload.sourceType || nearest.sourceType, proposedAnswer: clean(payload.proposedAnswer, 30000) || nextAnswer || '',
      existingAnswer: nearest.proposedAnswer || '', matchScore: Math.max(nearest.matchScore || 0, nearestScore),
    });
    const conflictThreshold = Math.min(0.98, Math.max(0.4, Number(config?.smartLearnConflictThreshold) || 0.70));
    const conflicted = signals.conflictScore >= conflictThreshold;
    const effectiveRisk = conflicted ? 'ADMIN_REQUIRED' : nearest.riskLevel;
    const candidate = await prisma.knowledgeCandidate.update({
      where: { id: nearest.id },
      data: {
        occurrenceCount: { increment: 1 },
        sourceExamples, proposedAnswer: nextAnswer, lastSeenAt: new Date(),
        sourceDiversity: signals.sourceDiversity, negativeSignalCount: signals.negativeSignalCount,
        evidenceScore: signals.evidenceScore, learningScore: signals.learningScore,
        conflictScore: Math.max(Number(nearest.conflictScore || 0), signals.conflictScore), riskLevel: effectiveRisk,
        priorityScore: priorityScoreFor({ ...nearest, occurrenceCount: nextOccurrence, riskLevel: effectiveRisk, learningScore: signals.learningScore, conflictScore: signals.conflictScore }),
        ...(conflicted ? { status: 'CONFLICTED', resolutionNote: 'Nguồn mới có nội dung mâu thuẫn với candidate gần nhất; cần Admin kiểm tra' } : {}),
      },
      include,
    });
    return { candidate: candidatePublic(candidate), created: false, merged: true, similarity: nearestScore };
  }

  const match = await findBestArticleMatch(prisma, normalizedQuestion, clusterKey, clean(payload.targetArticleId, 40) || null);
  const candidateType = candidateTypeFor(payload, match);
  const riskLevel = payload.riskLevel || riskForIntent(payload.intentKey);
  const proposedAnswer = clean(payload.proposedAnswer, 30000)
    || (['ADD_ALIAS', 'VERIFY_EXISTING'].includes(candidateType) ? clean(match?.article?.content, 30000) : null);
  const proposedTitle = clean(payload.proposedTitle, 180)
    || (match?.article && candidateType !== 'NEW_ARTICLE' ? match.article.title : null);
  const signals = candidateSignals({
    examples: [sourceExample], occurrenceCount: 1, sourceType: payload.sourceType, proposedAnswer: proposedAnswer || '',
    existingAnswer: match?.article?.content || '', matchScore: match?.score || 0,
  });
  const conflictThreshold = Math.min(0.98, Math.max(0.4, Number(config?.smartLearnConflictThreshold) || 0.70));
  const conflicted = signals.conflictScore >= conflictThreshold;
  const effectiveRisk = conflicted ? 'ADMIN_REQUIRED' : riskLevel;
  const priorityScore = priorityScoreFor({
    occurrenceCount: 1, riskLevel: effectiveRisk, sourceType: payload.sourceType, candidateType,
    matchScore: match?.score || 0, learningScore: signals.learningScore, conflictScore: signals.conflictScore,
  });

  try {
    const candidate = await prisma.knowledgeCandidate.create({
      data: {
        dedupeKey,
        guildId,
        clusterKey,
        intentKey: clean(payload.intentKey, 80) || null,
        question,
        normalizedQuestion,
        questionHash,
        proposedTitle,
        proposedAnswer,
        proposedKeywords: clean(payload.proposedKeywords, 1200),
        sourceType: clean(payload.sourceType || 'SMART_MESSAGE', 40),
        sourceTicketId: clean(payload.sourceTicketId, 40) || null,
        sourceChannelId: clean(payload.sourceChannelId, 30) || null,
        sourceMessageId: clean(payload.sourceMessageId, 30) || null,
        sourceUserId: clean(payload.sourceUserId, 30) || null,
        sourceUserName: clean(payload.sourceUserName, 80) || null,
        sourceExamples: JSON.stringify([sourceExample]),
        riskLevel: effectiveRisk,
        status: conflicted ? 'CONFLICTED' : effectiveRisk === 'ADMIN_REQUIRED' ? 'NEEDS_ADMIN' : 'PENDING',
        candidateType,
        targetArticleId: match?.article?.id || null,
        matchScore: match?.score || 0,
        priorityScore,
        learningScore: signals.learningScore,
        evidenceScore: signals.evidenceScore,
        sourceDiversity: signals.sourceDiversity,
        conflictScore: signals.conflictScore,
        negativeSignalCount: signals.negativeSignalCount,
        lastSeenAt: new Date(),
        resolutionNote: conflicted
          ? `Phát hiện xung đột với Knowledge Article: ${match?.article?.title || 'không xác định'}`
          : match ? `Gợi ý từ ${match.source}: ${match.article.title}` : null,
      },
      include,
    });
    return { candidate: candidatePublic(candidate), created: true, merged: false, match: match ? { articleId: match.article.id, score: match.score } : null };
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await prisma.knowledgeCandidate.findUnique({ where: { dedupeKey } });
    if (!raced) throw error;
    const racedExamples = appendExample(raced.sourceExamples, sourceExample);
    const racedOccurrence = (raced.occurrenceCount || 1) + 1;
    const racedSignals = candidateSignals({
      examples: safeJson(racedExamples, []), occurrenceCount: racedOccurrence, sourceType: payload.sourceType || raced.sourceType,
      proposedAnswer: raced.proposedAnswer || clean(payload.proposedAnswer, 30000) || '', existingAnswer: raced.proposedAnswer || '', matchScore: raced.matchScore || 0,
    });
    const candidate = await prisma.knowledgeCandidate.update({
      where: { id: raced.id },
      data: {
        occurrenceCount: { increment: 1 }, sourceExamples: racedExamples, lastSeenAt: new Date(),
        sourceDiversity: racedSignals.sourceDiversity, negativeSignalCount: racedSignals.negativeSignalCount,
        evidenceScore: racedSignals.evidenceScore, learningScore: racedSignals.learningScore,
        conflictScore: Math.max(Number(raced.conflictScore || 0), racedSignals.conflictScore),
        priorityScore: priorityScoreFor({ ...raced, occurrenceCount: racedOccurrence, learningScore: racedSignals.learningScore, conflictScore: racedSignals.conflictScore }),
      },
      include,
    });
    return { candidate: candidatePublic(candidate), created: false, merged: true, exact: true, raced: true };
  }
}

async function uniqueSlug(prisma, candidate) {
  const base = slugify(candidate.proposedTitle || candidate.question).slice(0, 72);
  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? `${base}-${candidate.id.slice(-6)}` : `${base}-${candidate.id.slice(-6)}-${index}`;
    const exists = await prisma.knowledgeArticle.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `smartlearn-${candidate.id}`;
}

function candidateAliases(candidate) {
  const aliasMap = new Map();
  for (const phrase of [candidate.question, ...safeJson(candidate.sourceExamples, []).map((item) => item.question)]) {
    const cleaned = clean(phrase, 1500);
    const normalized = normalizeText(cleaned).slice(0, 1500);
    if (cleaned && normalized && !aliasMap.has(normalized)) aliasMap.set(normalized, cleaned);
  }
  return aliasMap;
}

async function addAliases(tx, articleId, candidate) {
  for (const [normalized, phrase] of candidateAliases(candidate).entries()) {
    await tx.knowledgeAlias.upsert({
      where: { articleId_normalized: { articleId, normalized } },
      create: { articleId, phrase, normalized, weight: 1.0, sourceCandidateId: candidate.id },
      update: { phrase, weight: 1.0, sourceCandidateId: candidate.id },
    });
  }
}

async function publishCandidate(prisma, candidate, reviewer, { reviewIntervalDays = 90 } = {}) {
  const now = new Date();
  const reviewDueAt = new Date(now.getTime() + Math.min(730, Math.max(7, Number(reviewIntervalDays) || 90)) * 24 * 60 * 60_000);
  const target = candidate.targetArticleId
    ? await prisma.knowledgeArticle.findUnique({ where: { id: candidate.targetArticleId } })
    : null;
  const type = candidate.candidateType || 'NEW_ARTICLE';

  if (['ADD_ALIAS', 'VERIFY_EXISTING'].includes(type) && target) {
    return prisma.$transaction(async (tx) => {
      await addAliases(tx, target.id, candidate);
      const verified = type === 'VERIFY_EXISTING';
      const article = await tx.knowledgeArticle.update({
        where: { id: target.id },
        data: {
          // ADD_ALIAS chỉ bổ sung cách diễn đạt, không được tự publish lại bài đang yếu/đã tắt.
          ...(verified ? {
            status: 'PUBLISHED',
            enabled: true,
            lastReviewedAt: now,
            lastReviewedBy: reviewer.reviewerId,
            reviewDueAt,
            qualityScore: Math.min(1, Math.max(0.5, Number(target.qualityScore || 1) + 0.02)),
          } : {}),
          keywords: keywordsFrom(candidate, target.keywords),
        },
      });
      const updated = await tx.knowledgeCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'APPROVED', approvedArticleId: article.id, reviewedAt: now,
          resolutionNote: type === 'ADD_ALIAS' ? 'Đã thêm câu hỏi như alias vào kiến thức hiện có' : 'Đã xác minh kiến thức hiện có',
        },
        include: { reviews: true, approvedArticle: true, targetArticle: true },
      });
      return { candidate: updated, article, operation: type };
    });
  }

  if (type === 'REVISE_ARTICLE' && target) {
    const answer = clean(candidate.proposedAnswer, 30000);
    if (!answer) throw new Error('Câu trả lời sửa đổi đang trống');
    return prisma.$transaction(async (tx) => {
      await tx.knowledgeRevision.create({
        data: {
          articleId: target.id,
          version: target.version,
          snapshot: JSON.stringify(target),
          actorId: reviewer.reviewerId,
          actorName: reviewer.reviewerName,
        },
      });
      const article = await tx.knowledgeArticle.update({
        where: { id: target.id },
        data: {
          title: clean(candidate.proposedTitle || target.title, 180),
          summary: answer.slice(0, 600),
          content: answer,
          keywords: keywordsFrom(candidate, target.keywords),
          version: { increment: 1 },
          status: 'PUBLISHED', enabled: true,
          lastReviewedAt: now, lastReviewedBy: reviewer.reviewerId, reviewDueAt,
          qualityScore: 1,
          updatedBy: reviewer.reviewerId,
        },
      });
      await addAliases(tx, article.id, candidate);
      const updated = await tx.knowledgeCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'APPROVED', approvedArticleId: article.id, reviewedAt: now,
          resolutionNote: 'Đã cập nhật phiên bản kiến thức hiện có',
        },
        include: { reviews: true, approvedArticle: true, targetArticle: true },
      });
      return { candidate: updated, article, operation: type };
    });
  }

  const answer = clean(candidate.proposedAnswer, 30000);
  if (!answer) throw new Error('Câu trả lời đề xuất đang trống');
  const slug = await uniqueSlug(prisma, candidate);
  return prisma.$transaction(async (tx) => {
    const article = await tx.knowledgeArticle.create({
      data: {
        slug,
        title: clean(candidate.proposedTitle || candidate.question, 180),
        summary: answer.slice(0, 600),
        content: answer,
        category: clean(candidate.intentKey || 'smartlearn', 100).toLowerCase(),
        clusterKeys: candidate.clusterKey || '*',
        keywords: keywordsFrom(candidate),
        actions: '[]',
        enabled: true,
        status: 'PUBLISHED',
        sourceLabel: 'IS7MC SmartLearn • Staff verified',
        createdBy: reviewer.reviewerId,
        updatedBy: reviewer.reviewerId,
        lastReviewedAt: now,
        lastReviewedBy: reviewer.reviewerId,
        reviewDueAt,
        qualityScore: 1,
      },
    });
    await addAliases(tx, article.id, candidate);
    const updated = await tx.knowledgeCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'APPROVED', approvedArticleId: article.id, reviewedAt: now,
        resolutionNote: 'Đã tạo Knowledge Article mới',
      },
      include: { reviews: true, approvedArticle: true, targetArticle: true },
    });
    return { candidate: updated, article, operation: 'NEW_ARTICLE' };
  });
}

export async function reviewCandidate(prisma, candidateId, payload) {
  const action = String(payload.action || '').toUpperCase();
  if (!['APPROVE', 'REJECT', 'ALTERNATIVE', 'LINK_EXISTING'].includes(action)) throw new Error('Review action không hợp lệ');
  const reviewerId = clean(payload.reviewerId, 30);
  const reviewerName = clean(payload.reviewerName, 80) || reviewerId;
  if (!reviewerId) throw new Error('Thiếu reviewer');

  const include = { reviews: true, approvedArticle: true, targetArticle: true };
  let candidate = await prisma.knowledgeCandidate.findUnique({ where: { id: candidateId }, include });
  if (!candidate) throw new Error('Candidate không tồn tại');
  if (['APPROVED', 'REJECTED'].includes(candidate.status)) return { candidate: candidatePublic(candidate), final: true, unchanged: true };

  const isAdmin = Boolean(payload.isAdmin);
  const reviewerKind = isAdmin ? 'ADMIN' : 'STAFF';
  const answer = action === 'ALTERNATIVE' ? clean(payload.answer, 30000) : null;
  if (action === 'ALTERNATIVE' && answer.length < 3) throw new Error('Câu trả lời thay thế quá ngắn');
  if (action === 'LINK_EXISTING' && !payload.targetArticleId) throw new Error('Thiếu Knowledge Article để gộp');
  if (action === 'APPROVE' && candidate.candidateType === 'NEW_ARTICLE' && !candidate.proposedAnswer) throw new Error('Chưa có câu trả lời để duyệt');
  if (action === 'APPROVE' && candidate.candidateType === 'REVISE_ARTICLE' && !candidate.proposedAnswer) {
    throw new Error('Candidate revision chỉ chứa tín hiệu lỗi; hãy dùng “Câu trả lời khác” để nhập nội dung đã xác minh trước khi duyệt');
  }

  const candidatePatch = {};
  if (action === 'ALTERNATIVE') {
    candidatePatch.proposedAnswer = answer;
    if (payload.title) candidatePatch.proposedTitle = clean(payload.title, 180);
    if (payload.keywords !== undefined) candidatePatch.proposedKeywords = clean(payload.keywords, 1200);
    if (candidate.targetArticleId) candidatePatch.candidateType = 'REVISE_ARTICLE';
  }
  if (action === 'LINK_EXISTING') {
    const target = await prisma.knowledgeArticle.findUnique({ where: { id: String(payload.targetArticleId) } });
    if (!target) throw new Error('Knowledge Article mục tiêu không tồn tại');
    candidatePatch.targetArticleId = target.id;
    candidatePatch.candidateType = 'ADD_ALIAS';
    candidatePatch.proposedTitle = target.title;
    candidatePatch.proposedAnswer = target.content;
    candidatePatch.matchScore = Math.max(candidate.matchScore || 0, 0.95);
  }
  if (Object.keys(candidatePatch).length) {
    candidate = await prisma.knowledgeCandidate.update({ where: { id: candidate.id }, data: candidatePatch, include });
  }

  await prisma.knowledgeReview.upsert({
    where: { candidateId_reviewerId: { candidateId: candidate.id, reviewerId } },
    create: {
      candidateId: candidate.id, reviewerId, reviewerName, reviewerKind, action,
      answer: action === 'ALTERNATIVE' ? answer : null,
      reason: clean(payload.reason, 1000) || null,
    },
    update: {
      reviewerName, reviewerKind, action,
      answer: action === 'ALTERNATIVE' ? answer : null,
      reason: clean(payload.reason, 1000) || null,
    },
  });

  const reviews = await prisma.knowledgeReview.findMany({ where: { candidateId: candidate.id } });
  const positive = reviews.filter((row) => POSITIVE_REVIEW_ACTIONS.includes(row.action));
  const rejects = reviews.filter((row) => row.action === 'REJECT');
  const adminPositive = positive.filter((row) => row.reviewerKind === 'ADMIN');
  const adminReject = rejects.some((row) => row.reviewerKind === 'ADMIN');
  const config = await prisma.guildConfig.findUnique({ where: { guildId: candidate.guildId } }).catch(() => null);
  const adminRequired = Math.min(5, Math.max(1, Number(config?.smartLearnAdminVotesRequired) || 1));
  const staffRequired = Math.min(10, Math.max(1, Number(config?.smartLearnStaffVotesRequired) || 2));
  const minLearningScore = Math.min(0.95, Math.max(0.2, Number(config?.smartLearnMinLearningScore) || 0.45));
  const minSourceDiversity = Math.min(10, Math.max(1, Number(config?.smartLearnMinSourceDiversity) || 1));
  const conflictThreshold = Math.min(0.98, Math.max(0.4, Number(config?.smartLearnConflictThreshold) || 0.70));
  const qualityGatePassed = Number(candidate.learningScore || 0) >= minLearningScore
    && Number(candidate.sourceDiversity || 1) >= minSourceDiversity;
  const conflictRequiresAdmin = Number(candidate.conflictScore || 0) >= conflictThreshold;
  const qualityRequiresAdmin = !qualityGatePassed || conflictRequiresAdmin;

  if (adminReject) {
    const updated = await prisma.knowledgeCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'REJECTED', rejectionCount: rejects.length, approvalCount: positive.length,
        reviewedAt: new Date(), resolutionNote: clean(payload.reason, 1000) || 'Admin từ chối',
      },
      include,
    });
    return { candidate: candidatePublic(updated), final: true, published: false };
  }

  const needsAdminApproval = candidate.riskLevel === 'ADMIN_REQUIRED' || qualityRequiresAdmin;
  const canPublish = needsAdminApproval
    ? adminPositive.length >= adminRequired
    : adminPositive.length >= adminRequired || positive.length >= staffRequired;

  if (canPublish) {
    const previousStatus = candidate.status;
    const claim = await prisma.knowledgeCandidate.updateMany({
      where: { id: candidate.id, status: { in: OPEN_STATUSES } },
      data: {
        status: 'PUBLISHING',
        approvalCount: positive.length,
        rejectionCount: rejects.length,
      },
    });
    if (claim.count === 0) {
      const current = await prisma.knowledgeCandidate.findUnique({ where: { id: candidate.id }, include });
      return {
        candidate: candidatePublic(current),
        article: current?.approvedArticle || null,
        final: ['APPROVED', 'REJECTED'].includes(current?.status),
        published: current?.status === 'APPROVED',
        unchanged: true,
      };
    }
    candidate = await prisma.knowledgeCandidate.findUnique({ where: { id: candidate.id }, include });
    try {
      const published = await publishCandidate(prisma, candidate, { reviewerId, reviewerName }, { reviewIntervalDays: Number(config?.smartLearnReviewIntervalDays) || 90 });
      return {
        candidate: candidatePublic(published.candidate), article: published.article,
        operation: published.operation, final: true, published: true,
      };
    } catch (error) {
      await prisma.knowledgeCandidate.updateMany({
        where: { id: candidate.id, status: 'PUBLISHING' },
        data: { status: previousStatus },
      }).catch(() => {});
      throw error;
    }
  }

  let status = (candidate.riskLevel === 'ADMIN_REQUIRED' || qualityRequiresAdmin) ? 'NEEDS_ADMIN' : 'PENDING';
  if (conflictRequiresAdmin || (positive.length && rejects.length)) status = 'CONFLICTED';
  else if (rejects.length >= staffRequired) status = 'REJECTED';
  const updated = await prisma.knowledgeCandidate.update({
    where: { id: candidate.id },
    data: {
      status,
      approvalCount: positive.length,
      rejectionCount: rejects.length,
      ...(status === 'REJECTED' ? { reviewedAt: new Date(), resolutionNote: 'Đủ phiếu từ chối' } : {}),
    },
    include,
  });
  return { candidate: candidatePublic(updated), final: ['APPROVED', 'REJECTED'].includes(status), published: false };
}

export async function setCandidateDeliveryRefs(prisma, candidateId, refs) {
  const cleanRefs = (Array.isArray(refs) ? refs : []).slice(0, 30).map((row) => ({
    channelId: clean(row.channelId, 30),
    messageId: clean(row.messageId, 30),
    kind: clean(row.kind, 20),
    userId: clean(row.userId, 30) || null,
  })).filter((row) => row.channelId && row.messageId);
  const candidate = await prisma.knowledgeCandidate.update({
    where: { id: candidateId },
    data: { deliveryRefs: JSON.stringify(cleanRefs) },
    include: { reviews: true, approvedArticle: true, targetArticle: true },
  });
  return candidatePublic(candidate);
}

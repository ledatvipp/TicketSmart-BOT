import { clamp, normalizeText, tokenize } from './text.js';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function articleFeedbackQuality(article = {}) {
  const helpful = Math.max(0, finite(article.helpfulCount));
  const unhelpful = Math.max(0, finite(article.unhelpfulCount));
  const votes = helpful + unhelpful;
  const bayesian = votes ? (helpful + 2) / (votes + 4) : 0.75;
  const configured = finite(article.qualityScore, bayesian);
  // qualityScore vẫn là tín hiệu do staff quản lý; feedback làm mềm để tránh 1 vote làm tụt mạnh.
  return clamp(configured * 0.72 + bayesian * 0.28);
}

export function articleFreshness(article = {}, freshnessDays = 180, now = Date.now()) {
  const source = article.lastReviewedAt || article.updatedAt || article.createdAt;
  if (!source) return 0.75;
  const timestamp = new Date(source).getTime();
  if (!Number.isFinite(timestamp)) return 0.75;
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  const horizon = Math.max(7, finite(freshnessDays, 180));
  if (ageDays <= horizon * 0.5) return 1;
  if (ageDays <= horizon) return clamp(1 - ((ageDays - horizon * 0.5) / (horizon * 0.5)) * 0.18);
  // Sau review horizon, giảm từ từ chứ không loại bỏ kiến thức evergreen.
  return clamp(0.82 * Math.exp(-(ageDays - horizon) / (horizon * 3)), 0.45, 0.82);
}

function tokenOverlap(a = '', b = '') {
  const left = new Set(tokenize(normalizeText(a), { fuzzy: false }));
  const right = new Set(tokenize(normalizeText(b), { fuzzy: false }));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.max(1, Math.min(left.size, right.size));
}

function sourceTopic(article = {}) {
  return [article.category, article.title, article.summary].filter(Boolean).join(' ');
}

export function evidenceScoreForArticle(article = {}, { freshnessDays = 180, now = Date.now() } = {}) {
  const retrieval = clamp(finite(article.score));
  const quality = articleFeedbackQuality(article);
  const freshness = articleFreshness(article, freshnessDays, now);
  const pinnedBonus = article.pinned ? 0.025 : 0;
  const lifecyclePenalty = article.status && article.status !== 'PUBLISHED' ? 0.08 : 0;
  const reviewDueAt = article.reviewDueAt ? new Date(article.reviewDueAt).getTime() : null;
  const reviewOverdue = Number.isFinite(reviewDueAt) && reviewDueAt <= now;
  const reviewPenalty = reviewOverdue ? 0.12 : 0;
  const score = clamp(retrieval * 0.70 + quality * 0.20 + freshness * 0.10 + pinnedBonus - lifecyclePenalty - reviewPenalty);
  return { score, retrieval, quality, freshness, reviewOverdue };
}

/**
 * Đánh giá độ mạnh của bằng chứng trước khi cho AI trả lời.
 * Không dùng model để tự chấm chính nó; score này hoàn toàn deterministic.
 */
export function evaluateKnowledgeEvidence(results = [], {
  minScore = 0.50,
  minTopGap = 0.04,
  freshnessDays = 180,
  now = Date.now(),
} = {}) {
  const rows = (Array.isArray(results) ? results : [])
    .filter(Boolean)
    .map((article) => ({ article, ...evidenceScoreForArticle(article, { freshnessDays, now }) }))
    .sort((a, b) => b.score - a.score);

  if (!rows.length) {
    return {
      sufficient: false,
      confidence: 0,
      evidenceScore: 0,
      topScore: 0,
      topGap: 0,
      ambiguousSources: false,
      reasons: ['no_sources'],
      articleIds: [],
    };
  }

  const top = rows[0];
  const second = rows[1] || null;
  const configuredFloor = clamp(finite(top.article.confidenceFloor, 0.3), 0.05, 0.95);
  const required = Math.max(clamp(finite(minScore, 0.5), 0.2, 0.95), configuredFloor);
  const topGap = second ? Math.max(0, top.score - second.score) : 1;
  const closeSources = Boolean(second && topGap < Math.max(0, finite(minTopGap, 0.04)));
  const topicOverlap = second ? tokenOverlap(sourceTopic(top.article), sourceTopic(second.article)) : 1;
  const differentCategories = Boolean(
    second
    && top.article.category
    && second.article.category
    && normalizeText(top.article.category) !== normalizeText(second.article.category),
  );
  // Chỉ coi là ambiguity nguy hiểm khi hai nguồn gần điểm nhau nhưng nói về topic khác nhau.
  const ambiguousSources = closeSources && (differentCategories || topicOverlap < 0.28);

  let confidence = top.score;
  if (second) confidence = clamp(confidence + Math.min(0.05, topGap * 0.5));
  if (ambiguousSources) confidence = clamp(confidence - 0.12);
  if (top.quality < 0.5) confidence = clamp(confidence - 0.08);
  if (top.freshness < 0.55) confidence = clamp(confidence - 0.05);

  const reasons = [];
  if (top.score < required) reasons.push('weak_top_source');
  if (top.quality < 0.45) reasons.push('low_quality_source');
  if (top.freshness < 0.5) reasons.push('stale_source');
  if (top.reviewOverdue) reasons.push('review_overdue');
  if (ambiguousSources) reasons.push('ambiguous_sources');
  if (!reasons.length) reasons.push('grounded');

  const sufficient = top.score >= required
    && confidence >= required
    && top.quality >= 0.4
    && !top.reviewOverdue
    && !ambiguousSources;

  return {
    sufficient,
    confidence,
    evidenceScore: top.score,
    topScore: top.score,
    topGap,
    requiredScore: required,
    topQuality: top.quality,
    topFreshness: top.freshness,
    ambiguousSources,
    reasons,
    articleIds: rows.slice(0, 4).map((row) => row.article.id).filter(Boolean),
    sourceScores: rows.slice(0, 4).map((row) => ({
      id: row.article.id,
      score: Number(row.score.toFixed(4)),
      retrieval: Number(row.retrieval.toFixed(4)),
      quality: Number(row.quality.toFixed(4)),
      freshness: Number(row.freshness.toFixed(4)),
      reviewOverdue: Boolean(row.reviewOverdue),
    })),
  };
}

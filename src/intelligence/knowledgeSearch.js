import { clamp, ngrams, normalizeText, tokenize } from './text.js';
import { createEmbedding, parseEmbedding } from './embeddingClient.js';

const STOPWORDS = new Set([
  'toi', 'minh', 'ban', 'la', 'bi', 'va', 'co', 'cua', 'cho', 'voi', 'nay', 'do',
  'khi', 'thi', 'mot', 'nhung', 'ma', 'sao', 'vay', 'roi', 'duoc', 'khong',
]);

const SYNONYM_GROUPS = [
  ['mat do', 'mat vat pham', 'mat inventory', 'bay do', 'rollback'],
  ['nap tien', 'thanh toan', 'chuyen khoan', 'mua xu'],
  ['staff', 'helper', 'admin', 'moderator'],
  ['resource pack', 'texture', 'model', 'pack'],
  ['su kien', 'event', 'boss', 'koth'],
  ['claim', 'bao ve dat', 'trust'],
  ['khong vao duoc', 'mat ket noi', 'offline', 'connection'],
  ['cau ca', 'fishing', 'can cau'],
  ['ga', 'chicken', 'trung ga', 'o ga'],
  ['quest', 'nhiem vu'],
  ['mobcoin', 'soul'],
  ['cho dau gia', 'auction', 'ban do'],
  ['dungeon', 'ai', 'boss dungeon'],
];

function uniqueTokens(value) {
  return [...new Set(tokenize(value).filter((token) => !STOPWORDS.has(token)))];
}

export function expandKnowledgeQuery(query) {
  const normalized = normalizeText(query);
  const extras = [];
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) => normalized.includes(normalizeText(term)))) {
      extras.push(...group);
    }
  }
  return normalizeText([normalized, ...extras].join(' '));
}

function weightedCoverage(queryTokens, fieldTokens) {
  if (!queryTokens.length) return 0;
  const frequencies = new Map();
  for (const token of fieldTokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  let matched = 0;
  for (const token of queryTokens) {
    const frequency = frequencies.get(token) || 0;
    if (frequency) matched += 1 + Math.min(0.2, Math.log1p(frequency) * 0.07);
  }
  return clamp(matched / queryTokens.length);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return clamp(dot / (Math.sqrt(normA) * Math.sqrt(normB)), -1, 1);
}

function sparseScore(query, article) {
  const originalQuery = normalizeText(query);
  const expandedQuery = expandKnowledgeQuery(query);
  const queryTokens = uniqueTokens(expandedQuery);
  const title = normalizeText(article.title || '');
  const summary = normalizeText(article.summary || '');
  const category = normalizeText(article.category || '');
  const keywords = normalizeText(article.keywords || '');
  const content = normalizeText(article.content || '');

  let score = 0;
  const reasons = [];
  if (originalQuery.length >= 4 && title.includes(originalQuery)) {
    score += 0.48;
    reasons.push('title_phrase');
  }
  if (originalQuery.length >= 4 && keywords.includes(originalQuery)) {
    score += 0.4;
    reasons.push('keyword_phrase');
  }

  const queryBigrams = new Set(ngrams(originalQuery, 2));
  const titleBigrams = new Set(ngrams(title, 2));
  const keywordBigrams = new Set(ngrams(keywords, 2));
  let phraseHits = 0;
  for (const gram of queryBigrams) {
    if (titleBigrams.has(gram) || keywordBigrams.has(gram)) phraseHits += 1;
  }
  if (queryBigrams.size) {
    const phraseCoverage = phraseHits / queryBigrams.size;
    score += phraseCoverage * 0.18;
    if (phraseCoverage >= 0.5) reasons.push('ordered_phrases');
  }

  const titleCoverage = weightedCoverage(queryTokens, tokenize(title));
  const keywordCoverage = weightedCoverage(queryTokens, tokenize(keywords));
  const summaryCoverage = weightedCoverage(queryTokens, tokenize(summary));
  const categoryCoverage = weightedCoverage(queryTokens, tokenize(category));
  const contentCoverage = weightedCoverage(queryTokens, tokenize(content));

  score += titleCoverage * 0.34;
  score += keywordCoverage * 0.31;
  score += summaryCoverage * 0.17;
  score += categoryCoverage * 0.1;
  score += contentCoverage * 0.17;

  if (titleCoverage >= 0.5) reasons.push('title_tokens');
  if (keywordCoverage >= 0.5) reasons.push('keyword_tokens');
  if (contentCoverage >= 0.5) reasons.push('content_tokens');

  const helpful = Number(article.helpfulCount) || 0;
  const unhelpful = Number(article.unhelpfulCount) || 0;
  const quality = helpful + unhelpful >= 3 ? (helpful + 1) / (helpful + unhelpful + 2) : 0.5;
  score *= 0.94 + quality * 0.12;

  return { score: clamp(score), reasons };
}

export function rankKnowledgeArticles(query, articles, { queryEmbedding = null, limit = 5, threshold = 0.2 } = {}) {
  return (Array.isArray(articles) ? articles : [])
    .filter((article) => article?.enabled !== false)
    .map((article) => {
      const sparse = sparseScore(query, article);
      const semanticRaw = queryEmbedding ? cosineSimilarity(queryEmbedding, parseEmbedding(article.embedding)) : 0;
      const semantic = semanticRaw > 0 ? clamp((semanticRaw - 0.12) / 0.88) : 0;
      const hasSemantic = semantic > 0;
      const score = hasSemantic
        ? clamp(sparse.score * 0.64 + semantic * 0.36)
        : sparse.score;
      return {
        ...article,
        score,
        sparseScore: sparse.score,
        semanticScore: semantic,
        matchReasons: sparse.reasons,
      };
    })
    .filter((article) => article.score >= threshold)
    .sort((a, b) => b.score - a.score || Number(b.version || 0) - Number(a.version || 0))
    .slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
}

export async function searchKnowledge(query, articles, options = {}) {
  let queryEmbedding = null;
  let embeddingError = null;
  if (options.useEmbeddings) {
    try {
      queryEmbedding = (await createEmbedding(expandKnowledgeQuery(query), {
        cache: true,
        timeoutMs: options.timeoutMs || 8000,
        retries: options.retries ?? 2,
      }))?.vector || null;
    } catch (error) {
      embeddingError = error.message;
    }
  }
  const results = rankKnowledgeArticles(query, articles, { ...options, queryEmbedding });
  return { results, embeddingUsed: Boolean(queryEmbedding), embeddingError, expandedQuery: expandKnowledgeQuery(query) };
}

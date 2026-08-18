import { INTENTS, UNKNOWN_INTENT } from './intentCatalog.js';
import { clamp, ngrams, normalizeText, tokenize } from './text.js';

const NEGATIVE_PATTERNS = {
  ITEM_LOSS_DUE_TO_LAG: ['khong mat do', 'khong bi mat', 'do van con', 'chi bi lag'],
  TOPUP_NOT_RECEIVED: ['chua nap', 'khong nap', 'chua thanh toan'],
  PURCHASE_DELIVERY_ERROR: ['chua mua', 'khong mua'],
  STAFF_APPLICATION: ['khong xin staff', 'khong muon lam staff'],
  SERVER_STATUS: ['van vao duoc', 'server van online'],
};

function orderedTokenScore(messageTokens, phraseTokens) {
  if (phraseTokens.length < 2 || messageTokens.length < phraseTokens.length) return 0;
  let cursor = 0;
  let matched = 0;
  for (const token of messageTokens) {
    if (token === phraseTokens[cursor]) {
      matched += 1;
      cursor += 1;
      if (cursor >= phraseTokens.length) break;
    }
  }
  return matched / phraseTokens.length;
}

function phraseScore(text, phrase, weight) {
  if (text === phrase) return 1 * weight;
  if (text.includes(phrase)) return 0.97 * weight;

  const phraseTokens = tokenize(phrase);
  const messageTokens = tokenize(text);
  const phraseSet = new Set(phraseTokens);
  const messageSet = new Set(messageTokens);
  if (!phraseTokens.length) return 0;

  let common = 0;
  for (const token of phraseSet) if (messageSet.has(token)) common += 1;
  const coverage = common / phraseSet.size;
  const precision = common / Math.max(messageSet.size, 1);
  const order = orderedTokenScore(messageTokens, phraseTokens);

  const phraseBigrams = new Set(ngrams(phrase, 2));
  const messageBigrams = new Set(ngrams(text, 2));
  let bigramCommon = 0;
  for (const gram of phraseBigrams) if (messageBigrams.has(gram)) bigramCommon += 1;
  const bigramCoverage = phraseBigrams.size ? bigramCommon / phraseBigrams.size : 0;

  return clamp(coverage * 0.58 + precision * 0.1 + order * 0.18 + bigramCoverage * 0.14) * weight;
}

function groupMatched(text, group, fuzzy = true) {
  return group.some((term) => text.includes(normalizeText(term, { fuzzy })));
}

function splitClauses(message, fuzzy = true) {
  const raw = String(message || '')
    .replace(/\b(?:và|với cả|ngoài ra|thêm nữa|sau đó|rồi còn)\b/gi, '|')
    .replace(/[.!?;,\n]+/g, '|');
  const clauses = raw.split('|').map((part) => normalizeText(part, { fuzzy })).filter((part) => part.length >= 3);
  const whole = normalizeText(message, { fuzzy });
  return [...new Set([whole, ...clauses])].filter(Boolean).slice(0, 8);
}

function applyNegationPenalty(text, intentKey, score) {
  const patterns = NEGATIVE_PATTERNS[intentKey] || [];
  return patterns.some((pattern) => text.includes(pattern)) ? score * 0.22 : score;
}

export function scoreIntent(message, intent, { examples = [], fuzzy = true } = {}) {
  const clauses = splitClauses(message, fuzzy);
  if (!clauses.length) return 0;

  let bestClauseScore = 0;
  for (const text of clauses) {
    let score = 0;
    for (const [phrase, weight = 1] of intent.phrases || []) {
      score = Math.max(score, phraseScore(text, normalizeText(phrase, { fuzzy }), weight));
    }
    for (const example of examples) {
      if (example?.intentKey !== intent.key || !example?.phrase) continue;
      score = Math.max(score, phraseScore(text, normalizeText(example.phrase, { fuzzy }), Number(example.weight) || 0.9));
    }

    const groups = intent.requiredAny || [];
    if (groups.length) {
      const matched = groups.filter((group) => groupMatched(text, group, fuzzy)).length;
      if (matched === groups.length) score += 0.18;
      else if (matched > 0) score += 0.045 * matched;
      else score *= 0.52;
    }

    const tokenCount = tokenize(text).length;
    if (tokenCount <= 2) score *= 0.84;
    score = applyNegationPenalty(text, intent.key, score);
    bestClauseScore = Math.max(bestClauseScore, clamp(score));
  }

  return bestClauseScore;
}

export function classifyAllWithRules(message, { maxIntents = 3, minimum = 0.32, examples = [], fuzzy = true } = {}) {
  const scored = INTENTS
    .map((intent) => ({ intent, confidence: scoreIntent(message, intent, { examples, fuzzy }) }))
    .sort((a, b) => b.confidence - a.confidence);

  const selected = [];
  for (const item of scored) {
    if (item.confidence < minimum) break;
    // Tránh trả về nhiều intent gần như cùng nội dung thanh toán hoặc lịch khi chỉ có một câu đơn.
    const duplicateFamily = selected.some((entry) => {
      const pair = new Set([entry.intent.key, item.intent.key]);
      return (
        pair.has('TOPUP_GUIDE') && pair.has('TOPUP_NOT_RECEIVED')
      ) || (
        pair.has('EVENT_INFO') && (pair.has('BOSS_SCHEDULE') || pair.has('KOTH_SCHEDULE'))
      );
    });
    if (!duplicateFamily) selected.push(item);
    if (selected.length >= Math.max(1, maxIntents)) break;
  }
  return { scored, selected };
}

export function classifyWithRules(message, options = {}) {
  const { scored, selected } = classifyAllWithRules(message, options);
  const best = scored[0] || { intent: UNKNOWN_INTENT, confidence: 0 };
  const second = scored[1]?.confidence || 0;
  const margin = best.confidence - second;

  // Hai intent gần nhau thì confidence giảm để AI hoặc bước hỏi lại xử lý.
  const adjusted = clamp(best.confidence - (margin < 0.1 ? 0.1 - margin : 0));
  const multiIntents = selected
    .filter((item) => item.confidence >= Math.max(0.46, best.confidence - 0.3))
    .map(({ intent, confidence }) => ({
      ...intent,
      confidence: Number(confidence.toFixed(4)),
      source: 'rule',
    }));

  return {
    ...best.intent,
    confidence: Number(adjusted.toFixed(4)),
    rawConfidence: Number(best.confidence.toFixed(4)),
    source: 'rule',
    intents: multiIntents.length ? multiIntents : [{ ...best.intent, confidence: Number(adjusted.toFixed(4)), source: 'rule' }],
    ambiguous: margin < 0.1 && best.confidence >= 0.34,
    alternatives: scored.slice(1, 5).map(({ intent, confidence }) => ({
      key: intent.key,
      label: intent.label,
      emoji: intent.emoji,
      confidence: Number(confidence.toFixed(4)),
    })),
  };
}

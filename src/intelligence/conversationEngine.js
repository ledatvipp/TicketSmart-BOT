import { INTENT_MAP } from './intentCatalog.js';
import { compactText, normalizeText, tokenize } from './text.js';

export function conversationHistory(conversation, maxMessages = 6) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  return messages.slice(-Math.max(2, Math.min(12, Number(maxMessages) || 6))).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: compactText(item.content, 500),
    intentKey: item.intentKey || null,
  }));
}

export function pendingChoicesFromResult(result, limit = 4) {
  const choices = [];
  const add = (item) => {
    const intent = INTENT_MAP.get(item?.key);
    if (!intent || choices.some((choice) => choice.key === intent.key)) return;
    choices.push({
      key: intent.key,
      label: intent.label,
      emoji: intent.emoji || '❓',
      confidence: Number(item.confidence) || 0,
    });
  };

  add(result);
  for (const item of result?.alternatives || []) add(item);
  return choices.slice(0, Math.max(2, Math.min(4, limit)));
}

export function resolvePendingChoice(message, pendingIntents = []) {
  const choices = (Array.isArray(pendingIntents) ? pendingIntents : [])
    .map((item) => ({ ...item, intent: INTENT_MAP.get(item.key) }))
    .filter((item) => item.intent);
  if (!choices.length) return null;

  const normalized = normalizeText(message);
  const ordinal = normalized.match(/^(?:chon\s*|lua chon\s*|cai thu\s*|thu\s*)?([1-4])$/)?.[1];
  if (ordinal) return choices[Number(ordinal) - 1]?.intent || null;

  const ordinalWords = new Map([
    ['dau tien', 0], ['thu nhat', 0], ['cai dau', 0],
    ['thu hai', 1], ['cai thu hai', 1], ['lua chon hai', 1],
    ['thu ba', 2], ['cai thu ba', 2], ['lua chon ba', 2],
    ['thu tu', 3], ['cai thu tu', 3], ['lua chon bon', 3],
    ['cuoi cung', choices.length - 1], ['cai cuoi', choices.length - 1],
  ]);
  if (ordinalWords.has(normalized)) return choices[ordinalWords.get(normalized)]?.intent || null;

  let best = null;
  let bestScore = 0;
  const queryTokens = new Set(tokenize(normalized));
  for (const choice of choices) {
    const haystack = normalizeText(`${choice.key} ${choice.label} ${(choice.intent.optionAliases || []).join(' ')}`);
    if (haystack.includes(normalized) && normalized.length >= 3) return choice.intent;
    const tokens = new Set(tokenize(haystack));
    let common = 0;
    for (const token of queryTokens) if (tokens.has(token)) common += 1;
    const score = common / Math.max(1, queryTokens.size);
    if (score > bestScore) {
      best = choice.intent;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}



export function contextualFollowUpIntent(message, lastIntentKey) {
  const intent = INTENT_MAP.get(lastIntentKey);
  if (!intent) return null;
  const normalized = normalizeText(message);
  if (!normalized || normalized.length > 100) return null;
  const directPatterns = [
    /^(?:con |the |vay )?(?:cai do|viec do|truong hop do)(?: thi sao| nhu the nao| lam sao)?$/,
    /^(?:lam sao|lam the nao|nhu the nao|o dau|lenh gi|bao gio|tai sao|co duoc khong)(?: vay)?$/,
    /^(?:con no|con cai nay|con truong hop nay)(?: thi sao)?$/,
    /^(?:noi ro hon|huong dan chi tiet|chi tiet hon|tiep theo la gi)$/,
  ];
  return directPatterns.some((pattern) => pattern.test(normalized)) ? intent : null;
}

export function contextForRouter(conversation, maxMessages = 6) {
  if (!conversation) return { history: [], pendingIntents: [], lastIntentKey: null };
  return {
    history: conversationHistory(conversation, maxMessages),
    pendingIntents: Array.isArray(conversation.pendingIntents) ? conversation.pendingIntents : [],
    lastIntentKey: conversation.lastIntentKey || null,
    status: conversation.status || 'active',
  };
}

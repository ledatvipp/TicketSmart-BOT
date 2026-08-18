import { classifyWithRules } from './ruleEngine.js';
import { classifyWithAi, isAiConfigured } from './aiClassifier.js';
import { INTENT_MAP, UNKNOWN_INTENT } from './intentCatalog.js';
import { clamp } from './text.js';
import { contextualFollowUpIntent, pendingChoicesFromResult, resolvePendingChoice } from './conversationEngine.js';

function capIntents(result, maxIntents) {
  const intents = (Array.isArray(result.intents) ? result.intents : [result])
    .filter((item) => item?.key && item.key !== UNKNOWN_INTENT.key)
    .slice(0, Math.max(1, maxIntents));
  return { ...result, intents: intents.length ? intents : [result] };
}

function withClarification(result, config) {
  const clarificationEnabled = config.smartClarificationEnabled !== false;
  const threshold = Number(config.smartClarificationThreshold ?? 0.62);
  const shouldClarify = clarificationEnabled && (
    result.needsClarification ||
    result.ambiguous ||
    (result.key !== UNKNOWN_INTENT.key && result.confidence < threshold) ||
    result.key === UNKNOWN_INTENT.key
  );

  if (!shouldClarify) return { ...result, needsClarification: false, clarificationChoices: [] };
  const choices = pendingChoicesFromResult(result, 4);
  return {
    ...result,
    needsClarification: true,
    clarificationQuestion: result.clarificationQuestion || 'Bạn đang cần hỗ trợ về nội dung nào dưới đây?',
    clarificationChoices: choices,
  };
}

function consensus(rule, ai) {
  if (ai.key !== rule.key) return ai;
  const confidence = clamp((ai.confidence * 0.66) + ((rule.rawConfidence || rule.confidence) * 0.34) + 0.04);
  const ruleByKey = new Map((rule.intents || []).map((item) => [item.key, item]));
  const intents = (ai.intents || [ai]).map((item) => {
    const ruleItem = ruleByKey.get(item.key);
    return ruleItem ? { ...item, confidence: clamp(item.confidence * 0.72 + ruleItem.confidence * 0.28) } : item;
  });
  return {
    ...ai,
    confidence,
    source: 'hybrid',
    intents,
    ruleCandidate: rule.key,
    ruleConfidence: rule.confidence,
  };
}

export async function routeIntent(message, config = {}, context = {}) {
  const startedAt = Date.now();
  const ruleThreshold = Number(config.smartRuleThreshold ?? 0.72);
  const aiThreshold = Number(config.smartAiThreshold ?? 0.82);
  const maxIntents = config.smartMultiIntentEnabled === false
    ? 1
    : Math.max(1, Math.min(3, Number(config.smartMaxIntents) || 2));

  const pendingResolution = resolvePendingChoice(message, context.pendingIntents);
  if (pendingResolution) {
    return {
      ...pendingResolution,
      confidence: 1,
      source: 'clarification_reply',
      intents: [{ ...pendingResolution, confidence: 1, source: 'clarification_reply' }],
      needsClarification: false,
      clarificationChoices: [],
      resolvedPendingChoice: true,
      latencyMs: Date.now() - startedAt,
    };
  }

  const rule = capIntents(classifyWithRules(message, { maxIntents, examples: context.trainingExamples || [], fuzzy: config.smartFuzzyMatchingEnabled !== false }), maxIntents);
  const contextualIntent = contextualFollowUpIntent(message, context.lastIntentKey);
  if (contextualIntent && rule.confidence < 0.55) {
    return {
      ...contextualIntent,
      confidence: 0.76,
      source: 'conversation_rule',
      intents: [{ ...contextualIntent, confidence: 0.76, source: 'conversation_rule' }],
      needsClarification: false,
      clarificationChoices: [],
      usedConversationContext: true,
      latencyMs: Date.now() - startedAt,
    };
  }
  const strongRule = rule.confidence >= ruleThreshold && !rule.ambiguous;
  if (strongRule) {
    return {
      ...withClarification(rule, config),
      latencyMs: Date.now() - startedAt,
    };
  }

  if (isAiConfigured(config)) {
    try {
      const ai = capIntents(await classifyWithAi(message, {
        context,
        maxIntents,
        retries: Math.max(0, Math.min(4, Number(config.smartAiRetryCount) || 2)),
        cacheSeconds: Math.max(30, Number(config.smartResponseCacheSeconds) || 300),
        config,
      }), maxIntents);
      const selected = ai.key !== UNKNOWN_INTENT.key && ai.confidence >= aiThreshold
        ? consensus(rule, ai)
        : (rule.confidence >= Math.max(0.5, ai.confidence + 0.08) ? rule : ai);
      return {
        ...withClarification(selected, config),
        alternatives: selected.alternatives || rule.alternatives || [],
        ruleCandidate: rule.key,
        ruleConfidence: rule.confidence,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const fallback = rule.confidence >= 0.42 ? rule : { ...UNKNOWN_INTENT, confidence: rule.confidence, source: 'fallback', intents: [] };
      return {
        ...withClarification(fallback, config),
        source: rule.confidence >= 0.42 ? 'rule_fallback' : 'fallback',
        aiError: error.message,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  const fallback = rule.confidence >= 0.42
    ? { ...rule, source: 'rule_low' }
    : { ...UNKNOWN_INTENT, confidence: rule.confidence, source: 'fallback', alternatives: rule.alternatives, intents: [] };
  return {
    ...withClarification(fallback, config),
    latencyMs: Date.now() - startedAt,
  };
}

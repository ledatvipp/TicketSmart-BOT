import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { normalizeText, tokenize } from '../intelligence/text.js';
import { searchKnowledgeBase } from '../bot/utils/api.js';
import { composeGroundedAnswer } from '../intelligence/groundedAnswer.js';
import { buildActionPlan } from './actionRegistry.js';
import { UNKNOWN_INTENT } from '../intelligence/intentCatalog.js';
import { clusterColor, clusterLabel, clusterPromptContext } from '../clusters/clusterCatalog.js';

function optionScore(option, aliases = []) {
  const haystack = normalizeText(`${option.name || ''} ${option.description || ''}`);
  const optionTokens = new Set(tokenize(haystack));
  let best = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) continue;
    if (haystack === normalizedAlias) best = Math.max(best, 1);
    else if (haystack.includes(normalizedAlias) || normalizedAlias.includes(haystack)) best = Math.max(best, 0.9);
    else {
      const aliasTokens = tokenize(normalizedAlias);
      const common = aliasTokens.filter((token) => optionTokens.has(token)).length;
      best = Math.max(best, common / Math.max(aliasTokens.length, 1) * 0.75);
    }
  }
  return best;
}

export function resolveOptionForIntent(options, intent, clusterKey = null) {
  if (!Array.isArray(options) || !options.length) return null;
  const scopedOptions = options.filter((option) => {
    const scopes = String(option.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
    return !clusterKey || scopes.includes('*') || scopes.includes(clusterKey);
  });
  if (!scopedOptions.length) return null;
  const ranked = scopedOptions
    .map((option) => ({ option, score: optionScore(option, intent.optionAliases || []) }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0]?.score >= 0.45) return ranked[0].option;
  return scopedOptions.find((option) => /ho tro chung|support/i.test(normalizeText(option.name))) || null;
}

function cleanDiscordText(content = '', max = 3600) {
  return String(content)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/@everyone|@here/gi, '@ everyone')
    .trim()
    .slice(0, max);
}

function styleFor(action) {
  if (action.url) return ButtonStyle.Link;
  if (action.style === 'danger') return ButtonStyle.Danger;
  if (action.style === 'secondary') return ButtonStyle.Secondary;
  if (action.style === 'success') return ButtonStyle.Success;
  return ButtonStyle.Primary;
}

function toButton(action) {
  const button = new ButtonBuilder()
    .setLabel(String(action.label || 'Thực hiện').slice(0, 80))
    .setStyle(styleFor(action));
  if (action.url) button.setURL(action.url);
  else button.setCustomId(action.customId);
  if (action.emoji) {
    try { button.setEmoji(action.emoji); } catch { /* emoji không hợp lệ */ }
  }
  return button;
}

function rowsFromButtons(buttons, maxRows = 4) {
  const rows = [];
  for (let i = 0; i < buttons.length && rows.length < maxRows; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

function sourceText(article) {
  if (!article) return null;
  const label = cleanDiscordText(article.sourceLabel || 'Knowledge Base', 80);
  const title = cleanDiscordText(article.title || 'Tài liệu', 140);
  if (article.sourceUrl) return `[${title}](${article.sourceUrl}) • ${label}`;
  return `${title} • ${label}`;
}

function intentList(intent) {
  const items = Array.isArray(intent.intents) && intent.intents.length ? intent.intents : [intent];
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.key || seen.has(item.key) || item.key === UNKNOWN_INTENT.key) return false;
    seen.add(item.key);
    return true;
  }).slice(0, 3);
}

function fallbackBody(intent, intents) {
  if (!intents.length) return intent.response;
  if (intents.length === 1) return intents[0].response;
  return intents.map((item) => `**${item.emoji || '•'} ${item.label}:** ${item.response}`).join('\n\n');
}

function mergeActionPlans(plans) {
  const merged = [];
  const keys = new Set();
  for (const action of plans.flat()) {
    const key = `${action.type}:${action.optionId || action.url || action.channelId || action.customId || ''}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(action);
  }
  return merged.slice(0, 8);
}

function answerPreview(text) {
  return cleanDiscordText(text, 1000) || 'Mình chưa có đủ dữ liệu để trả lời chính xác.';
}

function quickGuide(intent, intents, plan, needsClarification) {
  if (needsClarification) return 'Bấm một lựa chọn ở dưới để mình hiểu đúng vấn đề của bạn.';
  if (plan.some((item) => item.type === 'ticket')) return 'Nếu vẫn chưa rõ, hãy bấm **Tạo ticket** để staff xử lý nhanh hơn.';
  if (intents.length > 1) return 'Bot đã tách nhiều ý trong câu hỏi của bạn. Hãy bấm đúng nút tương ứng bên dưới.';
  return 'Ưu tiên bấm nút ở dưới thay vì đọc quá nhiều chữ.';
}

export async function buildSmartResponse({
  intent, options, detection, userId, query = '', config = {}, guildId, context = {}, cluster = null,
}) {
  const intents = intentList(intent);
  const primaryIntent = intents[0] || intent;
  const option = resolveOptionForIntent(options, primaryIntent, cluster?.key || null);
  let knowledge = { results: [], embeddingUsed: false };
  let grounded = { answer: null, aiUsed: false, sufficient: false, articleIds: [] };

  if (config.smartKnowledgeEnabled !== false && query) {
    const intentHints = intents.flatMap((item) => item.faqTerms || []).slice(0, 8).join(' ');
    const searchQuery = intentHints ? `${query}\n${intentHints}` : query;
    knowledge = await searchKnowledgeBase(searchQuery, {
      limit: config.smartKnowledgeMaxResults || 3,
      threshold: config.smartKnowledgeThreshold ?? 0.3,
      embeddings: true,
      clusterKey: cluster?.key || null,
    });
    if (knowledge.results.length) {
      grounded = await composeGroundedAnswer(query, knowledge.results, config, { context: { ...context, cluster }, intents });
    }
  }

  const evidence = grounded?.evidence || knowledge.evidence || null;
  const primaryArticle = evidence?.sufficient === false ? null : (knowledge.results[0] || null);
  let body = grounded.answer
    ? answerPreview(grounded.answer)
    : answerPreview(fallbackBody(intent, intents));
  if (!grounded.answer && primaryIntent.action === 'SHOW_GUIDE' && !primaryArticle) {
    body += evidence?.sufficient === false
      ? '\n\n_Knowledge Base chưa đủ bằng chứng cho câu hỏi này; nếu vẫn chưa rõ hãy tạo ticket để staff xác nhận._'
      : '\n\n_Nếu bạn vẫn chưa rõ, hãy bấm nút phù hợp ở phía dưới._';
  }
  if (intent.needsClarification) {
    const question = cleanDiscordText(intent.clarificationQuestion || 'Bạn đang cần hỗ trợ về nội dung nào?', 220);
    body = `${question}\n\n${body}`.slice(0, 1100);
  }

  const multi = intents.length > 1;
  const title = intent.needsClarification
    ? '❓ Xác nhận nhanh giúp mình'
    : multi
      ? `🤖 Bot hiểu ${intents.length} nội dung`
      : `${primaryIntent.emoji || '🤖'} ${primaryIntent.label}`;
  const highestPriority = intents.some((item) => item.priority === 'high');

  const plan = intent.needsClarification ? [] : mergeActionPlans(intents.map((item) => {
    const intentOption = resolveOptionForIntent(options, item, cluster?.key || null);
    return buildActionPlan({
      intent: item,
      option: intentOption,
      article: primaryArticle,
      config,
      guildId,
      userId,
      detectionId: detection?.id,
      clusterKey: cluster?.key || null,
    });
  }));

  const embed = new EmbedBuilder()
    .setColor(highestPriority ? 0xff9f43 : primaryIntent.key === UNKNOWN_INTENT.key ? 0x95a5a6 : clusterColor(cluster, 0x5865f2))
    .setAuthor({ name: cluster ? `IS7MC Smart Assistant • ${cluster.name}` : 'IS7MC Smart Assistant' })
    .setTitle(title)
    .setDescription(body)
    .addFields({
      name: '💡 GỢI Ý NHANH',
      value: quickGuide(intent, intents, plan, Boolean(intent.needsClarification)).slice(0, 1024),
      inline: false,
    })
    .setFooter({
      text: `${grounded.aiUsed ? 'Grounded AI' : 'Rule / Knowledge'} • ${Math.round((intent.confidence || 0) * 100)}%${multi ? ' • Multi-intent' : ''}`,
    })
    .setTimestamp();

  if (cluster) {
    embed.addFields({
      name: '🗺️ CỤM ĐANG XỬ LÝ',
      value: `${clusterLabel(cluster)}
${String(cluster.description || '').slice(0, 300)}`.slice(0, 1024),
      inline: false,
    });
  }

  if (multi) {
    embed.addFields({
      name: '🎯 BOT ĐANG HIỂU',
      value: intents.map((item) => `${item.emoji || '•'} **${item.label}** — ${Math.round((item.confidence || 0) * 100)}%`).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  const source = sourceText(primaryArticle);
  if (source) embed.addFields({ name: '📚 NGUỒN', value: source.slice(0, 1024), inline: false });
  if (knowledge.results.length > 1) {
    embed.addFields({
      name: '🧩 TÀI LIỆU LIÊN QUAN',
      value: knowledge.results.slice(1, 4).map((article) => `• ${cleanDiscordText(article.title, 120)}`).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  const rows = rowsFromButtons(plan.map(toButton), 2);

  const clarificationChoices = Array.isArray(intent.clarificationChoices) ? intent.clarificationChoices.slice(0, 4) : [];
  if (intent.needsClarification && detection?.id && clarificationChoices.length && rows.length < 4) {
    rows.push(new ActionRowBuilder().addComponents(
      ...clarificationChoices.map((choice, index) => new ButtonBuilder()
        .setCustomId(`smart:correct:${choice.key}:${userId}:${detection.id}`)
        .setLabel(`${index + 1}. ${String(choice.label || choice.key).slice(0, 65)}`)
        .setEmoji(choice.emoji || '❓')
        .setStyle(ButtonStyle.Secondary)),
    ));
  }

  if (detection?.id && rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`smart:feedback:y:${userId}:${detection.id}`)
        .setLabel('Hữu ích')
        .setEmoji('👍')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`smart:feedback:n:${userId}:${detection.id}`)
        .setLabel('Không đúng')
        .setEmoji('👎')
        .setStyle(ButtonStyle.Secondary),
    ));
  }

  return {
    embeds: [embed],
    components: rows,
    option,
    metadata: {
      clusterKey: cluster?.key || null,
      clusterContext: clusterPromptContext(cluster),
      detectedIntents: intents.map((item) => ({ key: item.key, confidence: item.confidence, source: item.source })),
      needsClarification: Boolean(intent.needsClarification),
      clarificationChoices,
      knowledgeArticleIds: knowledge.results.map((article) => article.id),
      knowledgeScores: knowledge.results.map((article) => ({ id: article.id, score: article.score })),
      embeddingUsed: Boolean(knowledge.embeddingUsed),
      embeddingError: knowledge.embeddingError || null,
      expandedQuery: knowledge.expandedQuery || null,
      answerAiUsed: Boolean(grounded.aiUsed),
      answerCacheHit: Boolean(grounded.cacheHit),
      answerRequestId: grounded.requestId || null,
      answerError: grounded.error || null,
      evidenceScore: evidence?.evidenceScore || 0,
      evidenceConfidence: evidence?.confidence || 0,
      evidenceSufficient: Boolean(evidence?.sufficient),
      evidenceReasons: evidence?.reasons || [],
      actionPlan: plan.map((action) => ({ type: action.type, optionId: action.optionId || null, url: Boolean(action.url) })),
    },
  };
}

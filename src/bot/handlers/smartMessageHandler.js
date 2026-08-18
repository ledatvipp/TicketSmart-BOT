import { routeIntent } from '../../intelligence/intentRouter.js';
import { buildSmartResponse, resolveOptionForIntent } from '../../actions/smartActionHandler.js';
import { contextForRouter } from '../../intelligence/conversationEngine.js';
import { compactText, hasPromptInjectionSignals, normalizeText } from '../../intelligence/text.js';
import {
  getOptions,
  getClusters,
  logIntentDetection,
  updateIntentDetection,
  logActionExecution,
  getSmartConversation,
  saveSmartConversation,
  clearSmartConversation,
  getApprovedTrainingExamples,
} from '../utils/api.js';
import logger from '../utils/logger.js';
import { detectCluster, intentNeedsCluster, mergeClusters } from '../../clusters/clusterCatalog.js';
import { buildClusterPrompt } from '../ui/clusterPrompt.js';
import { queueSmartLearnCandidate } from './smartLearnHandler.js';

const cooldowns = new Map();
const bursts = new Map();
const inFlightMessages = new Set();

function parseIds(csv = '') {
  return String(csv).split(',').map((id) => id.trim()).filter(Boolean);
}

function activeConversation(conversation) {
  return Boolean(conversation && new Date(conversation.expiresAt).getTime() > Date.now());
}

function shouldHandle(message, cfg, conversation) {
  if (!cfg.smartSupportEnabled) return false;
  if (!message.guild || message.author?.bot || message.webhookId) return false;
  if (!message.content || message.content.startsWith('/')) return false;
  if (message.channel?.name && /-\d{4}$/.test(message.channel.name)) return false;

  const mentioned = message.mentions?.has(message.client.user) || false;
  const channels = parseIds(cfg.smartSupportChannelIds);
  const continuing = activeConversation(conversation) && (
    ['awaiting_clarification', 'awaiting_cluster'].includes(conversation.status) ||
    Date.now() - new Date(conversation.updatedAt).getTime() < 5 * 60_000
  );

  if (cfg.smartMentionOnly) return mentioned || continuing;
  if (channels.length) return channels.includes(message.channelId) || mentioned;
  return mentioned || continuing;
}

function consumeCooldown(message, seconds) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (until > now) return false;
  cooldowns.set(key, now + Math.max(2, Number(seconds) || 15) * 1000);

  if (cooldowns.size > 5000) {
    for (const [entryKey, expiry] of cooldowns) if (expiry <= now) cooldowns.delete(entryKey);
  }
  return true;
}

function consumeBurst(message, limit = 8) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const cutoff = now - 60_000;
  const recent = (bursts.get(key) || []).filter((time) => time > cutoff);
  if (recent.length >= Math.max(2, Number(limit) || 8)) {
    bursts.set(key, recent);
    return false;
  }
  recent.push(now);
  bursts.set(key, recent);
  if (bursts.size > 5000) {
    for (const [entryKey, times] of bursts) if (!times.some((time) => time > cutoff)) bursts.delete(entryKey);
  }
  return true;
}

function cleanMessageContent(message) {
  return compactText(String(message.content || '')
    .replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), ' '), 1500);
}

function isConversationCloseMessage(content) {
  const text = normalizeText(content);
  return [
    'cam on', 'cam on bot', 'ok cam on', 'duoc roi', 'hieu roi', 'xong roi',
    'khong can nua', 'thoi khong can', 'bye', 'tam biet',
  ].some((phrase) => text === phrase || text.startsWith(`${phrase} `));
}

function assistantTextFromPayload(payload) {
  const embed = payload?.embeds?.[0]?.data || payload?.embeds?.[0];
  return compactText(embed?.description || embed?.title || 'Đã phản hồi yêu cầu hỗ trợ.', 1800);
}

async function safeReply(message, payload) {
  try {
    return await message.reply({ ...payload, allowedMentions: { repliedUser: false } });
  } catch (error) {
    logger.warn('Không reply được, thử gửi trực tiếp:', error.message);
    return message.channel.send({ ...payload, allowedMentions: { parse: [] } });
  }
}

export async function handleSmartMessage(message, cfg) {
  if (!cfg.smartSupportEnabled || !message.guild || message.author?.bot || message.webhookId) return false;
  if (inFlightMessages.has(message.id)) return true;

  const conversationEnabled = cfg.smartConversationEnabled !== false;
  const conversation = conversationEnabled
    ? await getSmartConversation({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      limit: cfg.smartMaxContextMessages || 6,
    })
    : null;

  if (!shouldHandle(message, cfg, conversation)) return false;
  const content = cleanMessageContent(message);
  if (!content) return false;

  if (isConversationCloseMessage(content) && activeConversation(conversation)) {
    await clearSmartConversation({ guildId: message.guildId, channelId: message.channelId, userId: message.author.id });
    await message.react('👍').catch(() => {});
    return true;
  }

  const pending = ['awaiting_clarification', 'awaiting_cluster'].includes(conversation?.status);
  if (content.length < 3 && !pending && !/^[1-4]$/.test(content)) return false;
  if (!consumeBurst(message, cfg.smartBurstLimitPerMinute)) {
    await message.reply({
      content: '⏳ Bạn đang gửi câu hỏi quá nhanh. Hãy gộp nội dung vào một tin nhắn và thử lại sau ít phút.',
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return true;
  }
  if (!consumeCooldown(message, pending ? 2 : cfg.smartCooldownSeconds)) return false;

  inFlightMessages.add(message.id);
  try {
    await message.channel.sendTyping().catch(() => {});
    const routerContext = contextForRouter(conversation, cfg.smartMaxContextMessages || 6);
    const [trainingExamples, clusterRows] = await Promise.all([
      getApprovedTrainingExamples(),
      getClusters().catch(() => []),
    ]);
    const clusters = mergeClusters(clusterRows);
    const clusterResolution = detectCluster(content, {
      clusters,
      channelId: message.channelId,
      channelMap: cfg.smartClusterChannelMap,
      conversationClusterKey: conversation?.clusterKey || conversation?.context?.clusterKey || null,
      defaultClusterKey: cfg.smartDefaultClusterKey || null,
    });
    const cluster = clusterResolution.cluster;
    routerContext.trainingExamples = trainingExamples;
    routerContext.cluster = cluster;
    const [intent, options] = await Promise.all([
      routeIntent(content, cfg, routerContext),
      getOptions().catch((error) => {
        logger.warn('Không tải được options, Smart Assistant tiếp tục không có ticket button:', error.message);
        return [];
      }),
    ]);
    const option = resolveOptionForIntent(options, intent, cluster?.key || null);
    const awaitingCluster = cfg.smartRequireCluster !== false && intentNeedsCluster(intent) && !cluster;

    const metadataBase = {
      alternatives: intent.alternatives || [],
      detectedIntents: (intent.intents || []).map((item) => ({ key: item.key, confidence: item.confidence, source: item.source })),
      needsClarification: Boolean(intent.needsClarification),
      clarificationChoices: intent.clarificationChoices || [],
      aiReason: intent.aiReason || null,
      aiError: intent.aiError || null,
      requestId: intent.requestId || null,
      aiAttempts: intent.aiAttempts || null,
      promptInjectionSignals: hasPromptInjectionSignals(content),
      conversationId: conversation?.id || null,
      clusterKey: cluster?.key || null,
      clusterSource: clusterResolution.source,
      clusterConfidence: clusterResolution.confidence,
      awaitingCluster,
    };
    const detection = await logIntentDetection({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      userId: message.author.id,
      content,
      intentKey: intent.key,
      confidence: intent.confidence || 0,
      source: intent.source || 'fallback',
      action: intent.action,
      optionId: option?.id || null,
      clusterKey: cluster?.key || null,
      latencyMs: intent.latencyMs || 0,
      metadata: metadataBase,
    });

    const payload = awaitingCluster
      ? buildClusterPrompt({
        clusters,
        userId: message.author.id,
        detectionId: detection?.id || 'none',
        reason: 'Câu hỏi này phụ thuộc cơ chế từng cụm. Chọn đúng cụm để bot không trả lời nhầm lệnh, vật phẩm hoặc tiến trình.',
      })
      : await buildSmartResponse({
        intent,
        options,
        detection,
        userId: message.author.id,
        query: content,
        config: cfg,
        guildId: message.guildId,
        context: routerContext,
        cluster,
      });

    const combinedMetadata = { ...metadataBase, ...(payload.metadata || {}) };
    if (detection?.id) {
      await updateIntentDetection(detection.id, {
        status: awaitingCluster ? 'awaiting_cluster' : intent.needsClarification ? 'awaiting_clarification' : 'responded',
        optionId: payload.option?.id || null,
        metadata: combinedMetadata,
      });
    }

    const { metadata: _metadata, option: _option, ...discordPayload } = payload;
    await safeReply(message, discordPayload);

    const articleIds = combinedMetadata.knowledgeArticleIds || [];
    const candidateThreshold = Number(cfg.smartLearnCandidateConfidence) || 0.70;
    const shouldQueueKnowledge = cfg.smartLearnEnabled
      && !awaitingCluster
      && !combinedMetadata.promptInjectionSignals
      && (
        articleIds.length === 0
        || intent.needsClarification
        || intent.key === 'UNKNOWN_SUPPORT'
        || Number(intent.confidence || 0) < candidateThreshold
      );
    if (shouldQueueKnowledge) {
      const hasUsefulProposal = !intent.needsClarification && intent.key !== 'UNKNOWN_SUPPORT';
      const queued = await queueSmartLearnCandidate({
        client: message.client,
        guild: message.guild,
        config: cfg,
        clusters,
        payload: {
          clusterKey: cluster?.key || null,
          intentKey: intent.key,
          question: content,
          proposedTitle: `${cluster?.name ? `${cluster.name} • ` : ''}${intent.label || 'Câu hỏi hỗ trợ'}`,
          proposedAnswer: hasUsefulProposal ? assistantTextFromPayload(payload) : null,
          proposedKeywords: (intent.faqTerms || []).join(','),
          sourceType: 'SMART_MESSAGE',
          candidateType: articleIds.length ? 'VERIFY_EXISTING' : 'NEW_ARTICLE',
          targetArticleId: articleIds[0] || null,
          sourceChannelId: message.channelId,
          sourceMessageId: message.id,
          sourceUserId: message.author.id,
          sourceUserName: message.author.username,
        },
      });
      if (queued?.candidate && cfg.smartLearnNotifyUser !== false) {
        await message.react('📚').catch(() => {});
      }
    }

    if (conversationEnabled) {
      await saveSmartConversation({
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        status: awaitingCluster ? 'awaiting_cluster' : intent.needsClarification ? 'awaiting_clarification' : 'active',
        context: {
          lastSource: intent.source,
          lastConfidence: intent.confidence,
          lastArticleIds: combinedMetadata.knowledgeArticleIds || [],
          clusterKey: cluster?.key || null,
        },
        pendingIntents: intent.needsClarification ? (intent.clarificationChoices || []) : [],
        clusterKey: cluster?.key || null,
        lastIntentKey: intent.key,
        lastDetectionId: detection?.id || null,
        ttlMinutes: cfg.smartConversationTtlMinutes || 15,
        maxMessages: cfg.smartMaxContextMessages || 6,
        messages: [
          { role: 'user', content, intentKey: intent.key, metadata: { messageId: message.id } },
          { role: 'assistant', content: assistantTextFromPayload(payload), intentKey: intent.key, metadata: { detectionId: detection?.id || null } },
        ],
      });
    }

    await logActionExecution({
      detectionId: detection?.id || null,
      actionName: awaitingCluster ? 'ASK_CLUSTER' : intent.needsClarification ? 'ASK_CLARIFICATION' : 'SMART_RESPONSE',
      userId: message.author.id,
      guildId: message.guildId,
      channelId: message.channelId,
      clusterKey: cluster?.key || null,
      status: 'completed',
      input: { intent: intent.key, source: intent.source, awaitingCluster, multiIntents: combinedMetadata.detectedIntents || [] },
      result: { articleIds: combinedMetadata.knowledgeArticleIds || [], actions: combinedMetadata.actionPlan || [] },
      latencyMs: intent.latencyMs || 0,
    });
    return true;
  } catch (error) {
    logger.error('Smart Assistant lỗi:', error.message);
    await message.reply({
      content: '⚠️ Mình đang gặp lỗi tạm thời. Bạn vẫn có thể tạo ticket hỗ trợ hoặc thử hỏi lại sau.',
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return false;
  } finally {
    inFlightMessages.delete(message.id);
  }
}

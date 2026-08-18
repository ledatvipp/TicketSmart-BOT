import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { routeIntent } from '../../intelligence/intentRouter.js';
import { composeGroundedAnswer } from '../../intelligence/groundedAnswer.js';
import { evaluateKnowledgeEvidence } from '../../intelligence/evidenceQuality.js';
import { mergeTicketTags, shouldRaisePriority, triageTicketIssue } from '../../intelligence/ticketTriage.js';
import { searchKnowledgeBase } from '../utils/api.js';
import {
  getApprovedTrainingExamples,
  getClusters,
  getTicketAiContext,
  logActionExecution,
  logIntentDetection,
  updateIntentDetection,
  updateTicketWorkflow,
} from '../utils/api.js';
import {
  compactChecklistForIntent,
  safetyForIntent,
  ticketAiDecision,
} from '../../tickets/ticketAssistantPolicy.js';
import { refreshTicketPanel } from './ticketPanel.js';
import logger from '../utils/logger.js';
import { invalidate } from '../utils/ticketCache.js';
import { clusterColor, clusterLabel, getDefaultCluster, mergeClusters } from '../../clusters/clusterCatalog.js';
import { queueSmartLearnCandidate } from './smartLearnHandler.js';

const inFlight = new Set();

function clean(value, max = 650) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/@everyone|@here/gi, '@ everyone')
    .trim()
    .slice(0, max);
}

function articleSource(article) {
  if (!article) return null;
  const title = clean(article.title || 'Tài liệu nội bộ', 100);
  if (article.sourceUrl) return `[${title}](${article.sourceUrl})`;
  return title;
}

function fallbackGuide(intent, article, maxChars) {
  const text = [article?.summary, intent?.response].filter(Boolean).join('\n');
  return clean(text || 'Mình chưa có đủ dữ liệu để trả lời chắc chắn.', maxChars);
}

function issueSummary(content, intent) {
  const label = intent?.label || 'Yêu cầu hỗ trợ';
  return clean(`**${label}:** ${String(content || '').replace(/\s+/g, ' ')}`, 700);
}

function panelRows({ userId, detectionId, sensitive, clarificationChoices = [] }) {
  const rows = [];
  if (clarificationChoices.length) {
    rows.push(new ActionRowBuilder().addComponents(
      ...clarificationChoices.slice(0, 4).map((choice, index) => new ButtonBuilder()
        .setCustomId(`ticket_ai_choice:${choice.key}:${userId}:${detectionId}`)
        .setLabel(`${index + 1}. ${String(choice.label || choice.key).slice(0, 65)}`)
        .setEmoji(choice.emoji || '❓')
        .setStyle(ButtonStyle.Secondary)),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_ai_resolved:${userId}:${detectionId}`)
      .setLabel('Đã giải quyết')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_ai_human:${userId}:${detectionId}`)
      .setLabel(sensitive ? 'Chuyển Staff' : 'Cần Staff')
      .setEmoji('🆘')
      .setStyle(sensitive ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_ai_ask:${userId}`)
      .setLabel('Hỏi câu khác')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_ai_pause_user:${userId}`)
      .setLabel('Tắt gợi ý AI')
      .setEmoji('🔕')
      .setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function upsertAiPanel(channel, ticket, payload, cfg) {
  let existing = null;
  if (ticket.aiPanelMessageId) {
    existing = await channel.messages.fetch(ticket.aiPanelMessageId).catch(() => null);
  }
  if (existing && cfg.ticketAiPanelMode !== false) {
    await existing.edit(payload);
    return existing;
  }
  const sent = await channel.send(payload);
  return sent;
}

function escalationRoleIds(config, cluster) {
  const ids = [config.smartEscalationRoleId, ...(Array.isArray(cluster?.staffRoleIds) ? cluster.staffRoleIds : String(cluster?.staffRoleIds || '').split(','))]
    .map((id) => String(id || '').trim()).filter((id) => /^\d{15,22}$/.test(id));
  return [...new Set(ids)].slice(0, 10);
}

async function maybeAutoEscalate(channel, ticket, config, cluster, triage) {
  if (config.ticketAiAutoEscalateSensitive !== true || !triage?.needsHuman) return null;
  const previous = ticket.lastEscalatedAt ? new Date(ticket.lastEscalatedAt).getTime() : 0;
  if (previous && Date.now() - previous < 30 * 60_000) return null;
  const roleIds = escalationRoleIds(config, cluster);
  if (!roleIds.length) return null;
  const reason = clean(triage.escalationReason || triage.summary || 'Ticket cần staff kiểm tra', 300);
  await channel.send({
    content: `${roleIds.map((id) => `<@&${id}>`).join(' ')} 🚨 **AI triage cần người xử lý:** ${reason}`,
    allowedMentions: { roles: roleIds },
  });
  return new Date().toISOString();
}

export async function answerTicketQuestion({ channel, user, ticket, content, config, sourceMessageId = null, explicit = false }) {
  const key = `${channel.id}:${user.id}`;
  if (inFlight.has(key)) return { handled: false, reason: 'in_flight' };
  inFlight.add(key);
  const startedAt = Date.now();
  try {
    if (config.ticketRequireCluster !== false && !ticket.clusterKey) return { handled: false, reason: 'cluster_required' };
    const [trainingExamples, clusterRows, aiContext] = await Promise.all([
      getApprovedTrainingExamples(),
      getClusters().catch(() => []),
      getTicketAiContext(channel.id, Number(config.ticketAiContextMessages) || 8),
    ]);
    const history = (Array.isArray(aiContext?.history) ? aiContext.history : [])
      .filter((item) => !sourceMessageId || item.messageId !== sourceMessageId)
      .slice(-(Number(config.ticketAiContextMessages) || 8));
    const ticketMemory = clean(aiContext?.ticket?.aiSummary || ticket.aiSummary || '', 700);
    const clusters = mergeClusters(clusterRows);
    const cluster = clusters.find((item) => item.key === ticket.clusterKey) || getDefaultCluster(ticket.clusterKey);
    const routerConfig = {
      ...config,
      smartClarificationEnabled: true,
      smartMaxIntents: 1,
      smartMultiIntentEnabled: false,
      smartAiThreshold: Math.max(Number(config.ticketAiMinConfidence) || 0.78, Number(config.smartAiThreshold) || 0.82),
    };
    const intent = await routeIntent(content, routerConfig, {
      lastIntentKey: ticket.aiLastIntent || null,
      pendingIntents: [],
      history,
      trainingExamples,
      cluster,
    });
    const detection = await logIntentDetection({
      guildId: channel.guildId,
      channelId: channel.id,
      messageId: sourceMessageId,
      userId: user.id,
      content,
      intentKey: intent.key,
      confidence: intent.confidence || 0,
      source: `ticket_${intent.source || 'fallback'}`,
      action: intent.action || 'SHOW_GUIDE',
      optionId: ticket.optionId || null,
      clusterKey: cluster?.key || ticket.clusterKey || null,
      latencyMs: intent.latencyMs || 0,
      metadata: { ticketId: ticket.id, ticketNum: ticket.ticketNum, explicit },
    });

    const safety = safetyForIntent(intent.key, config);
    const maxChars = Math.max(240, Math.min(1200, Number(config.ticketAiMaxAnswerChars) || 650));
    let knowledge = { results: [] };
    if (config.smartKnowledgeEnabled !== false) {
      knowledge = await searchKnowledgeBase(`${content}\n${(intent.faqTerms || []).join(' ')}`, {
        limit: Math.min(3, Number(config.smartKnowledgeMaxResults) || 3),
        threshold: Number(config.smartKnowledgeThreshold) || 0.3,
        embeddings: true,
        clusterKey: cluster?.key || ticket.clusterKey || null,
      });
    }
    const evidence = evaluateKnowledgeEvidence(knowledge.results || [], {
      minScore: Number(config.smartEvidenceMinScore) || 0.50,
      minTopGap: Number(config.smartEvidenceMinTopGap) || 0.04,
      freshnessDays: Number(config.smartKnowledgeFreshnessDays) || 180,
    });
    knowledge.evidence = evidence;
    const article = evidence.sufficient ? (knowledge.results?.[0] || null) : null;
    let answer = '';
    let grounded = null;

    const confident = (intent.confidence || 0) >= (Number(config.ticketAiMinConfidence) || 0.78);
    const needsClarification = Boolean(intent.needsClarification || !confident || intent.key === 'UNKNOWN_SUPPORT');

    if (!needsClarification && !safety.humanRequired && article) {
      grounded = await composeGroundedAnswer(content, knowledge.results, {
        ...config,
        smartAnswerMaxChars: maxChars,
      }, { intents: [intent], context: { cluster, history, ticketSummary: ticketMemory } });
      answer = clean(grounded.answer, maxChars);
    } else if (!needsClarification && !safety.humanRequired && intent.key !== 'UNKNOWN_SUPPORT') {
      // Rule response is allowed; weak KB content is deliberately not exposed as an answer.
      answer = fallbackGuide(intent, null, maxChars);
    }

    const triage = await triageTicketIssue({ content, intent, cluster, evidence, history, ticketSummary: ticketMemory, config });
    const triageThreshold = Number(config.ticketAiTriageMinConfidence) || 0.75;
    const triageTrusted = Number(triage.confidence || 0) >= triageThreshold;
    const humanRequired = Boolean(safety.humanRequired || triage.needsHuman);
    const checklist = triage.missingInfo?.length ? triage.missingInfo : compactChecklistForIntent(intent.key);
    const title = needsClarification
      ? '❓ Xác nhận nhanh'
      : humanRequired
        ? '🛡️ Đã triage • Cần Staff'
        : '🤖 Trả lời nhanh';
    const description = needsClarification
      ? 'Mình chưa đủ chắc để hướng dẫn. Hãy bấm đúng lựa chọn bên dưới.'
      : safety.humanRequired
        ? clean(intent.response || 'AI đã thu thập thông tin và chuyển Staff kiểm tra.', 320)
        : answer || (evidence.sufficient === false
          ? 'Knowledge Base chưa đủ bằng chứng để AI trả lời chắc chắn. Mình đã ghi nhận và chuyển nội dung cho staff kiểm tra.'
          : fallbackGuide(intent, null, maxChars));

    const embed = new EmbedBuilder()
      .setColor(humanRequired ? 0xf39c12 : needsClarification ? 0x95a5a6 : clusterColor(cluster, 0x5865f2))
      .setAuthor({ name: cluster ? `IS7MC Ticket AI • ${cluster.name}` : 'IS7MC Ticket AI' })
      .setTitle(title)
      .setDescription(clean(description, maxChars + 160))
      .addFields({
        name: '🎯 BOT ĐANG HIỂU',
        value: [
          `• **Cụm:** ${clusterLabel(cluster)}`,
          `• **Vấn đề:** ${clean(intent.label || intent.key, 80)}`,
          `• **Intent:** ${Math.round((intent.confidence || 0) * 100)}%`,
          `• **Evidence:** ${Math.round((evidence.evidenceScore || 0) * 100)}%`,
          `• **Triage:** ${Math.round((triage.confidence || 0) * 100)}%`,
        ].join('\n').slice(0, 1024),
        inline: false,
      })
      .setFooter({ text: humanRequired ? 'AI triage + evidence gate • Staff quyết định' : 'Grounded support • Bấm nút để tiếp tục' })
      .setTimestamp();

    if (humanRequired && checklist.length) {
      embed.addFields({
        name: '📝 GỬI THÊM CHO STAFF',
        value: checklist.slice(0, 5).map((item) => `• ${item}`).join('\n').slice(0, 1024),
        inline: false,
      });
    } else if (!needsClarification) {
      embed.addFields({
        name: '⚡ THAO TÁC NHANH',
        value: 'Đã ổn thì bấm **Đã giải quyết**. Cần người thật thì bấm **Cần Staff**.',
        inline: false,
      });
    }
    const source = articleSource(article);
    if (source && !needsClarification) embed.addFields({ name: '📚 NGUỒN', value: source, inline: false });

    const choices = Array.isArray(intent.clarificationChoices) ? intent.clarificationChoices : [];
    const payload = {
      embeds: [embed],
      components: panelRows({
        userId: user.id,
        detectionId: detection?.id || 'none',
        sensitive: humanRequired,
        clarificationChoices: needsClarification ? choices : [],
      }),
      allowedMentions: { parse: [] },
    };
    const panel = await upsertAiPanel(channel, ticket, payload, config);
    const escalatedAt = await maybeAutoEscalate(channel, ticket, config, cluster, triage).catch((error) => {
      logger.warn(`Ticket AI escalation failed: ${error.message}`);
      return null;
    });
    const workflowPatch = {
      aiPanelMessageId: panel.id,
      incrementAiReplyCount: true,
      aiLastIntent: intent.key,
      aiLastReplyAt: new Date().toISOString(),
      aiSummary: config.ticketAiAutoSummary === false ? undefined : (triage.summary || issueSummary(content, intent)),
      aiTriage: triage,
      aiTriageConfidence: Number(triage.confidence || 0),
      aiEvidenceScore: Number(evidence.evidenceScore || 0),
      aiNeedsHuman: humanRequired,
      aiMissingInfo: Array.isArray(triage.missingInfo) ? triage.missingInfo : [],
      aiLastTriageAt: new Date().toISOString(),
      workflowStatus: humanRequired ? 'waiting_staff' : 'ai_assisting',
      ...(escalatedAt ? { lastEscalatedAt: escalatedAt } : {}),
    };
    if (triageTrusted && config.ticketAiAutoPriority !== false && shouldRaisePriority(ticket.priority, triage.priority)) {
      workflowPatch.priority = triage.priority;
    }
    if (triageTrusted && config.ticketAiAutoTags !== false && Array.isArray(triage.tags) && triage.tags.length) {
      workflowPatch.tags = mergeTicketTags(ticket.tags || '', triage.tags);
    }
    const updated = await updateTicketWorkflow(channel.id, workflowPatch);
    invalidate(channel.id);
    await updateIntentDetection(detection?.id, {
      status: needsClarification ? 'awaiting_clarification' : humanRequired ? 'human_required' : 'ticket_ai_answered',
      metadata: {
        ticketId: ticket.id,
        clusterKey: cluster?.key || ticket.clusterKey || null,
        knowledgeArticleIds: knowledge.results?.map((item) => item.id) || [],
        groundedAiUsed: Boolean(grounded?.aiUsed),
        evidenceScore: evidence.evidenceScore || 0,
        evidenceSufficient: Boolean(evidence.sufficient),
        evidenceReasons: evidence.reasons || [],
        triage: { priority: triage.priority, tags: triage.tags, needsHuman: triage.needsHuman, confidence: triage.confidence },
        sensitive: safety.sensitive,
      },
    });
    await logActionExecution({
      detectionId: detection?.id || null,
      actionName: humanRequired ? 'TICKET_AI_TRIAGE' : 'TICKET_AI_RESPONSE',
      userId: user.id,
      guildId: channel.guildId,
      channelId: channel.id,
      clusterKey: cluster?.key || ticket.clusterKey || null,
      status: 'completed',
      input: { ticketId: ticket.id, intent: intent.key, explicit },
      result: { panelMessageId: panel.id, sensitive: safety.sensitive, articleId: article?.id || null, evidenceScore: evidence.evidenceScore || 0, triageConfidence: triage.confidence || 0, humanRequired },
      latencyMs: Date.now() - startedAt,
    });

    const candidateThreshold = Number(config.smartLearnCandidateConfidence) || 0.70;
    if (config.smartLearnEnabled && (
      !evidence.sufficient || needsClarification || Number(intent.confidence || 0) < candidateThreshold
    )) {
      await queueSmartLearnCandidate({
        client: channel.client,
        guild: channel.guild,
        config,
        clusters,
        payload: {
          clusterKey: cluster?.key || ticket.clusterKey || null,
          intentKey: intent.key,
          question: content,
          proposedTitle: `${cluster?.name ? `${cluster.name} • ` : ''}${intent.label || 'Câu hỏi trong ticket'}`,
          proposedAnswer: needsClarification ? null : clean(description, 3000),
          proposedKeywords: (intent.faqTerms || []).join(','),
          sourceType: 'TICKET_AI',
          candidateType: evidence.sufficient && article ? 'VERIFY_EXISTING' : 'NEW_ARTICLE',
          targetArticleId: evidence.sufficient ? article?.id || null : null,
          sourceTicketId: ticket.id,
          sourceChannelId: channel.id,
          sourceMessageId,
          sourceUserId: user.id,
          sourceUserName: user.username,
          sourceConfidence: Number(intent.confidence || 0),
          evidenceScore: Number(evidence.evidenceScore || 0),
          negativeSignal: false,
        },
      });
    }
    await refreshTicketPanel(channel, updated || ticket);
    return { handled: true, intent, detection, panel, safety, triage, evidence };
  } catch (error) {
    logger.warn('Ticket AI không thể trả lời:', error.message);
    await logActionExecution({
      actionName: 'TICKET_AI_RESPONSE',
      userId: user.id,
      guildId: channel.guildId,
      channelId: channel.id,
      status: 'failed',
      input: { ticketId: ticket?.id },
      error: error.message,
      latencyMs: Date.now() - startedAt,
    }).catch(() => {});
    return { handled: false, reason: 'error', error };
  } finally {
    inFlight.delete(key);
  }
}

export async function handleTicketSmartMessage(message, ticket, config) {
  const mentioned = message.mentions?.has(message.client.user) || false;
  const decision = ticketAiDecision({ message, ticket, config, botMentioned: mentioned });
  if (!decision.allow) return false;
  await message.channel.sendTyping().catch(() => {});
  const result = await answerTicketQuestion({
    channel: message.channel,
    user: message.author,
    ticket,
    content: String(message.content || '').replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), ' ').trim(),
    config,
    sourceMessageId: message.id,
    explicit: decision.explicit,
  });
  return Boolean(result.handled);
}

import { EmbedBuilder, MessageFlags } from 'discord.js';
import {
  getOptions,
  getClusters,
  getConfig,
  sendSmartFeedback,
  updateIntentDetection,
  getIntentDetection,
  logActionExecution,
  getSmartConversation,
  saveSmartConversation,
} from '../utils/api.js';
import { createTicket } from './ticketManager.js';
import { showFormModal } from './formModalHandler.js';
import { getOptionFormFields, isComplexForm } from '../utils/formFields.js';
import { startFormWizard } from './formWizardHandler.js';
import { INTENT_MAP } from '../../intelligence/intentCatalog.js';
import { buildSmartResponse, resolveOptionForIntent } from '../../actions/smartActionHandler.js';
import { contextForRouter } from '../../intelligence/conversationEngine.js';
import { getDefaultCluster, mergeClusters } from '../../clusters/clusterCatalog.js';
import { queueSmartLearnCandidate } from './smartLearnHandler.js';

function assertOwner(interaction, expectedUserId) {
  if (interaction.user.id !== expectedUserId) {
    interaction.reply({
      content: '❌ Nút này thuộc yêu cầu hỗ trợ của người khác. Hãy gửi câu hỏi của bạn để bot tạo lựa chọn riêng.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return false;
  }
  return true;
}

async function recordAction(interaction, detectionId, actionName, status, input = {}, result = {}, error = null, startedAt = Date.now()) {
  await logActionExecution({
    detectionId: detectionId && detectionId !== 'none' ? detectionId : null,
    actionName,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    clusterKey: input.clusterKey || result.clusterKey || null,
    status,
    input,
    result,
    error,
    latencyMs: Date.now() - startedAt,
  });
}

export async function handleSmartButton(interaction) {
  const parts = interaction.customId.split(':');
  const type = parts[1];
  const startedAt = Date.now();

  if (type === 'ticket') {
    const [, , optionId, userId, detectionId, encodedClusterKey] = parts;
    if (!assertOwner(interaction, userId)) return;

    try {
      const [options, detection] = await Promise.all([getOptions(), getIntentDetection(detectionId)]);
      const clusterKey = encodedClusterKey && encodedClusterKey !== 'none' ? encodedClusterKey : detection?.clusterKey || null;
      const option = options.find((item) => String(item.id) === String(optionId));
      if (!option) {
        await interaction.reply({ content: '❌ Loại ticket này đã bị tắt hoặc xóa.', flags: MessageFlags.Ephemeral });
        await recordAction(interaction, detectionId, 'CREATE_TICKET', 'failed', { optionId }, {}, 'Option không tồn tại', startedAt);
        return;
      }

      await updateIntentDetection(detectionId, { status: 'ticket_requested', optionId });
      const fields = getOptionFormFields(option, options);
      const context = { detectionId, source: 'smart_assistant', clusterKey };
      if (fields.length > 0) {
        if (isComplexForm(fields)) await startFormWizard(interaction, option, fields, context);
        else await showFormModal(interaction, option, fields, context);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ticket = await createTicket(interaction, 'smart_assistant', optionId, null, context);
      await updateIntentDetection(detectionId, { status: 'ticket_created', optionId });
      await recordAction(interaction, detectionId, 'CREATE_TICKET', 'completed', { optionId, clusterKey }, { ticketId: ticket.ticketId, channelId: ticket.channel.id }, null, startedAt);
    } catch (error) {
      await recordAction(interaction, parts[4], 'CREATE_TICKET', 'failed', { optionId: parts[2] }, {}, error.message, startedAt);
      throw error;
    }
    return;
  }

  if (type === 'cluster') {
    const [, , clusterKey, userId, detectionId] = parts;
    if (!assertOwner(interaction, userId)) return;
    const [detection, options, configResponse, conversation, clusterRows] = await Promise.all([
      getIntentDetection(detectionId),
      getOptions(),
      getConfig(),
      getSmartConversation({ guildId: interaction.guildId, channelId: interaction.channelId, userId, limit: 6 }),
      getClusters().catch(() => []),
    ]);
    const cfg = configResponse?.data || configResponse || {};
    const clusters = mergeClusters(clusterRows);
    const cluster = clusters.find((item) => item.key === clusterKey) || getDefaultCluster(clusterKey);
    if (!cluster) return interaction.reply({ content: '❌ Cụm này không tồn tại hoặc đang tắt.', flags: MessageFlags.Ephemeral });
    const primary = INTENT_MAP.get(detection?.intentKey);
    if (!primary) return interaction.reply({ content: '❌ Yêu cầu cũ không còn hợp lệ. Hãy hỏi bot lại.', flags: MessageFlags.Ephemeral });
    const metadata = detection?.metadata || {};
    const detected = Array.isArray(metadata.detectedIntents)
      ? metadata.detectedIntents.map((item) => ({ ...INTENT_MAP.get(item.key), confidence: item.confidence, source: item.source })).filter((item) => item.key)
      : [];
    const intent = { ...primary, confidence: detection?.confidence || 1, source: 'cluster_selection', intents: detected.length ? detected : [{ ...primary, confidence: detection?.confidence || 1, source: 'cluster_selection' }] };
    const routerContext = contextForRouter(conversation, cfg.smartMaxContextMessages || 6);
    routerContext.cluster = cluster;
    const payload = await buildSmartResponse({
      intent, options, detection: detection || { id: detectionId }, userId,
      query: detection?.content || primary.label, config: cfg, guildId: interaction.guildId,
      context: routerContext, cluster,
    });
    await updateIntentDetection(detectionId, {
      status: 'responded', clusterKey: cluster.key,
      optionId: payload.option?.id || null,
      metadata: { ...metadata, ...(payload.metadata || {}), clusterKey: cluster.key, selectedByUser: true, awaitingCluster: false },
    });
    if (cfg.smartConversationEnabled !== false) {
      await saveSmartConversation({
        guildId: interaction.guildId, channelId: interaction.channelId, userId,
        status: 'active', clusterKey: cluster.key,
        context: { ...(conversation?.context || {}), clusterKey: cluster.key, selectedByUser: true },
        pendingIntents: [], lastIntentKey: primary.key, lastDetectionId: detectionId,
        ttlMinutes: cfg.smartConversationTtlMinutes || 15,
        maxMessages: cfg.smartMaxContextMessages || 6,
        messages: [{ role: 'user', content: `Đã chọn cụm ${cluster.name}`, intentKey: primary.key, metadata: { clusterKey: cluster.key, source: 'button' } }],
      });
    }
    const { metadata: _metadata, option: _option, ...discordPayload } = payload;
    await interaction.update(discordPayload);
    await recordAction(interaction, detectionId, 'SELECT_CLUSTER', 'completed', { clusterKey: cluster.key }, { optionId: payload.option?.id || null }, null, startedAt);
    return;
  }

  if (type === 'feedback') {
    const [, , vote, userId, detectionId] = parts;
    if (!assertOwner(interaction, userId)) return;

    await sendSmartFeedback({ detectionId, userId, helpful: vote === 'y' });
    await updateIntentDetection(detectionId, { status: vote === 'y' ? 'helpful' : 'needs_review' });
    await recordAction(interaction, detectionId, 'SUBMIT_FEEDBACK', 'completed', { helpful: vote === 'y' }, {}, null, startedAt);

    if (vote !== 'y') {
      const [detection, configResponse, clusterRows] = await Promise.all([
        getIntentDetection(detectionId), getConfig(), getClusters().catch(() => []),
      ]);
      const cfg = configResponse?.data || configResponse || {};
      if (cfg.smartLearnEnabled && cfg.smartLearnCreateFromNegativeVote !== false && detection) {
        const cluster = mergeClusters(clusterRows).find((item) => item.key === detection.clusterKey) || null;
        const observedAnswer = interaction.message?.embeds?.[0]?.description || null;
        await queueSmartLearnCandidate({
          client: interaction.client,
          guild: interaction.guild,
          config: cfg,
          clusters: mergeClusters(clusterRows),
          payload: {
            clusterKey: detection.clusterKey || null,
            intentKey: detection.intentKey,
            question: detection.content,
            proposedTitle: `${cluster?.name ? `${cluster.name} • ` : ''}${detection.intentKey || 'Câu hỏi cần xem lại'}`,
            // Không bao giờ dùng lại câu trả lời vừa bị user đánh giá sai làm nội dung revision.
            // Giữ nó ở sourceExamples.observedAnswer để reviewer biết cái gì đã thất bại.
            proposedAnswer: null,
            observedAnswer,
            sourceType: 'NEGATIVE_FEEDBACK',
            negativeSignal: true,
            sourceConfidence: 0.35,
            evidenceScore: 0.25,
            candidateType: 'REVISE_ARTICLE',
            targetArticleId: Array.isArray(detection.metadata?.knowledgeArticleIds) ? detection.metadata.knowledgeArticleIds[0] : null,
            sourceChannelId: detection.channelId || interaction.channelId,
            sourceMessageId: detection.messageId || interaction.message?.id,
            sourceUserId: interaction.user.id,
            sourceUserName: interaction.user.username,
          },
        });
      }
    }

    await interaction.reply({
      content: vote === 'y'
        ? '✅ Cảm ơn bạn! Phản hồi này giúp bot cải thiện.'
        : '📚 Đã ghi nhận và đưa câu hỏi vào hàng đợi SmartLearn để staff xác minh.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (type === 'correct') {
    const [, , intentKey, userId, detectionId] = parts;
    if (!assertOwner(interaction, userId)) return;
    const intent = INTENT_MAP.get(intentKey);
    if (!intent) {
      await interaction.reply({ content: '❌ Intent này không còn được hỗ trợ.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [detection, options, configResponse, conversation, clusterRows] = await Promise.all([
      getIntentDetection(detectionId), getOptions(), getConfig(),
      getSmartConversation({ guildId: interaction.guildId, channelId: interaction.channelId, userId, limit: 6 }),
      getClusters().catch(() => []),
    ]);
    const cfg = configResponse?.data || configResponse || {};
    const cluster = mergeClusters(clusterRows).find((item) => item.key === (detection?.clusterKey || conversation?.clusterKey)) || getDefaultCluster(detection?.clusterKey || conversation?.clusterKey);
    await sendSmartFeedback({ detectionId, userId, helpful: false, correctedIntent: intentKey });
    const corrected = { ...intent, confidence: 1, source: 'user_correction' };
    const option = resolveOptionForIntent(options, corrected, cluster?.key || null);
    const baseMetadata = { ...(detection?.metadata || {}), correctedIntent: intentKey };

    const payload = await buildSmartResponse({
      intent: corrected,
      options,
      detection: detection || { id: detectionId },
      userId,
      query: detection?.content || intent.label,
      config: cfg,
      guildId: interaction.guildId,
      context: { ...contextForRouter(conversation, cfg.smartMaxContextMessages || 6), cluster },
      cluster,
    });
    await updateIntentDetection(detectionId, {
      status: 'corrected',
      clusterKey: cluster?.key || detection?.clusterKey || null,
      optionId: option?.id || null,
      metadata: { ...baseMetadata, ...(payload.metadata || {}) },
    });
    if (cfg.smartConversationEnabled !== false) {
      await saveSmartConversation({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId,
        status: 'active',
        context: { correctedByUser: true },
        pendingIntents: [],
        lastIntentKey: intentKey,
        lastDetectionId: detectionId,
        clusterKey: cluster?.key || null,
        ttlMinutes: cfg.smartConversationTtlMinutes || 15,
        maxMessages: cfg.smartMaxContextMessages || 6,
        messages: [{ role: 'user', content: `Đã chọn: ${intent.label}`, intentKey, metadata: { source: 'button' } }],
      });
    }
    const { metadata: _metadata, option: _option, ...discordPayload } = payload;
    await interaction.update(discordPayload);
    await recordAction(interaction, detectionId, 'CORRECT_INTENT', 'completed', { intentKey, clusterKey: cluster?.key || null }, {
      optionId: option?.id || null,
      knowledgeArticleIds: payload.metadata?.knowledgeArticleIds || [],
    }, null, startedAt);
    return;
  }

  if (type === 'escalate') {
    const [, , userId, detectionId] = parts;
    if (!assertOwner(interaction, userId)) return;
    const [detection, configResponse] = await Promise.all([getIntentDetection(detectionId), getConfig()]);
    const cfg = configResponse?.data || configResponse || {};

    if (detection?.status === 'escalated') {
      await interaction.reply({ content: 'ℹ️ Yêu cầu này đã được chuyển cho staff trước đó.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      let target = interaction.channel;
      if (cfg.smartEscalationChannelId) {
        target = interaction.guild.channels.cache.get(cfg.smartEscalationChannelId)
          || await interaction.guild.channels.fetch(cfg.smartEscalationChannelId).catch(() => null);
      }
      if (!target?.isTextBased()) throw new Error('Channel escalation chưa hợp lệ');

      const roleMention = cfg.smartEscalationRoleId ? `<@&${cfg.smartEscalationRoleId}>` : '';
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('🆘 Smart Assistant chuyển yêu cầu cho Staff')
        .setDescription(String(detection?.content || 'Người dùng cần hỗ trợ trực tiếp.').slice(0, 3500))
        .addFields(
          { name: 'Người dùng', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Intent', value: detection?.intentKey || 'Không xác định', inline: true },
          { name: 'Cụm', value: detection?.clusterKey || 'Chưa chọn', inline: true },
          { name: 'Độ tin cậy', value: `${Math.round((detection?.confidence || 0) * 100)}%`, inline: true },
          { name: 'Nguồn', value: `[Đi tới tin nhắn](${interaction.message.url})`, inline: false },
        )
        .setTimestamp();

      await target.send({
        content: roleMention || undefined,
        embeds: [embed],
        allowedMentions: cfg.smartEscalationRoleId ? { roles: [cfg.smartEscalationRoleId] } : { parse: [] },
      });
      await updateIntentDetection(detectionId, { status: 'escalated' });
      await recordAction(interaction, detectionId, 'ESCALATE_STAFF', 'completed', { targetChannelId: target.id, clusterKey: detection?.clusterKey || null }, {}, null, startedAt);
      await interaction.reply({ content: '✅ Đã chuyển yêu cầu cho staff. Vui lòng chờ phản hồi.', flags: MessageFlags.Ephemeral });
    } catch (error) {
      await recordAction(interaction, detectionId, 'ESCALATE_STAFF', 'failed', { clusterKey: detection?.clusterKey || null }, {}, error.message, startedAt);
      await interaction.reply({ content: `❌ Chưa thể gọi staff: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
  }
}

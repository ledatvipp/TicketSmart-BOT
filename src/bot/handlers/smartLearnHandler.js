import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  createSmartLearnCandidate,
  getSmartLearnCandidate,
  saveSmartLearnDeliveryRefs,
  reviewSmartLearnCandidate,
  getConfig,
  getClusters,
  getStaff,
} from '../utils/api.js';
import { mergeClusters, clusterColor, clusterLabel } from '../../clusters/clusterCatalog.js';
import logger from '../utils/logger.js';

function parseIds(value = '') {
  return String(value).split(',').map((id) => id.trim()).filter((id) => /^\d{15,22}$/.test(id));
}

function safeJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function clean(value, max = 1000) {
  return String(value ?? '')
    .replace(/@everyone|@here/gi, '@ everyone')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function statusMeta(status) {
  return ({
    PENDING: { label: 'Chờ xác minh', emoji: '🟠', color: 0xf39c12 },
    NEEDS_ADMIN: { label: 'Cần Admin duyệt', emoji: '🔐', color: 0xe67e22 },
    CONFLICTED: { label: 'Có ý kiến khác nhau', emoji: '⚠️', color: 0xed4245 },
    PUBLISHING: { label: 'Đang xuất bản', emoji: '⏳', color: 0x5865f2 },
    APPROVED: { label: 'Đã xuất bản', emoji: '✅', color: 0x57f287 },
    REJECTED: { label: 'Đã từ chối', emoji: '❌', color: 0xed4245 },
  })[status] || { label: status || 'Không rõ', emoji: '📚', color: 0x5865f2 };
}


function candidateTypeMeta(type) {
  return ({
    NEW_ARTICLE: { label: 'Kiến thức mới', emoji: '🆕' },
    ADD_ALIAS: { label: 'Thêm câu tương tự', emoji: '🔗' },
    VERIFY_EXISTING: { label: 'Xác minh kiến thức cũ', emoji: '🔎' },
    REVISE_ARTICLE: { label: 'Sửa kiến thức hiện có', emoji: '🛠️' },
  })[type] || { label: 'Kiến thức mới', emoji: '📚' };
}

function candidateSource(candidate) {
  if (candidate.sourceChannelId && candidate.sourceMessageId) {
    return `[Mở tin nhắn gốc](https://discord.com/channels/${candidate.guildId}/${candidate.sourceChannelId}/${candidate.sourceMessageId})`;
  }
  if (candidate.sourceChannelId) return `<#${candidate.sourceChannelId}>`;
  return candidate.sourceType || 'Smart Assistant';
}

export function buildSmartLearnReviewPayload(candidate, clusters = []) {
  const status = statusMeta(candidate.status);
  const cluster = mergeClusters(clusters).find((item) => item.key === candidate.clusterKey) || null;
  const type = candidateTypeMeta(candidate.candidateType);
  const answer = clean(candidate.proposedAnswer || 'Chưa có câu trả lời đề xuất. Hãy dùng “Câu trả lời khác”.', 3000);
  const examples = safeJson(candidate.sourceExamples, []).slice(-3);
  const embed = new EmbedBuilder()
    .setColor(candidate.status === 'PENDING' && cluster ? clusterColor(cluster, status.color) : status.color)
    .setAuthor({ name: 'IS7MC SmartLearn • Human Review' })
    .setTitle(`${type.emoji} ${type.label} cần duyệt`)
    .setDescription(`**Câu hỏi**\n${clean(candidate.question, 1000)}\n\n**Câu trả lời đề xuất**\n${answer}`)
    .addFields(
      {
        name: '🎯 PHÂN LOẠI',
        value: [
          `• **Cụm:** ${clusterLabel(cluster)}`,
          `• **Intent:** ${clean(candidate.intentKey || 'Chưa xác định', 80)}`,
          `• **Flow:** ${type.emoji} ${type.label}`,
          `• **Bài gợi ý:** ${candidate.targetArticle ? clean(candidate.targetArticle.title, 120) : 'Không có'}`,
          `• **Match score:** ${Math.round((candidate.matchScore || 0) * 100)}%`,
          `• **Rủi ro:** ${candidate.riskLevel === 'ADMIN_REQUIRED' ? '🔐 Bắt buộc Admin' : '🟢 Thông thường'}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📊 TRẠNG THÁI',
        value: [
          `• **Hiện tại:** ${status.emoji} ${status.label}`,
          `• **Số lần được hỏi:** ${candidate.occurrenceCount || 1}`,
          `• **Priority score:** ${Math.round(candidate.priorityScore || 0)}`,
          `• **Learning score:** ${Math.round((candidate.learningScore || 0) * 100)}%`,
          `• **Evidence:** ${Math.round((candidate.evidenceScore || 0) * 100)}%`,
          `• **Source diversity:** ${candidate.sourceDiversity || 1}`,
          `• **Conflict:** ${Math.round((candidate.conflictScore || 0) * 100)}%`, 
          `• **Phiếu duyệt / từ chối:** ${candidate.approvalCount || 0} / ${candidate.rejectionCount || 0}`,
          `• **Nguồn:** ${candidateSource(candidate)}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: `Candidate ${candidate.id} • Knowledge chỉ được dùng sau khi đạt policy duyệt` })
    .setTimestamp(new Date(candidate.updatedAt || Date.now()));

  if (examples.length > 1) {
    embed.addFields({
      name: '🧩 CÂU TƯƠNG TỰ ĐÃ GỘP',
      value: examples.map((item) => `• ${clean(item.question, 180)}`).join('\n').slice(0, 1024),
      inline: false,
    });
  }
  if (candidate.targetArticle && !candidate.approvedArticle) {
    embed.addFields({ name: '🔎 KIẾN THỨC GỢI Ý', value: `**${clean(candidate.targetArticle.title, 180)}**\n${clean(candidate.targetArticle.summary || candidate.targetArticle.content, 700)}`, inline: false });
  }
  if (candidate.approvedArticle) {
    embed.addFields({ name: '📖 BÀI ĐÃ XUẤT BẢN', value: `**${candidate.approvedArticle.title}**\nSlug: \`${candidate.approvedArticle.slug}\``, inline: false });
  }

  const final = ['APPROVED', 'REJECTED', 'PUBLISHING'].includes(candidate.status);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`smartlearn:approve:${candidate.id}`)
      .setLabel('Duyệt')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(final),
    new ButtonBuilder()
      .setCustomId(`smartlearn:reject:${candidate.id}`)
      .setLabel('Từ chối')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(final),
    new ButtonBuilder()
      .setCustomId(`smartlearn:alternative:${candidate.id}`)
      .setLabel('Câu trả lời khác')
      .setEmoji('✍️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(final),
  );

  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

async function updateDeliveryMessages(client, candidate, clusters) {
  const payload = buildSmartLearnReviewPayload(candidate, clusters);
  for (const ref of safeJson(candidate.deliveryRefs, [])) {
    try {
      const channel = await client.channels.fetch(ref.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(ref.messageId).catch(() => null);
      if (message) await message.edit(payload);
    } catch (error) {
      logger.debug(`Không update được SmartLearn ref ${ref.messageId}: ${error.message}`);
    }
  }
}

async function deliverCandidate(client, guild, candidate, cfg, clusters) {
  const refs = [];
  const mode = ['channel', 'dm', 'both'].includes(cfg.smartLearnDeliveryMode) ? cfg.smartLearnDeliveryMode : 'channel';
  const payload = buildSmartLearnReviewPayload(candidate, clusters);
  const channelId = cfg.smartLearnReviewChannelId || cfg.smartEscalationChannelId || null;

  if ((mode === 'channel' || mode === 'both') && channelId) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const cluster = mergeClusters(clusters).find((item) => item.key === candidate.clusterKey);
      const roleIds = [...new Set([
        ...parseIds(cfg.smartLearnReviewerRoleIds),
        ...parseIds(cfg.smartLearnAdminRoleIds),
        ...parseIds(cluster?.staffRoleIds),
      ])];
      const mention = roleIds.map((id) => `<@&${id}>`).join(' ');
      const message = await channel.send({
        content: mention || undefined,
        ...payload,
        allowedMentions: { roles: roleIds },
      });
      refs.push({ kind: 'channel', channelId: channel.id, messageId: message.id });
    }
  }

  if (mode === 'dm' || mode === 'both') {
    const cluster = mergeClusters(clusters).find((item) => item.key === candidate.clusterKey);
    const roleIds = [...new Set([
      ...parseIds(cfg.smartLearnReviewerRoleIds),
      ...parseIds(cfg.smartLearnAdminRoleIds),
      ...parseIds(cluster?.staffRoleIds),
      ...(cfg.staffRoleId ? [cfg.staffRoleId] : []),
    ])];
    if (roleIds.length) {
      await guild.members.fetch().catch(() => null);
      const reviewers = new Map();
      for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId);
        for (const member of role?.members?.values?.() || []) {
          if (!member.user.bot) reviewers.set(member.id, member);
        }
      }
      const max = Math.min(25, Math.max(1, Number(cfg.smartLearnMaxDmReviewers) || 10));
      for (const member of [...reviewers.values()].slice(0, max)) {
        const message = await member.send(payload).catch(() => null);
        if (message) refs.push({ kind: 'dm', channelId: message.channelId, messageId: message.id, userId: member.id });
      }
    }
  }

  if (refs.length) return saveSmartLearnDeliveryRefs(candidate.id, refs);
  return candidate;
}

export async function queueSmartLearnCandidate({ client, guild, config, clusters = [], payload }) {
  if (!config?.smartLearnEnabled || !guild) return null;
  const result = await createSmartLearnCandidate({ guildId: guild.id, ...payload });
  if (!result || result.skipped || !result.candidate) return result;
  if (result.created) {
    result.candidate = await deliverCandidate(client, guild, result.candidate, config, clusters) || result.candidate;
  } else if (result.merged) {
    await updateDeliveryMessages(client, result.candidate, clusters);
  }
  return result;
}

async function reviewerContext(interaction, candidate) {
  const [configResponse, clusterRows, staff] = await Promise.all([getConfig(), getClusters(), getStaff()]);
  const cfg = configResponse?.data || configResponse || {};
  const clusters = mergeClusters(clusterRows);
  const guild = interaction.client.guilds.cache.get(candidate.guildId)
    || await interaction.client.guilds.fetch(candidate.guildId).catch(() => null);
  if (!guild) return { allowed: false, reason: 'Không tìm thấy guild', cfg, clusters };
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return { allowed: false, reason: 'Bạn không còn ở trong server', cfg, clusters, guild };
  const cluster = clusters.find((item) => item.key === candidate.clusterKey);
  const adminIds = parseIds(cfg.smartLearnAdminRoleIds);
  const reviewerIds = [...new Set([
    ...parseIds(cfg.smartLearnReviewerRoleIds),
    ...parseIds(cluster?.staffRoleIds),
    ...(cfg.staffRoleId ? [cfg.staffRoleId] : []),
  ])];
  const dbStaff = staff.find((item) => item.discordId === interaction.user.id);
  const isAdmin = member.permissions.has('Administrator')
    || adminIds.some((id) => member.roles.cache.has(id))
    || dbStaff?.role === 'ADMIN';
  const allowed = isAdmin || reviewerIds.some((id) => member.roles.cache.has(id)) || Boolean(dbStaff);
  return { allowed, isAdmin, cfg, clusters, guild, member, reason: allowed ? null : 'Bạn không có role reviewer của cụm này' };
}

function rejectModal(candidateId) {
  const modal = new ModalBuilder().setCustomId(`smartlearn_reject:${candidateId}`).setTitle('Từ chối kiến thức');
  const reason = new TextInputBuilder()
    .setCustomId('reason').setLabel('Lý do từ chối').setStyle(TextInputStyle.Paragraph)
    .setRequired(true).setMinLength(3).setMaxLength(1000)
    .setPlaceholder('Sai thông tin, trùng kiến thức cũ, chưa đủ dữ liệu...');
  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  return modal;
}

function alternativeModal(candidateId, candidate) {
  const modal = new ModalBuilder().setCustomId(`smartlearn_alternative:${candidateId}`).setTitle('Câu trả lời khác');
  const title = new TextInputBuilder()
    .setCustomId('title').setLabel('Tiêu đề ngắn').setStyle(TextInputStyle.Short)
    .setRequired(false).setMaxLength(180).setValue(clean(candidate.proposedTitle || candidate.question, 180));
  const answer = new TextInputBuilder()
    .setCustomId('answer').setLabel('Câu trả lời chính xác').setStyle(TextInputStyle.Paragraph)
    .setRequired(true).setMinLength(3).setMaxLength(4000);
  const currentAnswer = clean(candidate.proposedAnswer, 4000);
  if (currentAnswer) answer.setValue(currentAnswer);
  const keywords = new TextInputBuilder()
    .setCustomId('keywords').setLabel('Từ khóa bổ sung').setStyle(TextInputStyle.Short)
    .setRequired(false).setMaxLength(600).setPlaceholder('reset, private server, giữ vật phẩm');
  const note = new TextInputBuilder()
    .setCustomId('note').setLabel('Ghi chú nội bộ').setStyle(TextInputStyle.Paragraph)
    .setRequired(false).setMaxLength(800).setPlaceholder('Lý do sửa hoặc điểm cần lưu ý...');
  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(answer),
    new ActionRowBuilder().addComponents(keywords),
    new ActionRowBuilder().addComponents(note),
  );
  return modal;
}

async function processReview(interaction, candidate, context, data) {
  const result = await reviewSmartLearnCandidate(candidate.id, {
    ...data,
    reviewerId: interaction.user.id,
    reviewerName: interaction.user.username,
    isAdmin: context.isAdmin,
  });
  await updateDeliveryMessages(interaction.client, result.candidate, context.clusters);
  if (result.published && context.cfg.smartLearnNotifyUser !== false && result.candidate.sourceUserId) {
    const cluster = context.clusters.find((item) => item.key === result.candidate.clusterKey) || null;
    const target = await interaction.client.users.fetch(result.candidate.sourceUserId).catch(() => null);
    if (target) {
      const notice = new EmbedBuilder()
        .setColor(cluster ? clusterColor(cluster, 0x57f287) : 0x57f287)
        .setAuthor({ name: 'IS7MC SmartLearn' })
        .setTitle('✅ Câu hỏi của bạn đã có câu trả lời xác minh')
        .setDescription(clean(result.article.content, 3000))
        .addFields({ name: '🗺️ Phạm vi', value: clusterLabel(cluster), inline: true })
        .setFooter({ text: 'Câu trả lời đã được staff kiểm duyệt' })
        .setTimestamp();
      await target.send({ embeds: [notice], allowedMentions: { parse: [] } }).catch(() => null);
    }
  }
  return result;
}

export async function handleSmartLearnButton(interaction) {
  const [, action, candidateId] = interaction.customId.split(':');
  const candidate = await getSmartLearnCandidate(candidateId);
  if (!candidate) return interaction.reply({ content: '❌ Candidate không còn tồn tại.', flags: MessageFlags.Ephemeral });
  const context = await reviewerContext(interaction, candidate);
  if (!context.allowed) return interaction.reply({ content: `❌ ${context.reason}`, flags: MessageFlags.Ephemeral });

  if (action === 'reject') return interaction.showModal(rejectModal(candidate.id));
  if (action === 'alternative') return interaction.showModal(alternativeModal(candidate.id, candidate));
  if (action !== 'approve') return interaction.reply({ content: '❌ Thao tác không hợp lệ.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await processReview(interaction, candidate, context, { action: 'APPROVE' });
    const message = result.published
      ? `✅ Đã duyệt và xuất bản thành Knowledge Article **${result.article.title}**.`
      : result.candidate.status === 'NEEDS_ADMIN'
        ? '🔐 Đã ghi nhận phiếu. Candidate này vẫn cần Admin duyệt.'
        : `🗳️ Đã ghi nhận phiếu duyệt (${result.candidate.approvalCount}).`;
    return interaction.editReply({ content: message });
  } catch (error) {
    return interaction.editReply({ content: `❌ ${error.message}` });
  }
}

export async function handleSmartLearnModal(interaction) {
  const [type, candidateId] = interaction.customId.split(':');
  const candidate = await getSmartLearnCandidate(candidateId);
  if (!candidate) return interaction.reply({ content: '❌ Candidate không còn tồn tại.', flags: MessageFlags.Ephemeral });
  const context = await reviewerContext(interaction, candidate);
  if (!context.allowed) return interaction.reply({ content: `❌ ${context.reason}`, flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (type === 'smartlearn_reject') {
      const reason = interaction.fields.getTextInputValue('reason');
      const result = await processReview(interaction, candidate, context, { action: 'REJECT', reason });
      return interaction.editReply({ content: result.candidate.status === 'REJECTED' ? '❌ Candidate đã bị từ chối.' : '🗳️ Đã ghi nhận phiếu từ chối.' });
    }
    if (type === 'smartlearn_alternative') {
      const result = await processReview(interaction, candidate, context, {
        action: 'ALTERNATIVE',
        title: interaction.fields.getTextInputValue('title'),
        answer: interaction.fields.getTextInputValue('answer'),
        keywords: interaction.fields.getTextInputValue('keywords'),
        reason: interaction.fields.getTextInputValue('note'),
      });
      return interaction.editReply({
        content: result.published
          ? `✅ Câu trả lời mới đã được duyệt và xuất bản thành **${result.article.title}**.`
          : result.candidate.status === 'NEEDS_ADMIN'
            ? '✍️ Đã lưu câu trả lời mới. Nội dung này cần Admin xác minh trước khi xuất bản.'
            : '✍️ Đã lưu câu trả lời mới và ghi nhận phiếu duyệt.',
      });
    }
    return interaction.editReply({ content: '❌ Form không hợp lệ.' });
  } catch (error) {
    return interaction.editReply({ content: `❌ ${error.message}` });
  }
}

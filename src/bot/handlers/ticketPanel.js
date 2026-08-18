import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getClusters, getConfig, getTicketByChannel, updateTicketWorkflow } from '../utils/api.js';
import { workflowLabel } from '../../tickets/ticketAssistantPolicy.js';
import { clusterColor, clusterLabel, getDefaultCluster, mergeClusters } from '../../clusters/clusterCatalog.js';
import logger from '../utils/logger.js';

function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function clean(value, max = 1000) {
  return String(value ?? '').replace(/@everyone|@here/gi, '@ everyone').trim().slice(0, max);
}

function priorityLabel(priority) {
  return ({ normal: '🟢 Thường', high: '🟠 Cao', urgent: '🔴 Khẩn' })[priority] || '🟢 Thường';
}

function statusColor(ticket, cluster) {
  if (ticket.status === 'closed' || ticket.workflowStatus === 'resolved') return 0x57f287;
  if (ticket.priority === 'urgent') return 0xed4245;
  if (ticket.priority === 'high') return 0xfee75c;
  if (ticket.workflowStatus === 'waiting_user') return 0x9b59b6;
  if (ticket.workflowStatus === 'ai_assisting') return clusterColor(cluster, 0x5865f2);
  return clusterColor(cluster, 0x3498db);
}

function formSummary(formData) {
  const parsed = safeJson(formData, {});
  const entries = Object.values(parsed || {}).filter(Boolean).slice(0, 5);
  if (!entries.length) return null;
  return entries.map((item) => `• **${clean(item.label || 'Thông tin', 80)}:** ${clean(item.value || '—', 180)}`).join('\n').slice(0, 1000);
}

function shortSummary(text, fallback) {
  const cleaned = clean(text || '', 850);
  return cleaned || fallback;
}

function resolveCluster(ticket, clusters, suppliedCluster) {
  if (suppliedCluster) return suppliedCluster;
  return clusters.find((item) => item.key === ticket.clusterKey) || getDefaultCluster(ticket.clusterKey);
}

export function buildTicketPanelPayload({
  ticket,
  config = {},
  option = null,
  creator = null,
  formData = null,
  clusters = [],
  cluster = null,
  pingRoleIds = [],
}) {
  const number = String(ticket.ticketNum || 0).padStart(4, '0');
  const category = option || ticket.option || {};
  const creatorMention = creator ? `${creator}` : `<@${ticket.creatorId}>`;
  const claimed = Boolean(ticket.claimerId);
  const activeClusters = mergeClusters(clusters);
  const selectedCluster = resolveCluster(ticket, activeClusters, cluster);
  const needsCluster = config.ticketRequireCluster !== false && !selectedCluster;
  const aiEnabled = config.ticketAiEnabled !== false && config.ticketAiMode !== 'off';
  const aiAvailable = aiEnabled && !ticket.aiPaused && !needsCluster;
  const aiState = !aiEnabled
    ? 'Tắt toàn cục'
    : needsCluster
      ? 'Chờ chọn cụm'
      : ticket.aiPaused
        ? 'Đang tạm dừng'
        : claimed && config.ticketAiPauseWhenClaimed !== false
          ? 'Nhường Staff'
          : 'Sẵn sàng';

  const overview = [
    `• **Người tạo:** ${creatorMention}`,
    `• **Cụm:** ${clusterLabel(selectedCluster)}`,
    `• **Loại ticket:** ${category.emoji || '🎫'} ${clean(category.name || ticket.type || 'Hỗ trợ', 90)}`,
    `• **Trạng thái:** ${workflowLabel(ticket.workflowStatus)}`,
    `• **Staff phụ trách:** ${claimed ? `<@${ticket.claimerId}>` : 'Chưa nhận'}`,
    `• **Ưu tiên:** ${priorityLabel(ticket.priority)}`,
    `• **Đã chuyển mục:** ${String(ticket.moveCount || 0)} lần${ticket.lastMovedAt ? ` • <t:${Math.floor(new Date(ticket.lastMovedAt).getTime() / 1000)}:R>` : ''}`,
  ].join('\n');

  const assistant = [
    `• **AI trong ticket:** 🤖 ${aiState}`,
    `• **Tin nhắn đã ghi nhận:** ${String(ticket.messageCount || 0)}`,
    `• **Mở ticket:** <t:${Math.floor(new Date(ticket.openedAt || Date.now()).getTime() / 1000)}:R>`,
    `• **Thao tác:** Bấm button hoặc menu, không cần đọc/gõ dài`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(statusColor(ticket, selectedCluster))
    .setAuthor({ name: selectedCluster ? `IS7MC • ${selectedCluster.name}` : 'IS7MC Ticket Center' })
    .setTitle(`${category.emoji || '🎫'} Ticket #${number}`)
    .setDescription(needsCluster
      ? '⚠️ **Chọn cụm máy chủ trước** để AI và staff xử lý đúng hệ thống.'
      : 'Dùng **button** hoặc **menu** bên dưới để xử lý nhanh. Hạn chế gửi nhiều tin nhắn dài nếu không cần thiết.')
    .addFields(
      { name: '📌 TỔNG QUAN', value: overview.slice(0, 1024), inline: false },
      { name: '🤖 AI & XỬ LÝ', value: assistant.slice(0, 1024), inline: false },
    )
    .setFooter({ text: selectedCluster ? `${selectedCluster.emoji || '🗺️'} ${selectedCluster.name} • Ưu tiên thao tác bằng button` : 'Chọn cụm để tiếp tục • Không đoán nhầm dữ liệu server' })
    .setTimestamp();

  const supplied = formSummary(formData ?? ticket.formData);
  if (supplied) embed.addFields({ name: '🧾 THÔNG TIN ĐÃ CUNG CẤP', value: supplied, inline: false });
  if (ticket.aiSummary && config.ticketAiAutoSummary !== false) {
    embed.addFields({ name: '🧠 TÓM TẮT NHANH', value: shortSummary(ticket.aiSummary, 'Chưa có tóm tắt.'), inline: false });
  }

  const userOptions = [];
  if (aiAvailable) {
    userOptions.push({ label: 'Hỏi AI nhanh', value: 'ai_help', emoji: '🤖', description: `Hỏi theo dữ liệu cụm ${selectedCluster.name}` });
  }
  userOptions.push(
    { label: 'Bổ sung thông tin', value: 'add_details', emoji: '📝', description: 'Thêm mô tả hoặc link bằng chứng' },
    { label: 'Xem trạng thái', value: 'status', emoji: '📊', description: 'Xem cụm, staff, ưu tiên và AI' },
    { label: 'Cần Staff trực tiếp', value: 'human', emoji: '🆘', description: 'Tạm dừng AI và gọi staff có kiểm soát' },
    { label: 'Đóng ticket', value: 'close', emoji: '🔒', description: 'Mở lựa chọn đóng ticket' },
  );

  const userMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_quick_actions')
    .setPlaceholder('⚡ Tác vụ nhanh cho member')
    .addOptions(userOptions);

  const staffMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_staff_actions')
    .setPlaceholder('🛡️ Công cụ Staff')
    .addOptions(
      { label: claimed ? 'Ticket đã được nhận' : 'Nhận ticket', value: 'claim', emoji: '✅' },
      { label: 'Ưu tiên thường', value: 'priority_normal', emoji: '🟢' },
      { label: 'Ưu tiên cao', value: 'priority_high', emoji: '🟠' },
      { label: 'Ưu tiên khẩn', value: 'priority_urgent', emoji: '🔴' },
      { label: 'Đang chờ người chơi', value: 'waiting_user', emoji: '👤' },
      { label: 'Đang chờ Staff', value: 'waiting_staff', emoji: '🛡️' },
      { label: 'Làm mới panel', value: 'refresh', emoji: '🔄' },
    );

  const quickButtons = [];
  if (aiEnabled) {
    quickButtons.push(
      new ButtonBuilder()
        .setCustomId('ticket_quick_ai')
        .setLabel('Hỏi AI')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!aiAvailable),
    );
  }
  quickButtons.push(
    new ButtonBuilder().setCustomId('ticket_quick_details').setLabel('Bổ sung').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_quick_status').setLabel('Trạng thái').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_quick_human').setLabel('Gọi Staff').setEmoji('🆘').setStyle(ButtonStyle.Danger),
  );

  const normalizedPingRoleIds = [...new Set((pingRoleIds || [])
    .map((id) => String(id || '').trim())
    .filter((id) => /^\d{15,25}$/.test(id)))]
    .slice(0, 3);
  const content = [creatorMention, ...normalizedPingRoleIds.map((id) => `<@&${id}>`)].join(' ').trim();
  const allowedMentions = { users: [ticket.creatorId] };
  if (normalizedPingRoleIds.length) allowedMentions.roles = normalizedPingRoleIds;

  const staffButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel(claimed ? 'Đã nhận' : 'Nhận').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(claimed),
    new ButtonBuilder().setCustomId('ticket_move').setLabel('Move').setEmoji('📦').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Đóng').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );

  const components = [];
  if (needsCluster && config.ticketClusterSelectEnabled !== false) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_cluster_select')
        .setPlaceholder('🗺️ Chọn cụm máy chủ của ticket')
        .addOptions(activeClusters.slice(0, 25).map((item) => ({
          label: item.name.slice(0, 100),
          value: item.key,
          emoji: item.emoji || '🗺️',
          description: String(item.description || `Hỗ trợ cụm ${item.name}`).slice(0, 100),
        }))),
    ));
  }
  components.push(
    new ActionRowBuilder().addComponents(userMenu),
    new ActionRowBuilder().addComponents(staffMenu),
    new ActionRowBuilder().addComponents(quickButtons),
    staffButtons,
  );

  return {
    content,
    embeds: [embed],
    components: components.slice(0, 5),
    allowedMentions,
  };
}

export async function findTicketPanelMessage(channel, ticket) {
  if (ticket?.panelMessageId) {
    const direct = await channel.messages.fetch(ticket.panelMessageId).catch(() => null);
    if (direct) return direct;
  }
  const pinned = await channel.messages.fetchPinned().catch(() => null);
  return pinned?.find((msg) => msg.author.id === channel.client.user.id && msg.components?.some((row) => row.components?.some((c) => ['ticket_cluster_select', 'ticket_quick_actions', 'ticket_quick_ai', 'ticket_claim'].includes(c.customId)))) || null;
}

export async function refreshTicketPanel(channel, suppliedTicket = null) {
  try {
    const [ticket, configResponse, clusters] = await Promise.all([
      suppliedTicket || getTicketByChannel(channel.id),
      getConfig(),
      getClusters().catch(() => []),
    ]);
    if (!ticket) return null;
    const config = configResponse?.data || configResponse || {};
    const payload = buildTicketPanelPayload({ ticket, config, option: ticket.option, clusters });
    const message = await findTicketPanelMessage(channel, ticket);
    if (message) {
      await message.edit(payload);
      if (ticket.panelMessageId !== message.id) await updateTicketWorkflow(channel.id, { panelMessageId: message.id });
      return message;
    }
    const created = await channel.send(payload);
    await created.pin().catch(() => {});
    await updateTicketWorkflow(channel.id, { panelMessageId: created.id });
    return created;
  } catch (error) {
    logger.warn('Không cập nhật được ticket panel:', error.message);
    return null;
  }
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  getClusters,
  getConfig,
  getIntentDetection,
  getOptions,
  getStaff,
  getTicketByChannel,
  moveTicketByChannel,
  sendSmartFeedback,
  updateTicketPriorityByChannel,
  updateTicketWorkflow,
} from '../utils/api.js';
import { invalidate } from '../utils/ticketCache.js';
import { INTENT_MAP } from '../../intelligence/intentCatalog.js';
import { answerTicketQuestion } from './ticketSmartHandler.js';
import { refreshTicketPanel } from './ticketPanel.js';
import logger from '../utils/logger.js';
import { clusterLabel, getDefaultCluster, mergeClusters } from '../../clusters/clusterCatalog.js';
import { eligibleMoveTargets, optionSupportsMoveCluster, parseCsvIds, staffCanAccessMoveOption } from '../../tickets/ticketMovePolicy.js';

function actor(interaction) {
  return { discordId: interaction.user.id, username: interaction.user.username, role: 'BOT_INTERACTION' };
}

async function loadContext(interaction) {
  const [ticket, configResponse, staff] = await Promise.all([
    getTicketByChannel(interaction.channelId),
    getConfig(),
    getStaff(),
  ]);
  const config = configResponse?.data || configResponse || {};
  return { ticket, config, staff };
}

function isStaff(interaction, config, staff = []) {
  return Boolean(
    interaction.member?.permissions?.has?.('Administrator') ||
    (config.staffRoleId && interaction.member?.roles?.cache?.has?.(config.staffRoleId)) ||
    staff.some((item) => item.discordId === interaction.user.id)
  );
}

function canMoveCurrentTicket(interaction, context) {
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  if (context.config?.staffRoleId && interaction.member?.roles?.cache?.has?.(context.config.staffRoleId)) return true;
  const record = context.staff.find((item) => String(item.discordId) === String(interaction.user.id));
  if (!record) return false;
  return staffCanAccessMoveOption(record, context.ticket?.optionId || context.ticket?.option?.id);
}

async function ownerOrStaff(interaction, context) {
  if (context.ticket?.creatorId === interaction.user.id || isStaff(interaction, context.config, context.staff)) return true;
  await interaction.reply({ content: '❌ Bạn không có quyền dùng thao tác này.', flags: MessageFlags.Ephemeral }).catch(() => {});
  return false;
}


function roleIdsForRoute(option, cluster, config) {
  const roles = new Set([
    ...parseCsvIds(cluster?.staffRoleIds),
    ...parseCsvIds(option?.allowedStaffRoles),
  ]);
  if (!roles.size && config?.staffRoleId) roles.add(String(config.staffRoleId));
  return roles;
}

function snapshotPermissionOverwrites(channel) {
  return channel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  }));
}

async function resolveMoveCategory(guild, option) {
  if (option?.discordCategoryId) {
    const direct = guild.channels.cache.get(option.discordCategoryId)
      || await guild.channels.fetch(option.discordCategoryId).catch(() => null);
    if (direct?.type === ChannelType.GuildCategory) return direct;
  }

  const wantedName = `${option?.emoji || '🎫'} ${String(option?.name || 'TICKET').toUpperCase()}`.slice(0, 100);
  let category = guild.channels.cache.find((item) => item.type === ChannelType.GuildCategory && item.name === wantedName);
  if (!category) {
    category = await guild.channels.create({
      name: wantedName,
      type: ChannelType.GuildCategory,
      reason: `Auto-created for ticket routing option ${option?.name || option?.id || 'unknown'}`,
    });
  }
  return category;
}

async function syncRoutePermissions({ channel, ticket, config, staff, oldOption, newOption, cluster }) {
  const oldRoles = roleIdsForRoute(oldOption, cluster, config);
  const newRoles = roleIdsForRoute(newOption, cluster, config);
  const oldStaff = new Set(staff.filter((item) => staffCanAccessMoveOption(item, oldOption?.id)).map((item) => String(item.discordId)));
  const newStaff = new Set(staff.filter((item) => staffCanAccessMoveOption(item, newOption?.id)).map((item) => String(item.discordId)));

  const allow = {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    ManageMessages: true,
  };

  for (const id of [...oldRoles].filter((id) => !newRoles.has(id))) {
    await channel.permissionOverwrites.delete(id, 'Ticket moved to another route').catch(() => {});
  }
  for (const id of [...oldStaff].filter((id) => !newStaff.has(id) && id !== String(ticket.creatorId))) {
    await channel.permissionOverwrites.delete(id, 'Staff no longer scoped to moved ticket').catch(() => {});
  }
  for (const id of newRoles) await channel.permissionOverwrites.edit(id, allow, { reason: 'Ticket route permissions' });
  for (const id of newStaff) {
    if (id !== String(ticket.creatorId)) await channel.permissionOverwrites.edit(id, allow, { reason: 'Ticket route staff permissions' });
  }
}

async function buildMoveComponents(context, page = 0) {
  const options = await getOptions();
  const targets = eligibleMoveTargets(options, context.ticket.optionId || context.ticket.option?.id, context.ticket.clusterKey);
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(targets.length / pageSize));
  const safePage = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  const visible = targets.slice(safePage * pageSize, (safePage + 1) * pageSize);
  if (!visible.length) return { targets, components: [], page: safePage, pages };

  const select = new StringSelectMenuBuilder()
    .setCustomId(`ticket_move_select:${safePage}`)
    .setPlaceholder('Chọn mục cần chuyển ticket tới...')
    .addOptions(visible.map((option) => ({
      label: String(option.name || 'Mục ticket').slice(0, 100),
      value: String(option.id),
      emoji: option.emoji || '📁',
      description: String(option.description || `Chuyển sang ${option.name}`).slice(0, 100),
    })));
  const components = [new ActionRowBuilder().addComponents(select)];
  if (pages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_move_page:${safePage - 1}`).setLabel('Trước').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
      new ButtonBuilder().setCustomId(`ticket_move_page:${safePage + 1}`).setLabel('Sau').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pages - 1),
    ));
  }
  return { targets, components, page: safePage, pages };
}

function questionModal(userId) {
  const modal = new ModalBuilder().setCustomId(`ticket_ai_question:${userId}`).setTitle('Hỏi AI nhanh');
  const input = new TextInputBuilder()
    .setCustomId('question')
    .setLabel('Bạn cần hỏi gì?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(1200)
    .setPlaceholder('Ví dụ: Tôi cần cung cấp gì để staff kiểm tra mất đồ?');
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function detailsModal(userId) {
  const modal = new ModalBuilder().setCustomId(`ticket_add_details:${userId}`).setTitle('Bổ sung thông tin');
  const details = new TextInputBuilder()
    .setCustomId('details')
    .setLabel('Thông tin bổ sung')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1400)
    .setPlaceholder('Thời gian, tên vật phẩm, tên người chơi, lỗi gặp phải...');
  const evidence = new TextInputBuilder()
    .setCustomId('evidence')
    .setLabel('Link ảnh/video (không bắt buộc)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://...');
  modal.addComponents(
    new ActionRowBuilder().addComponents(details),
    new ActionRowBuilder().addComponents(evidence),
  );
  return modal;
}

function labelForWorkflow(status) {
  return ({ waiting_staff: '🛡️ Chờ Staff', waiting_user: '👤 Chờ member', ai_assisting: '🤖 AI hỗ trợ', resolved: '✅ Đã xử lý' })[status] || '🛡️ Chờ Staff';
}

function labelForPriority(priority) {
  return ({ normal: '🟢 Thường', high: '🟠 Cao', urgent: '🔴 Khẩn' })[priority] || '🟢 Thường';
}

function buildStatusEmbed(ticket, clusters = []) {
  const cluster = mergeClusters(clusters).find((item) => item.key === ticket.clusterKey) || getDefaultCluster(ticket.clusterKey);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 Ticket #${String(ticket.ticketNum).padStart(4, '0')}`)
    .setDescription('Thông tin xử lý hiện tại của ticket.')
    .addFields(
      {
        name: '📌 Tổng quan',
        value: [
          `• **Cụm:** ${clusterLabel(cluster)}`,
          `• **Trạng thái:** ${labelForWorkflow(ticket.workflowStatus)}`,
          `• **Ưu tiên:** ${labelForPriority(ticket.priority)}`,
          `• **Staff:** ${ticket.claimerId ? `<@${ticket.claimerId}>` : 'Chưa nhận'}`,
        ].join('\n').slice(0, 1024),
        inline: false,
      },
      {
        name: '🤖 AI & hoạt động',
        value: [
          `• **AI:** ${ticket.aiPaused ? '🔕 Đang tạm dừng' : '🤖 Sẵn sàng'}`,
          `• **Số gợi ý AI:** ${String(ticket.aiReplyCount || 0)}`,
          `• **Tin nhắn đã ghi nhận:** ${String(ticket.messageCount || 0)}`,
        ].join('\n').slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({ text: 'Ưu tiên bấm nút ở panel chính để thao tác nhanh' })
    .setTimestamp();
}

async function escalateInTicket(interaction, context) {
  const { ticket, config } = context;
  if (!ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  const last = ticket.lastEscalatedAt ? new Date(ticket.lastEscalatedAt).getTime() : 0;
  const cooldown = 10 * 60_000;
  if (last && Date.now() - last < cooldown) {
    return interaction.reply({ content: 'ℹ️ Staff đã được gọi gần đây. Bạn không cần bấm lại.', flags: MessageFlags.Ephemeral });
  }

  const clusters = mergeClusters(await getClusters().catch(() => []));
  const cluster = clusters.find((item) => item.key === ticket.clusterKey) || getDefaultCluster(ticket.clusterKey);
  const clusterRoleId = String(cluster?.staffRoleIds || '').split(',').map((item) => item.trim()).filter(Boolean)[0] || null;
  const roleId = clusterRoleId || config.smartEscalationRoleId || config.staffRoleId || null;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🆘 Cần Staff trực tiếp')
    .setDescription([
      `• <@${ticket.creatorId}> vừa yêu cầu người hỗ trợ trực tiếp.`,
      `• **Cụm:** ${clusterLabel(cluster)}`,
      '• AI đã được tạm dừng để tránh làm phiền thêm.',
      '• Staff có thể nhận ticket ngay từ panel phía trên.',
    ].join('\n'))
    .setFooter({ text: `Ticket #${String(ticket.ticketNum).padStart(4, '0')}` })
    .setTimestamp();
  await interaction.channel.send({
    content: roleId ? `<@&${roleId}>` : undefined,
    embeds: [embed],
    allowedMentions: roleId ? { roles: [roleId], users: [ticket.creatorId] } : { users: [ticket.creatorId] },
  });
  const updated = await updateTicketWorkflow(interaction.channelId, {
    aiPaused: true,
    workflowStatus: 'waiting_staff',
    lastEscalatedAt: new Date().toISOString(),
  }, actor(interaction));
  invalidate(interaction.channelId);
  await refreshTicketPanel(interaction.channel, updated || ticket);
  return interaction.reply({ content: '✅ Đã gọi staff và tạm dừng AI.', flags: MessageFlags.Ephemeral });
}

async function runQuickAction(interaction, context, action) {
  if (action === 'ai_help') {
    if (context.config.ticketRequireCluster !== false && !context.ticket.clusterKey) {
      return interaction.reply({ content: '🗺️ Hãy chọn cụm máy chủ trên ticket panel trước khi hỏi AI.', flags: MessageFlags.Ephemeral });
    }
    if (context.config.ticketAiEnabled === false || context.config.ticketAiMode === 'off') {
      return interaction.reply({ content: 'ℹ️ AI trong ticket đang tắt. Bạn hãy chọn “Cần Staff trực tiếp”.', flags: MessageFlags.Ephemeral });
    }
    if (context.ticket.aiPaused) {
      return interaction.reply({ content: '🔕 AI đang được tạm dừng trong ticket này để staff xử lý.', flags: MessageFlags.Ephemeral });
    }
    return interaction.showModal(questionModal(context.ticket.creatorId));
  }
  if (action === 'add_details') return interaction.showModal(detailsModal(context.ticket.creatorId));
  if (action === 'human') return escalateInTicket(interaction, context);
  if (action === 'close') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Chọn cách đóng').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({ content: 'Bấm nút dưới đây để chọn cách đóng ticket.', components: [row], flags: MessageFlags.Ephemeral });
  }
  if (action === 'status') {
    const clusters = await getClusters().catch(() => []);
    return interaction.reply({ embeds: [buildStatusEmbed(context.ticket, clusters)], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content: '❌ Thao tác không hợp lệ.', flags: MessageFlags.Ephemeral });
}

export async function handleTicketQuickActionSelect(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket || !(await ownerOrStaff(interaction, context))) return;
  const action = interaction.values?.[0];
  return runQuickAction(interaction, context, action);
}

export async function handleTicketQuickButton(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket || !(await ownerOrStaff(interaction, context))) return;
  const actionMap = {
    ticket_quick_ai: 'ai_help',
    ticket_quick_details: 'add_details',
    ticket_quick_status: 'status',
    ticket_quick_human: 'human',
    ticket_quick_close: 'close',
  };
  return runQuickAction(interaction, context, actionMap[interaction.customId]);
}

export async function handleTicketClusterSelect(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket || !(await ownerOrStaff(interaction, context))) return;
  const clusterKey = interaction.values?.[0];
  const clusters = mergeClusters(await getClusters().catch(() => []));
  const cluster = clusters.find((item) => item.key === clusterKey);
  if (!cluster) return interaction.reply({ content: '❌ Cụm này không tồn tại hoặc đang tắt.', flags: MessageFlags.Ephemeral });
  const optionScopes = String(context.ticket.option?.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
  if (!optionScopes.includes('*') && !optionScopes.includes(cluster.key)) {
    return interaction.reply({ content: `❌ Loại ticket này không áp dụng cho cụm ${cluster.name}.`, flags: MessageFlags.Ephemeral });
  }

  const updated = await updateTicketWorkflow(interaction.channelId, { clusterKey: cluster.key }, actor(interaction));
  invalidate(interaction.channelId);
  if (cluster.discordCategoryId && interaction.channel?.parentId !== cluster.discordCategoryId) {
    await interaction.channel.setParent(cluster.discordCategoryId, { lockPermissions: false }).catch(() => {});
  }
  for (const roleId of String(cluster.staffRoleIds || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    await interaction.channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      ManageMessages: true,
    }).catch(() => {});
  }
  await refreshTicketPanel(interaction.channel, updated || { ...context.ticket, clusterKey: cluster.key });
  const parsedColor = Number.parseInt(String(cluster.color || '#5865F2').replace('#', ''), 16);
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(Number.isFinite(parsedColor) ? parsedColor : 0x5865f2)
      .setTitle(`${cluster.emoji || '🗺️'} Đã chọn cụm ${cluster.name}`)
      .setDescription('AI, Knowledge Base và staff routing từ giờ sẽ dùng đúng dữ liệu của cụm này.')
      .setFooter({ text: 'Bạn có thể tiếp tục bằng các button trên ticket panel' })],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleTicketStaffActionSelect(interaction, claimHandler) {
  const context = await loadContext(interaction);
  if (!context.ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  if (!isStaff(interaction, context.config, context.staff)) {
    return interaction.reply({ content: '❌ Menu này chỉ dành cho staff.', flags: MessageFlags.Ephemeral });
  }
  const action = interaction.values?.[0];
  if (action === 'claim') return claimHandler(interaction);

  let updated = context.ticket;
  if (action.startsWith('priority_')) {
    const priority = action.replace('priority_', '');
    updated = await updateTicketPriorityByChannel(interaction.channelId, priority, actor(interaction));
  } else if (action === 'waiting_user' || action === 'waiting_staff') {
    updated = await updateTicketWorkflow(interaction.channelId, { workflowStatus: action }, actor(interaction));
  } else if (action !== 'refresh') {
    return interaction.reply({ content: '❌ Thao tác không hợp lệ.', flags: MessageFlags.Ephemeral });
  }
  invalidate(interaction.channelId);
  await refreshTicketPanel(interaction.channel, updated || context.ticket);
  return interaction.reply({ content: '✅ Đã cập nhật ticket panel.', flags: MessageFlags.Ephemeral });
}

export async function handleTicketAiButton(interaction) {
  const parts = interaction.customId.split(':');
  const type = parts[0];
  const context = await loadContext(interaction);
  if (!context.ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  const expectedUserId = type === 'ticket_ai_choice' ? parts[2] : parts[1];
  if (interaction.user.id !== expectedUserId && !isStaff(interaction, context.config, context.staff)) {
    return interaction.reply({ content: '❌ Nút này thuộc ticket của người khác.', flags: MessageFlags.Ephemeral });
  }

  if (type === 'ticket_ai_ask') {
    if (context.config.ticketAiEnabled === false || context.config.ticketAiMode === 'off' || context.ticket.aiPaused) {
      return interaction.reply({ content: '🔕 AI đang tạm dừng. Staff sẽ tiếp tục hỗ trợ ticket này.', flags: MessageFlags.Ephemeral });
    }
    return interaction.showModal(questionModal(context.ticket.creatorId));
  }
  if (type === 'ticket_ai_human') {
    const detectionId = parts[2];
    if (detectionId && detectionId !== 'none') {
      await sendSmartFeedback({
        detectionId, userId: expectedUserId, helpful: false, note: 'ticket_user_requested_human',
      }).catch(() => {});
    }
    return escalateInTicket(interaction, context);
  }
  if (type === 'ticket_ai_pause_user') {
    const updated = await updateTicketWorkflow(interaction.channelId, { aiPaused: true, workflowStatus: 'waiting_staff' }, actor(interaction));
    invalidate(interaction.channelId);
    await refreshTicketPanel(interaction.channel, updated || context.ticket);
    return interaction.reply({ content: '🔕 Đã tắt gợi ý AI trong ticket. Staff vẫn có thể hỗ trợ.', flags: MessageFlags.Ephemeral });
  }
  if (type === 'ticket_ai_resolved') {
    const detectionId = parts[2];
    if (detectionId && detectionId !== 'none') {
      await sendSmartFeedback({
        detectionId, userId: expectedUserId, helpful: true, note: 'ticket_user_resolved_by_ai',
      }).catch(() => {});
    }
    const updated = await updateTicketWorkflow(interaction.channelId, { aiPaused: true, workflowStatus: 'resolved' }, actor(interaction));
    invalidate(interaction.channelId);
    await refreshTicketPanel(interaction.channel, updated || context.ticket);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Đóng ticket').setEmoji('🔒').setStyle(ButtonStyle.Success),
    );
    return interaction.reply({ content: '✅ Tuyệt! Bạn có thể đóng ticket ngay.', components: [row], flags: MessageFlags.Ephemeral });
  }
  if (type === 'ticket_ai_choice') {
    const intentKey = parts[1];
    const userId = parts[2];
    const detectionId = parts[3];
    const intent = INTENT_MAP.get(intentKey);
    const detection = await getIntentDetection(detectionId);
    if (!intent) return interaction.reply({ content: '❌ Lựa chọn này không còn tồn tại.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sendSmartFeedback({ detectionId, userId, helpful: false, correctedIntent: intentKey }).catch(() => {});
    await answerTicketQuestion({
      channel: interaction.channel,
      user: interaction.user,
      ticket: context.ticket,
      content: `${intent.label}. ${detection?.content || ''}`.trim(),
      config: context.config,
      explicit: true,
    });
    return interaction.editReply({ content: '✅ Đã cập nhật gợi ý theo lựa chọn của bạn.' });
  }

  if (type === 'ticket_ai_toggle') {
    return interaction.reply({ content: 'ℹ️ Tùy chọn “Tạm AI” đã được thay thế bằng luồng xử lý hiện tại của panel (gọi Staff/Human khi cần).', flags: MessageFlags.Ephemeral });
  }

  return interaction.reply({ content: '❌ Nút AI này không còn áp dụng.', flags: MessageFlags.Ephemeral });
}

export async function handleTicketAiQuestionModal(interaction) {
  const expectedUserId = interaction.customId.split(':')[1];
  if (interaction.user.id !== expectedUserId) return interaction.reply({ content: '❌ Form này không thuộc bạn.', flags: MessageFlags.Ephemeral });
  const context = await loadContext(interaction);
  if (!context.ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  if (context.config.ticketRequireCluster !== false && !context.ticket.clusterKey) {
    return interaction.reply({ content: '🗺️ Hãy chọn cụm máy chủ trên ticket panel trước khi hỏi AI.', flags: MessageFlags.Ephemeral });
  }
  if (context.config.ticketAiEnabled === false || context.config.ticketAiMode === 'off') {
    return interaction.reply({ content: 'ℹ️ AI trong ticket đang tắt. Bạn hãy chọn “Cần Staff trực tiếp”.', flags: MessageFlags.Ephemeral });
  }
  if (context.ticket.aiPaused) {
    return interaction.reply({ content: '🔕 AI đang được tạm dừng trong ticket này để staff xử lý.', flags: MessageFlags.Ephemeral });
  }
  const question = interaction.fields.getTextInputValue('question')?.trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await answerTicketQuestion({
    channel: interaction.channel,
    user: interaction.user,
    ticket: context.ticket,
    content: question,
    config: context.config,
    explicit: true,
  });
  return interaction.editReply({ content: result.handled ? '✅ Câu trả lời đã được cập nhật trong AI panel.' : '⚠️ AI chưa thể trả lời. Bạn có thể chọn “Cần Staff”.' });
}

export async function handleTicketAddDetailsModal(interaction) {
  const expectedUserId = interaction.customId.split(':')[1];
  const context = await loadContext(interaction);
  if (!context.ticket || !(interaction.user.id === expectedUserId || isStaff(interaction, context.config, context.staff))) {
    return interaction.reply({ content: '❌ Form này không hợp lệ.', flags: MessageFlags.Ephemeral });
  }
  const details = interaction.fields.getTextInputValue('details')?.trim() || '';
  const evidence = interaction.fields.getTextInputValue('evidence')?.trim() || '';
  const summary = [context.ticket.aiSummary, `**Bổ sung:** ${details}`, evidence ? `**Bằng chứng:** ${evidence}` : '']
    .filter(Boolean).join('\n').slice(0, 1800);
  const updated = await updateTicketWorkflow(interaction.channelId, {
    aiSummary: summary,
    workflowStatus: 'waiting_staff',
    lastUserMessageAt: new Date().toISOString(),
  }, actor(interaction));
  invalidate(interaction.channelId);
  await refreshTicketPanel(interaction.channel, updated || context.ticket);
  return interaction.reply({ content: '✅ Đã thêm thông tin vào ticket panel. Ảnh/video có thể gửi trực tiếp trong channel.', flags: MessageFlags.Ephemeral });
}

export function logTicketInteractionError(error) {
  logger.warn('Ticket interaction lỗi:', error.message);
}


export async function handleTicketMoveButton(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  if (!canMoveCurrentTicket(interaction, context)) {
    return interaction.reply({ content: '❌ Bạn không có quyền chuyển ticket ở mục hiện tại.', flags: MessageFlags.Ephemeral });
  }
  if (!['open', 'claimed'].includes(context.ticket.status)) {
    return interaction.reply({ content: '❌ Chỉ có thể chuyển ticket đang mở/đang xử lý.', flags: MessageFlags.Ephemeral });
  }
  const menu = await buildMoveComponents(context, 0);
  if (!menu.targets.length) {
    return interaction.reply({ content: 'ℹ️ Không có mục phù hợp khác để chuyển ticket này.', flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({
    content: `📦 **Move Ticket #${String(context.ticket.ticketNum).padStart(4, '0')}**\nHiện tại: **${context.ticket.option?.emoji || '🎫'} ${context.ticket.option?.name || 'Không rõ'}**${menu.pages > 1 ? ` · Trang ${menu.page + 1}/${menu.pages}` : ''}`,
    components: menu.components,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleTicketMovePage(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket || !canMoveCurrentTicket(interaction, context)) {
    return interaction.reply({ content: '❌ Bạn không có quyền chuyển ticket.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  const page = Number(interaction.customId.split(':')[1] || 0);
  const menu = await buildMoveComponents(context, page);
  return interaction.update({
    content: `📦 **Move Ticket #${String(context.ticket.ticketNum).padStart(4, '0')}**\nHiện tại: **${context.ticket.option?.emoji || '🎫'} ${context.ticket.option?.name || 'Không rõ'}** · Trang ${menu.page + 1}/${menu.pages}`,
    components: menu.components,
  });
}

export async function handleTicketMoveSelect(interaction) {
  const context = await loadContext(interaction);
  if (!context.ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket.', flags: MessageFlags.Ephemeral });
  if (!canMoveCurrentTicket(interaction, context)) {
    return interaction.reply({ content: '❌ Bạn không có quyền chuyển ticket ở mục hiện tại.', flags: MessageFlags.Ephemeral });
  }
  if (!['open', 'claimed'].includes(context.ticket.status)) {
    return interaction.reply({ content: '❌ Ticket đã đóng hoặc không còn ở trạng thái có thể chuyển.', flags: MessageFlags.Ephemeral });
  }

  const targetOptionId = String(interaction.values?.[0] || '');
  const options = await getOptions();
  const target = options.find((item) => String(item.id) === targetOptionId);
  if (!target || String(target.id) === String(context.ticket.optionId || context.ticket.option?.id)) {
    return interaction.reply({ content: '❌ Mục đích không hợp lệ.', flags: MessageFlags.Ephemeral });
  }
  if (!optionSupportsMoveCluster(target, context.ticket.clusterKey)) {
    return interaction.reply({ content: '❌ Mục này không hỗ trợ cụm hiện tại của ticket.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const oldOption = options.find((item) => String(item.id) === String(context.ticket.optionId || context.ticket.option?.id)) || context.ticket.option || null;
  const clusters = mergeClusters(await getClusters().catch(() => []));
  const cluster = clusters.find((item) => item.key === context.ticket.clusterKey) || getDefaultCluster(context.ticket.clusterKey);
  const oldParentId = interaction.channel.parentId || null;
  const oldOverwrites = snapshotPermissionOverwrites(interaction.channel);
  let targetCategory = null;

  try {
    targetCategory = await resolveMoveCategory(interaction.guild, target);
    if (interaction.channel.parentId !== targetCategory.id) {
      await interaction.channel.setParent(targetCategory.id, { lockPermissions: false, reason: `Ticket #${context.ticket.ticketNum} moved to ${target.name} by ${interaction.user.username}` });
    }
    await syncRoutePermissions({
      channel: interaction.channel, ticket: context.ticket, config: context.config, staff: context.staff,
      oldOption, newOption: target, cluster,
    });

    const moved = await moveTicketByChannel(interaction.channelId, target.id, actor(interaction), {
      fromCategoryId: oldParentId,
      toCategoryId: targetCategory.id,
      reason: 'manual_staff_routing',
    });
    const updated = moved?.ticket || { ...context.ticket, optionId: target.id, option: target };

    const topicParts = [
      `Ticket #${context.ticket.ticketNum}`,
      cluster?.name || null,
      target.name,
      `Tạo bởi ${context.ticket.creatorName || context.ticket.creatorId}`,
    ].filter(Boolean);
    await interaction.channel.setTopic(topicParts.join(' | ').slice(0, 1024), 'Ticket moved').catch(() => {});

    invalidate(interaction.channelId);
    await refreshTicketPanel(interaction.channel, updated);
    await interaction.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📦 Ticket đã được chuyển mục')
        .setDescription([
          `**Từ:** ${oldOption?.emoji || '🎫'} ${oldOption?.name || 'Không rõ'}`,
          `**Sang:** ${target.emoji || '📁'} ${target.name}`,
          `**Thực hiện bởi:** <@${interaction.user.id}>`,
          context.ticket.clusterKey ? `**Cụm:** ${clusterLabel(cluster)}` : null,
        ].filter(Boolean).join('\n'))
        .setFooter({ text: `Ticket #${String(context.ticket.ticketNum).padStart(4, '0')} • Lịch sử move đã được lưu` })
        .setTimestamp()],
      allowedMentions: { users: [interaction.user.id] },
    }).catch(() => {});

    return interaction.editReply({
      content: `✅ Đã chuyển ticket từ **${oldOption?.name || 'mục cũ'}** sang **${target.name}** và đồng bộ quyền staff.`,
      components: [],
    });
  } catch (error) {
    logger.error('Move ticket thất bại:', error.response?.data?.message || error.message);
    // Discord đã đổi trước nhưng DB thất bại -> rollback best-effort để không lệch routing.
    if (targetCategory) {
      if (oldParentId && interaction.channel.parentId !== oldParentId) {
        await interaction.channel.setParent(oldParentId, { lockPermissions: false, reason: 'Rollback failed ticket move' }).catch(() => {});
      }
      await interaction.channel.permissionOverwrites.set(oldOverwrites, 'Rollback failed ticket move permissions').catch(() => {});
    }
    return interaction.editReply({
      content: `❌ Không chuyển được ticket: ${error.response?.data?.message || error.message || 'lỗi không xác định'}`,
      components: [],
    });
  }
}

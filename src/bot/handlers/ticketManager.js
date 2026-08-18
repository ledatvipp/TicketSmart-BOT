// ========================
// Ticket Manager
// Tạo channel, category, gửi embed. Không còn in-memory state — DB là nguồn truth.
// ========================

import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Colors,
  MessageFlags,
} from 'discord.js';
import { getConfig, createTicket as apiCreateTicket, getOptions, getClusters, updateTicketChannel, updateTicketWorkflow, getStaff, cancelTicketCreation } from '../utils/api.js';
import { setTicket } from '../utils/ticketCache.js';
import logger from '../utils/logger.js';
import { buildTicketPanelPayload } from './ticketPanel.js';
import { mergeClusters } from '../../clusters/clusterCatalog.js';

/**
 * Lấy hoặc tạo category trong guild theo tên
 */
async function getOrCreateCategory(guild, categoryName) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === categoryName
  );
  if (!category) {
    logger.info(`Tạo category mới: "${categoryName}"`);
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      position: 0,
    });
  }
  return category;
}

export function canReceiveTicketChannelAccess(staff, optionId) {
  if (!/^\d{15,22}$/.test(String(staff?.discordId || ''))) return false;
  if (staff.allOptions === true) return true;
  const allowedIds = Array.isArray(staff.allowedOptions)
    ? staff.allowedOptions.map(String)
    : String(staff.allowedOptions || '').split(',').map((id) => id.trim()).filter(Boolean);
  return allowedIds.length === 0 || allowedIds.includes(String(optionId));
}

/**
 * Tạo ticket channel mới
 */
export async function createTicket(interaction, type, optionId, formData = null, ticketOptions = {}) {
  const { guild, user } = interaction;
  let createdChannel = null;
  let createdTicketId = null;

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

    // Lấy option data — bắt buộc phải có
    if (!optionId) throw new Error('Thiếu optionId');
    const [options, clusterRows] = await Promise.all([getOptions(), getClusters().catch(() => [])]);
    const optionData = options.find((o) => String(o.id) === String(optionId));
    if (!optionData) throw new Error(`Option không tồn tại: ${optionId}`);
    const clusters = mergeClusters(clusterRows);
    const cluster = ticketOptions.clusterKey ? clusters.find((item) => item.key === ticketOptions.clusterKey) : null;
    if (ticketOptions.clusterKey && !cluster) throw new Error('Cụm máy chủ không tồn tại hoặc đang tắt');
    if (cluster && optionData.clusterKeys && optionData.clusterKeys !== '*') {
      const scopes = optionData.clusterKeys.split(',').map((item) => item.trim()).filter(Boolean);
      if (!scopes.includes(cluster.key)) throw new Error(`Loại ticket này không áp dụng cho cụm ${cluster.name}`);
    }

    // Ưu tiên category theo cụm, sau đó mới dùng category theo loại ticket.
    let category;
    if (cluster?.discordCategoryId) category = guild.channels.cache.get(cluster.discordCategoryId);
    if (category && category.type !== ChannelType.GuildCategory) category = null;
    if (!category && optionData.discordCategoryId) category = guild.channels.cache.get(optionData.discordCategoryId);
    if (category && category.type !== ChannelType.GuildCategory) category = null;
    if (!category) {
      const categoryName = cluster
        ? `${cluster.emoji || '🗺️'} TICKET ${cluster.name.toUpperCase()}`
        : `${optionData.emoji || '🗺️'} ${optionData.name.toUpperCase()}`;
      category = await getOrCreateCategory(guild, categoryName);
    }

    const ticketPayload = {
      guildId: guild.id,
      creationKey: interaction.id,
      creatorId: user.id,
      creatorName: user.displayName || user.username,
      creatorAvatar: user.displayAvatarURL(),
      type,
      clusterKey: cluster?.key || null,
      optionId: optionId || null,
      formData: formData || null,
      priority: ['normal', 'high', 'urgent'].includes(ticketOptions.priority) ? ticketOptions.priority : 'normal',
    };

    const ticketApiResp = await apiCreateTicket(ticketPayload);
    if (!ticketApiResp?.success) {
      // API thường ném error nhưng phòng case unexpected
      throw new Error(ticketApiResp?.message || 'API tạo ticket lỗi');
    }
    const ticketData = ticketApiResp.data;
    const { ticketNum, id: ticketId } = ticketData;
    createdTicketId = ticketId;

    const channelName = `ticket-${String(ticketNum).padStart(4, '0')}`;

    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Lấy danh sách staff từ database để cấp quyền xem kênh cá nhân
    let dbStaff = [];
    try {
      dbStaff = await getStaff();
    } catch (e) {
      logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
    }

    // Lọc danh sách staff có quyền xem option này dựa trên allowedOptions
    const eligibleStaff = dbStaff.filter((staff) => canReceiveTicketChannelAccess(staff, optionId));

    // Quyết định role pings/view cho staff (ưu tiên allowedStaffRoles của Option, fallback về global staffRoleId)
    const roleSet = new Set();
    for (const roleId of String(cluster?.staffRoleIds || '').split(',').map((r) => r.trim()).filter(Boolean)) roleSet.add(roleId);
    for (const roleId of String(optionData.allowedStaffRoles || '').split(',').map((r) => r.trim()).filter(Boolean)) roleSet.add(roleId);
    if (!roleSet.size && cfg.staffRoleId) roleSet.add(cfg.staffRoleId);
    const allowedRoles = [...roleSet];

    const panelPingRoleIds = [...new Set([
      ...(cfg.smartEscalationRoleId ? [String(cfg.smartEscalationRoleId)] : []),
      ...(cfg.staffRoleId ? [String(cfg.staffRoleId)] : []),
      ...allowedRoles,
    ])].filter((roleId) => /^\d{15,25}$/.test(String(roleId).trim())).slice(0, 1);

    // Add role permission overwrites
    for (const roleId of allowedRoles) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    // Add individual staff permission overwrites
    for (const staff of eligibleStaff) {
      permissionOverwrites.push({
        id: staff.discordId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites,
      topic: `Ticket #${ticketNum} | ${cluster ? `${cluster.name} | ` : ''}${optionData.name} | Tạo bởi ${user.username}`,
    });

    createdChannel = channel;
    logger.ticket('TẠO CHANNEL', ticketNum, `→ #${channelName}`);

    await updateTicketChannel(ticketId, channel.id);

    // Đẩy ngay vào cache (tránh GET lại sau vài giây)
    setTicket(channel.id, {
      id: ticketId,
      ticketNum,
      type,
      clusterKey: cluster?.key || null,
      creatorId: user.id,
      creatorName: user.displayName || user.username,
      claimerId: null,
      claimerName: null,
      channelId: channel.id,
      option: optionData,
      cluster: cluster || null,
      status: 'open',
      workflowStatus: ticketData.workflowStatus || 'waiting_staff',
      priority: ticketData.priority || 'normal',
      aiPaused: Boolean(ticketData.aiPaused),
      aiReplyCount: Number(ticketData.aiReplyCount || 0),
      messageCount: Number(ticketData.messageCount || 0),
      openedAt: ticketData.openedAt || new Date(),
      formData: formData || ticketData.formData || '{}',
    });

    const panelTicket = {
      ...ticketData,
      channelId: channel.id,
      status: 'open',
      workflowStatus: ticketData.workflowStatus || 'waiting_staff',
      option: optionData,
      clusterKey: cluster?.key || ticketData.clusterKey || null,
      cluster: cluster || null,
      formData: formData || ticketData.formData || '{}',
    };
    const panelMessage = await channel.send(buildTicketPanelPayload({
      ticket: panelTicket,
      config: cfg,
      option: optionData,
      creator: user,
      formData,
      clusters,
      cluster,
      pingRoleIds: panelPingRoleIds,
    }));
    await panelMessage.pin().catch(() => {});
    await updateTicketWorkflow(channel.id, { panelMessageId: panelMessage.id, workflowStatus: 'waiting_staff' });

    // Chế độ compact giữ ticket gọn: không phát nhiều welcome/auto-message rời rạc.
    if (optionData && cfg.ticketCompactMode === false) {
      if (optionData.welcomeMessage) await channel.send(optionData.welcomeMessage);
      const autoMessages = JSON.parse(optionData.autoMessages || '[]');
      for (const msg of autoMessages) {
        if (msg.content && msg.delay >= 0) {
          setTimeout(() => channel.send(msg.content).catch(() => {}), msg.delay * 1000);
        }
      }
    }

    try {
      const replyContent = `✅ Ticket${cluster ? ` **${cluster.emoji || '🗺️'} ${cluster.name}**` : ''} đã được tạo! Vào ${channel} để xem.`;
      if (interaction.deferred) {
        await interaction.editReply({ content: replyContent, components: [], embeds: [] });
      } else {
        await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      logger.warn('Không thể reply user:', replyError.message);
    }

    return { channel, ticketNum, ticketId };
  } catch (error) {
    logger.error('Lỗi createTicket:', error.message);

    // Bảo đảm không để lại channel hoặc record ticket mồ côi.
    if (createdChannel) {
      await createdChannel.delete(`Rollback ticket creation: ${error.message}`).catch((cleanupError) => {
        logger.warn('Không xóa được channel rollback:', cleanupError.message);
      });
    }
    if (createdTicketId) {
      await cancelTicketCreation(createdTicketId, error.message);
    }

    throw error;
  }
}

function parsePings(guild, pingString) {
  if (!pingString) return '';
  const cleanString = pingString.replace(/roles:|users:/gi, '');
  const parts = cleanString.split(/[,\s|]+/).map(x => x.trim()).filter(Boolean);
  const pings = parts.map(x => {
    if (x.startsWith('<@') && x.endsWith('>')) return x;
    if (/^\d+$/.test(x)) {
      if (guild.roles.cache.has(x)) {
        return `<@&${x}>`;
      }
      return `<@${x}>`;
    }
    return '';
  }).filter(Boolean);
  return pings.join(' ');
}

async function sendTicketEmbed(channel, { ticketNum, creator, optionData, globalCfg = {}, formData = null }) {
  const typeDisplay = `${optionData?.emoji || '🗺️'} ${optionData?.name || 'Option'}`;

  const useCustom = optionData?.customEmbedEnabled;
  const c = useCustom ? {
    ticketTitle:    optionData.ticketTitle    || globalCfg.ticketTitle,
    ticketDesc:     optionData.ticketDesc     || globalCfg.ticketDesc,
    ticketGuidance: optionData.ticketGuidance || globalCfg.ticketGuidance,
    ticketFooter:   optionData.ticketFooter   || globalCfg.ticketFooter,
    ticketColor:    optionData.ticketColor    || globalCfg.ticketColor,
    ticketShowType: globalCfg.ticketShowType, ticketShowCreator: globalCfg.ticketShowCreator,
    ticketShowTime: globalCfg.ticketShowTime, ticketShowGuide: globalCfg.ticketShowGuide,
  } : globalCfg;

  const r = (str = '') => str
    .replace(/\{ticketNum\}/g, String(ticketNum).padStart(4, '0'))
    .replace(/\{user\}/g, `${creator}`)
    .replace(/\{optionName\}/g, optionData?.name || '');

  const embed = new EmbedBuilder()
    .setTitle(r(c.ticketTitle || `🎫 Ticket #${String(ticketNum).padStart(4, '0')}`))
    .setDescription(r(c.ticketDesc || `Xin chào ${creator}!`))
    .setTimestamp();

  const rawColor = c.ticketColor ?? optionData?.color;
  const cleanColor = rawColor && rawColor !== 'none' ? String(rawColor).replace('#', '') : '';
  if (/^[0-9a-fA-F]{6}$/.test(cleanColor)) {
    embed.setColor(parseInt(cleanColor, 16));
  }

  const fields = [];
  if (c.ticketShowType !== false) fields.push({ name: '📋 Loại Ticket', value: typeDisplay, inline: true });
  if (c.ticketShowCreator !== false) fields.push({ name: '👤 Người Tạo', value: `${creator} (${creator.username})`, inline: true });
  if (c.ticketShowTime !== false) fields.push({ name: '📅 Thời Gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (c.ticketShowGuide !== false) {
    const guidance = c.ticketGuidance || '• Mô tả chi tiết\n• Kèm ảnh/video nếu có';
    fields.push({ name: '📌 Hướng Dẫn', value: guidance, inline: false });
  }
  // Form data → 1 field tổng hợp
  if (formData && Object.keys(formData).length > 0) {
    const formText = Object.values(formData)
      .map((f) => `**${f.label}**: ${f.value || '_(trống)_'}`)
      .join('\n');
    fields.push({ name: '📝 Thông Tin User Cung Cấp', value: formText.slice(0, 1000), inline: false });
  }

  if (fields.length) embed.addFields(fields);

  embed.setFooter({ text: r(c.ticketFooter || `ID: ${ticketNum}`) });

  const claimButton = new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success);
  const closeButton = new ButtonBuilder().setCustomId('ticket_close').setLabel('Đóng').setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

  let pingContent = `${creator}`;
  if (optionData?.pingStaff) {
    const pings = parsePings(channel.guild, optionData.pingStaff);
    if (pings) pingContent += ` ${pings}`;
  }

  const msg = await channel.send({ content: pingContent, embeds: [embed], components: [row] });
  await msg.pin().catch(() => {});
}

/**
 * Đổi tên channel sau khi claim
 */
export async function renameTicketChannel(channel, claimerName, ticketNum) {
  try {
    const safeName = claimerName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const newName = `${safeName}-${ticketNum}`;
    await channel.setName(newName);
    return newName;
  } catch (error) {
    logger.error('Lỗi đổi tên:', error.message);
    throw error;
  }
}

/**
 * Gửi embed log khi đóng ticket
 */
export async function sendCloseLog(guild, logChannelId, ticketInfo) {
  try {
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const { ticketNum, optionName, creatorName, claimerName, closedBy, ticketId } = ticketInfo;
    const webUrl = process.env.WEB_URL || '';
    const transcriptLink = webUrl ? `${webUrl}/tickets/${ticketId}` : null;

    const embed = new EmbedBuilder()
      .setColor(Colors.Grey)
      .setTitle(`🔒 Ticket #${String(ticketNum).padStart(4, '0')} Đã Đóng`)
      .addFields(
        { name: '📋 Loại', value: optionName || 'Option', inline: true },
        { name: '👤 Người Tạo', value: creatorName || 'Không rõ', inline: true },
        { name: '👮 Staff', value: claimerName || 'Chưa claim', inline: true },
        { name: '🔒 Đóng Bởi', value: closedBy || 'Không rõ', inline: true },
        { name: '🕐 Thời Gian', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        ...(transcriptLink ? [{ name: '📄 Transcript', value: `[Xem trên dashboard](${transcriptLink})`, inline: false }] : []),
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Lỗi gửi log đóng:', error.message);
  }
}

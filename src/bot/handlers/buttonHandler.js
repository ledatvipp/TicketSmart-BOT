// ========================
// Button Handler — Claim / Close
// Đọc ticket data từ DB (qua cache 30s), không còn in-memory Map
// ========================

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import apiClient, { claimTicket, closeTicket, getAllClusters, getAllOptions, getConfig, appendMessagesBulk, getStaff, updateTicketWorkflow } from '../utils/api.js';
import { lookupTicket, invalidate } from '../utils/ticketCache.js';
import { renameTicketChannel, sendCloseLog } from './ticketManager.js';
import { sendRatingDM } from './ratingHandler.js';
import logger from '../utils/logger.js';
import { refreshTicketPanel } from './ticketPanel.js';
import { isConfiguredTicketCategory } from '../utils/ticketCategories.js';

const CLOSE_PRESETS = {
  success: {
    label: 'Hỗ trợ thành công',
    closeType: 'success',
    requiresReason: true,
    placeholder: 'Ví dụ: Mình đã xử lý yêu cầu của bạn. Bạn kiểm tra lại giúp mình nhé.',
  },
  proof: {
    label: 'Đã làm xong + bằng chứng',
    closeType: 'proof',
    requiresReason: true,
    placeholder: 'Mô tả việc đã làm và gửi link ảnh/bằng chứng nếu có.',
  },
  no_response: {
    label: 'User không phản hồi',
    closeType: 'no_response',
    requiresReason: true,
    placeholder: 'Ví dụ: Ticket được đóng vì bạn chưa phản hồi sau thời gian chờ.',
  },
  rejected: {
    label: 'Từ chối yêu cầu',
    closeType: 'rejected',
    requiresReason: true,
    placeholder: 'Nêu lý do từ chối ngắn gọn, rõ ràng.',
  },
  silent: {
    label: 'Đóng im lặng',
    closeType: 'silent',
    requiresReason: false,
    placeholder: '',
  },
};

export async function handleClaimButton(interaction) {
  const { member, channel } = interaction;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

    let dbStaff = [];
    try {
      dbStaff = await getStaff();
    } catch (e) {
      logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
    }
    const isDbStaff = dbStaff.some(s => s.discordId === member.id);

    const isStaff = (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId)) || isDbStaff;
    const isAdmin = member.permissions.has('Administrator');
    if (!isStaff && !isAdmin) {
      return interaction.editReply({ content: '❌ Bạn không có quyền claim!' });
    }

    const ticket = await lookupTicket(channel.id);
    if (!ticket) {
      return interaction.editReply({ content: '❌ Không tìm thấy ticket này trong hệ thống!' });
    }

    if (ticket.claimerId) {
      return interaction.editReply({ content: `❌ Ticket đã được <@${ticket.claimerId}> claim!` });
    }

    const claimerId = member.id;
    const claimerName = member.user.username;

    await claimTicket(channel.id, claimerId, claimerName);
    const updatedTicket = await updateTicketWorkflow(channel.id, {
      workflowStatus: 'waiting_staff',
      ...(cfg.ticketAiPauseWhenClaimed !== false ? { aiPaused: true } : {}),
      lastStaffMessageAt: new Date().toISOString(),
    }, { discordId: claimerId, username: claimerName, role: 'STAFF' });
    invalidate(channel.id);

    await renameTicketChannel(channel, claimerName, ticket.ticketNum);

    // Cập nhật panel duy nhất thay vì tạo thêm nhiều tin nhắn.
    await refreshTicketPanel(channel, updatedTicket || { ...ticket, claimerId, claimerName, status: 'claimed' });

    if (cfg.ticketCompactMode !== false) {
      await interaction.editReply({ content: '✅ Bạn đã nhận ticket. Panel đã được cập nhật.' });
    } else {
      const claimEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Ticket Đã Được Nhận')
        .setDescription(`Ticket đã được <@${claimerId}> nhận!`)
        .setTimestamp();
      await interaction.editReply({ embeds: [claimEmbed] });
    }

    logger.ticket('CLAIM', ticket.ticketNum, `bởi ${claimerName}`);
  } catch (error) {
    logger.error('Lỗi claim:', error.message);
    try { await interaction.editReply({ content: '❌ Có lỗi khi claim. Thử lại!' }); } catch {}
  }
}

export async function handleCloseButton(interaction) {
  const { member, channel, user } = interaction;

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

    const ticket = await lookupTicket(channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ Không tìm thấy ticket!', flags: MessageFlags.Ephemeral });
    }

    let dbStaff = [];
    try {
      dbStaff = await getStaff();
    } catch (e) {
      logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
    }
    const isDbStaff = dbStaff.some(s => s.discordId === member.id);

    const isStaff = (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId)) || isDbStaff;
    const isAdmin = member.permissions.has('Administrator');
    const isCreator = ticket.creatorId === user.id;
    if (!isStaff && !isAdmin && !isCreator) {
      return interaction.reply({ content: '❌ Bạn không có quyền đóng ticket này!', flags: MessageFlags.Ephemeral });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_close_type')
      .setPlaceholder('Chọn kiểu đóng ticket')
      .addOptions(
        { label: 'Hỗ trợ thành công', value: 'success', description: 'Gửi kết quả hỗ trợ và yêu cầu đánh giá' },
        { label: 'Đã làm xong + bằng chứng', value: 'proof', description: 'Gửi nội dung kèm link ảnh/bằng chứng nếu có' },
        { label: 'User không phản hồi', value: 'no_response', description: 'Gửi thông báo đóng vì không có phản hồi' },
        { label: 'Từ chối yêu cầu', value: 'rejected', description: 'Gửi lý do từ chối, không bắt buộc rating' },
        { label: 'Đóng im lặng', value: 'silent', description: 'Không DM user, không gửi đánh giá' },
      );

    return interaction.reply({
      content: 'Chọn cách đóng ticket này.',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error('Lỗi mở close menu:', error.message);
    return interaction.reply({ content: '❌ Có lỗi khi mở menu đóng ticket.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

export async function handleCloseTypeSelect(interaction) {
  const closeKey = interaction.values?.[0];
  const preset = CLOSE_PRESETS[closeKey];
  if (!preset) return interaction.reply({ content: '❌ Kiểu đóng không hợp lệ.', flags: MessageFlags.Ephemeral });

  if (!preset.requiresReason) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await finalizeClose(interaction, { closeType: preset.closeType, reason: '' });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket_close_modal:${preset.closeType}`)
    .setTitle(preset.label);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Nội dung gửi cho người chơi')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1800)
    .setPlaceholder(preset.placeholder);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleCloseModalSubmit(interaction) {
  const closeType = interaction.customId.split(':')[1] || 'custom';
  const reason = interaction.fields.getTextInputValue('reason')?.trim() || '';
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await finalizeClose(interaction, { closeType, reason });
}

function collectMessageMedia(message) {
  const attachments = [...message.attachments.values()].map((a) => ({
    kind: 'attachment',
    url: a.url,
    name: a.name,
    contentType: a.contentType,
  }));
  const embeds = message.embeds
    .map((e, index) => ({
      kind: 'embed',
      title: e.title || '',
      description: e.description || '',
      url: e.url || '',
      color: e.color || null,
      image: e.image?.url || '',
      thumbnail: e.thumbnail?.url || '',
      author: e.author?.name || '',
      provider: e.provider?.name || '',
      footer: e.footer?.text || '',
      index,
    }))
    .filter((e) => e.title || e.description || e.image || e.thumbnail || e.url);
  return [...attachments, ...embeds];
}

async function finalizeClose(interaction, { closeType, reason }, options = {}) {
  const { member, channel, guild, user } = interaction;

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

    const ticket = await lookupTicket(channel.id);
    if (!ticket) {
      return interaction.editReply({ content: '❌ Không tìm thấy ticket!' });
    }

    let dbStaff = [];
    try {
      dbStaff = await getStaff();
    } catch (e) {
      logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
    }
    const isDbStaff = dbStaff.some(s => s.discordId === member.id);

    const isStaff = (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId)) || isDbStaff;
    const isAdmin = member.permissions.has('Administrator');
    const isCreator = ticket.creatorId === user.id;
    if (options.staffOnly ? (!isStaff && !isAdmin) : (!isStaff && !isAdmin && !isCreator)) {
      return interaction.editReply({ content: '❌ Bạn không có quyền đóng ticket này!' });
    }

    const closingEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('🔒 Đang Đóng Ticket...')
      .setDescription(`Đóng bởi <@${user.id}>.${reason ? `\n\n**Kết quả:** ${reason}` : ''}\n\nChannel sẽ xóa sau **5 giây**.`)
      .setTimestamp();
    await channel.send({ embeds: [closingEmbed] }).catch(() => {});
    await interaction.editReply({ content: 'Ticket đang được đóng...' });

    // Flush 100 message cuối vào DB (phòng có message chưa kịp log realtime)
    try {
      const fetched = await channel.messages.fetch({ limit: 100 });
      const messagesArray = [...fetched.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          discordMessageId: m.id,
          authorId: m.author?.id,
          authorName: m.author?.displayName || m.author?.username,
          authorAvatar: m.author?.displayAvatarURL?.() || null,
          isBot: m.author?.bot || false,
          content: m.content || '',
          attachments: collectMessageMedia(m),
          timestamp: m.createdAt,
        }));
      if (messagesArray.length) {
        await appendMessagesBulk(channel.id, messagesArray);
      }
    } catch (e) {
      logger.warn('Lỗi flush messages:', e.message);
    }

    try {
      await closeTicket(channel.id, user.id, user.username, { reason, closeType });
    } catch (e) {
      logger.warn('Lỗi API close:', e.message);
    }

    invalidate(channel.id);

    // Chỉ DM/rating khi staff nhập nội dung kết quả. Silent close không gửi gì.
    if (reason && cfg.ratingDmEnabled !== false) {
      sendRatingDM(interaction.client, {
        ...ticket,
        claimerId: ticket.claimerId || user.id,
        claimerName: ticket.claimerName || member.displayName || user.username,
        closeReason: reason,
      }, { reason, closeType, staffName: ticket.claimerName || member.displayName || user.username }).catch(() => {});
    }

    if (cfg.logChannelId) {
      try {
        await apiClient.post(`/api/tickets/${ticket.id}/send-to-channel`, {
          channelId: cfg.logChannelId,
          includeTranscript: true,
        });
      } catch (err) {
        logger.warn('Lỗi khi gửi transcript tự động đến log channel:', err.message);
        // Fallback sang log embed đơn giản nếu API gặp lỗi
        await sendCloseLog(guild, cfg.logChannelId, {
          ticketId: ticket.id,
          ticketNum: ticket.ticketNum,
          optionName: ticket.option?.name ? `${ticket.option.emoji || ''} ${ticket.option.name}` : 'Option',
          creatorName: ticket.creatorName,
          claimerName: ticket.claimerName,
          closedBy: member.displayName || user.username,
        });
      }
    }

    logger.ticket('ĐÓNG', ticket.ticketNum, `bởi ${user.username}`);

    // Snapshot category trước khi xóa channel
    const parentCategory = channel.parent;

    setTimeout(async () => {
      try {
        await channel.delete(`Ticket #${ticket.ticketNum} đã đóng`);
      } catch (e) {
        logger.error('Lỗi xóa channel:', e.message);
        return;
      }

      // Auto-delete category nếu trống — bỏ qua nếu user đã set discordCategoryId
      // (category do họ tự quản lý, không tự xóa)
      if (!parentCategory) return;
      const [options, clusters] = await Promise.all([getAllOptions().catch(() => []), getAllClusters().catch(() => [])]);
      if (isConfiguredTicketCategory(parentCategory.id, { options: [ticket.option, ...options], clusters })) return;

      // Cache có thể chưa kịp update sau channel.delete() → filter manually
      const remaining = parentCategory.children.cache.filter((c) => c.id !== channel.id);
      if (remaining.size > 0) return;

      try {
        await parentCategory.delete(`Category trống sau khi đóng ticket #${ticket.ticketNum}`);
        logger.info(`Đã xóa category trống: "${parentCategory.name}"`);
      } catch (e) {
        logger.warn(`Lỗi xóa category "${parentCategory.name}":`, e.message);
      }
    }, 5000);
  } catch (error) {
    logger.error('Lỗi đóng ticket:', error.message);
    try { await interaction.editReply({ content: '❌ Có lỗi khi đóng. Thử lại!' }); } catch {}
  }
}

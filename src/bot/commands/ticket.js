// /ticket — slash group command cho staff
// Subcommands: close, priority, tag, assign, note, canned, summary
import { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { lookupTicket, invalidate } from '../utils/ticketCache.js';
import { getAllClusters, getAllOptions, getConfig, getStaff } from '../utils/api.js';
import logger from '../utils/logger.js';
import axios from 'axios';
import { isConfiguredTicketCategory } from '../utils/ticketCategories.js';

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const SECRET = process.env.BOT_API_SECRET;
const H = SECRET ? { 'X-Bot-Secret': SECRET } : {};

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

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Quản lý ticket (staff only)')
  .addSubcommand((sc) => sc
    .setName('close').setDescription('Đóng ticket hiện tại')
    .addStringOption((o) => o.setName('reason').setDescription('Lý do (tùy chọn)'))
  )
  .addSubcommand((sc) => sc
    .setName('priority').setDescription('Đổi priority')
    .addStringOption((o) => o.setName('level').setDescription('Mức độ').setRequired(true)
      .addChoices(
        { name: 'Normal', value: 'normal' },
        { name: 'High', value: 'high' },
        { name: 'Urgent', value: 'urgent' },
      ))
  )
  .addSubcommand((sc) => sc
    .setName('tag').setDescription('Thêm/xóa tag')
    .addStringOption((o) => o.setName('action').setDescription('add|remove').setRequired(true)
      .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
    .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true))
  )
  .addSubcommand((sc) => sc
    .setName('assign').setDescription('Transfer ticket cho staff khác')
    .addUserOption((o) => o.setName('user').setDescription('Staff').setRequired(true))
  )
  .addSubcommand((sc) => sc
    .setName('note').setDescription('Thêm ghi chú nội bộ')
    .addStringOption((o) => o.setName('text').setDescription('Ghi chú').setRequired(true))
  )
  .addSubcommand((sc) => sc
    .setName('canned').setDescription('Gửi canned response')
    .addStringOption((o) => o.setName('shortcut').setDescription('Shortcut').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sc) => sc
    .setName('summary').setDescription('Hiện summary ticket'))
  .addSubcommand((sc) => sc
    .setName('watch').setDescription('Theo dõi ticket (nhận noti khi có activity)'))
  .addSubcommand((sc) => sc
    .setName('unwatch').setDescription('Bỏ theo dõi'));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  try {
    const { data } = await axios.get(`${API_URL}/api/canned`, {
      headers: { ...H, Authorization: '' }, // canned cần auth, skip ở đây
      timeout: 3000,
    }).catch(() => ({ data: { data: [] } }));
    const items = data?.data || [];
    const filtered = items.filter((c) => c.shortcut.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((c) => ({ name: `/${c.shortcut} — ${c.title}`, value: c.shortcut })));
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction) {
  // Verify staff
  const config = await getConfig().catch(() => null);
  const cfg = config?.data || config || {};
  let dbStaff = [];
  try {
    dbStaff = await getStaff();
  } catch (e) {
    logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
  }
  const isDbStaff = dbStaff.some(s => s.discordId === interaction.member.id);

  const isStaff = (cfg.staffRoleId && interaction.member.roles.cache.has(cfg.staffRoleId)) || isDbStaff;
  const isAdmin = interaction.member.permissions.has('Administrator');
  if (!isStaff && !isAdmin) {
    return interaction.reply({ content: '❌ Chỉ staff được dùng lệnh này.', flags: MessageFlags.Ephemeral });
  }

  const ticket = await lookupTicket(interaction.channelId);
  if (!ticket) {
    return interaction.reply({ content: '❌ Channel này không phải ticket.', flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  try {
    switch (sub) {
      case 'close':    return cmdClose(interaction, ticket);
      case 'priority': return cmdPriority(interaction, ticket);
      case 'tag':      return cmdTag(interaction, ticket);
      case 'assign':   return cmdAssign(interaction, ticket);
      case 'note':     return cmdNote(interaction, ticket);
      case 'canned':   return cmdCanned(interaction, ticket);
      case 'summary':  return cmdSummary(interaction, ticket);
      case 'watch':    return cmdWatch(interaction, ticket, true);
      case 'unwatch':  return cmdWatch(interaction, ticket, false);
    }
  } catch (err) {
    logger.error(`/ticket ${sub} lỗi:`, err.message);
    const reply = { content: '❌ ' + err.message, flags: MessageFlags.Ephemeral };
    if (interaction.deferred) await interaction.editReply(reply); else await interaction.reply(reply);
  }
}

// ─── Helpers gọi API qua bot secret ─────────────────────────────────────
function actorHeaders(user) {
  return user ? { ...H, 'X-Bot-Actor': JSON.stringify({ discordId: user.id, username: user.username }) } : H;
}
async function apiPatchByChannel(channelId, path, body, actor = null) {
  return axios.patch(`${API_URL}/api/tickets/by-channel/${channelId}/${path}`, body, { headers: actorHeaders(actor), timeout: 10000 });
}
async function apiPatch(id, path, body, actor = null) {
  return axios.patch(`${API_URL}/api/tickets/${id}/${path}`, body, { headers: actorHeaders(actor), timeout: 10000 });
}
async function apiPost(id, path, body, actor = null) {
  return axios.post(`${API_URL}/api/tickets/${id}/${path}`, body, { headers: actorHeaders(actor), timeout: 10000 });
}

// ─── Subcommands ─────────────────────────────────────────────────────────
async function cmdClose(interaction, ticket) {
  const { member, channel, guild, user } = interaction;
  await interaction.deferReply();
  const reason = interaction.options.getString('reason') || '';

  // 1. Flush 100 message cuối vào DB
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
      await axios.post(`${API_URL}/api/messages`, { channelId: channel.id, messages: messagesArray }, { headers: H, timeout: 5000 }).catch(() => {});
    }
  } catch (e) {
    logger.warn('Lỗi flush messages trong cmdClose:', e.message);
  }

  // 2. Gọi API close ticket
  try {
    await apiPatchByChannel(channel.id, 'close', {
      reason,
      closeType: reason ? 'custom' : 'silent',
    }, user);
  } catch (e) {
    logger.warn('Lỗi API close trong cmdClose:', e.message);
  }

  invalidate(channel.id);

  // Gửi thông báo đóng trong kênh
  const closingEmbed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle('🔒 Đang Đóng Ticket...')
    .setDescription(`Đóng bởi <@${user.id}>.${reason ? `\n\n**Lý do:** ${reason}` : ''}\n\nChannel sẽ xóa sau **5 giây**.`)
    .setTimestamp();
  await interaction.editReply({ embeds: [closingEmbed] });

  // 3. DM rating cho creator nếu enabled
  const config = await getConfig().catch(() => null);
  const cfg = config?.data || config || {};
  if (reason && cfg.ratingDmEnabled !== false) {
    const { sendRatingDM } = await import('../handlers/ratingHandler.js');
    sendRatingDM(interaction.client, {
      ...ticket,
      claimerId: ticket.claimerId || user.id,
      claimerName: ticket.claimerName || member.displayName || user.username,
      closeReason: reason,
    }, { reason, closeType: 'custom', staffName: ticket.claimerName || member.displayName || user.username }).catch(() => {});
  }

  // 4. Gửi transcript vào log channel
  if (cfg.logChannelId) {
    try {
      await axios.post(
        `${API_URL}/api/tickets/${ticket.id}/send-to-channel`,
        { channelId: cfg.logChannelId, includeTranscript: true },
        { headers: H, timeout: 15000 }
      );
    } catch (err) {
      logger.warn('Lỗi khi gửi transcript log trong cmdClose:', err.message);
      // Fallback log cơ bản
      const { sendCloseLog } = await import('../handlers/ticketManager.js');
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

  logger.ticket('ĐÓNG (CMD)', ticket.ticketNum, `bởi ${user.username}`);

  // 5. Xóa channel sau 5s và xóa category trống nếu cần
  const parentCategory = channel.parent;
  setTimeout(async () => {
    try {
      await channel.delete(`Ticket #${ticket.ticketNum} đã đóng bởi lệnh`);
    } catch (e) {
      logger.error('Lỗi xóa channel trong cmdClose:', e.message);
      return;
    }

    if (!parentCategory) return;
    const [options, clusters] = await Promise.all([getAllOptions().catch(() => []), getAllClusters().catch(() => [])]);
    if (isConfiguredTicketCategory(parentCategory.id, { options: [ticket.option, ...options], clusters })) return;

    const remaining = parentCategory.children.cache.filter((c) => c.id !== channel.id);
    if (remaining.size > 0) return;

    try {
      await parentCategory.delete(`Category trống sau khi đóng ticket #${ticket.ticketNum}`);
      logger.info(`Đã xóa category trống: "${parentCategory.name}"`);
    } catch (e) {
      logger.warn(`Lỗi xóa category "${parentCategory.name}":`, e.message);
    }
  }, 5000);
}

async function cmdPriority(interaction, ticket) {
  const level = interaction.options.getString('level');
  await axios.patch(`${API_URL}/api/tickets/${ticket.id}/priority`, { priority: level }, {
    headers: { ...H, 'X-Bot-Actor': JSON.stringify({ discordId: interaction.user.id, username: interaction.user.username }) },
    timeout: 10000,
  }).catch(async () => {
    // Fallback: gọi trực tiếp bằng prisma không khả thi từ bot → dùng audit qua API
    await apiPatch(ticket.id, 'priority', { priority: level }, interaction.user);
  });
  invalidate(interaction.channelId);
  await interaction.reply({ content: `⚡ Priority → **${level}**` });
}

async function cmdTag(interaction, ticket) {
  const action = interaction.options.getString('action');
  const name = interaction.options.getString('name').trim();
  const current = (ticket.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  let updated;
  if (action === 'add') updated = Array.from(new Set([...current, name]));
  else updated = current.filter((t) => t !== name);
  await apiPatch(ticket.id, 'tags', { tags: updated }, interaction.user);
  invalidate(interaction.channelId);
  await interaction.reply({ content: `🏷️ Tags: ${updated.length ? updated.join(', ') : '_(trống)_'}` });
}

async function cmdAssign(interaction, ticket) {
  const target = interaction.options.getUser('user');
  const dbStaff = await getStaff();
  if (!dbStaff.some((staff) => staff.discordId === target.id)) {
    return interaction.reply({ content: '❌ Người được giao phải có trong danh sách staff dashboard.', flags: MessageFlags.Ephemeral });
  }
  await apiPatchByChannel(interaction.channelId, 'assign', { discordId: target.id }, interaction.user);
  invalidate(interaction.channelId);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('🔄 Ticket transfer').setDescription(`Đã giao cho <@${target.id}> bởi <@${interaction.user.id}>`).setTimestamp()],
  });
}

async function cmdNote(interaction, ticket) {
  const text = interaction.options.getString('text');
  await apiPatch(ticket.id, 'note', { note: text }, interaction.user);
  await interaction.reply({ content: '📝 Đã lưu ghi chú nội bộ.', flags: MessageFlags.Ephemeral });
}

async function cmdCanned(interaction, ticket) {
  const shortcut = interaction.options.getString('shortcut');
  // Lookup canned từ API
  const { data } = await axios.get(`${API_URL}/api/canned/lookup/${encodeURIComponent(shortcut)}`, {
    headers: H, timeout: 5000,
  }).catch(() => ({ data: null }));
  const canned = data?.data;
  if (!canned) return interaction.reply({ content: '❌ Không tìm thấy canned: /' + shortcut, flags: MessageFlags.Ephemeral });

  const content = canned.content
    .replaceAll('{user}', `<@${ticket.creatorId}>`)
    .replaceAll('{ticketNum}', String(ticket.ticketNum).padStart(4, '0'))
    .replaceAll('{staff}', interaction.user.username);

  await interaction.reply({ content: `**${interaction.user.username}** (Staff):\n${content}` });
}

async function cmdSummary(interaction, ticket) {
  const sinceOpen = Math.floor((Date.now() - new Date(ticket.openedAt).getTime()) / 60_000);
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`📊 Summary #${String(ticket.ticketNum).padStart(4, '0')}`)
    .addFields(
      { name: 'Status', value: ticket.status, inline: true },
      { name: 'Priority', value: ticket.priority, inline: true },
      { name: 'Open', value: `${sinceOpen}m`, inline: true },
      { name: 'Creator', value: `<@${ticket.creatorId}>`, inline: true },
      { name: 'Staff', value: ticket.claimerId ? `<@${ticket.claimerId}>` : '—', inline: true },
      { name: 'Messages', value: String(ticket.messageCount || 0), inline: true },
      ...(ticket.tags ? [{ name: 'Tags', value: ticket.tags }] : []),
      ...(ticket.note ? [{ name: 'Note', value: ticket.note.slice(0, 200) }] : []),
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function cmdWatch(interaction, ticket, watch) {
  await apiPost(ticket.id, watch ? 'watch' : 'unwatch', { discordId: interaction.user.id });
  invalidate(interaction.channelId);
  await interaction.reply({ content: watch ? '👁️ Đã watch ticket này' : '👁️ Bỏ watch', flags: MessageFlags.Ephemeral });
}

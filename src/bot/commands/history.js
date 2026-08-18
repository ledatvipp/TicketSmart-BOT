// ========================
// /history — Staff tra cứu lịch sử ticket của 1 user
// Flow: pick user → filter → select ticket → preview + [Send] [DM .md]
// ========================

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from 'discord.js';
import axios from 'axios';
import logger from '../utils/logger.js';
import { getConfig, getStaff } from '../utils/api.js';

const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;
const BOT_SECRET = process.env.BOT_API_SECRET;

function actorHeaders(interaction) {
  const headers = { 'Content-Type': 'application/json' };
  if (BOT_SECRET) {
    headers['X-Bot-Secret'] = BOT_SECRET;
    headers['X-Bot-Actor'] = JSON.stringify({
      discordId: interaction.user.id,
      username: interaction.user.username,
      role: 'ADMIN',
    });
  }
  return headers;
}

const STATUS_CHOICES = [
  { name: 'Tất cả', value: 'all' },
  { name: '🟢 Đang mở', value: 'open' },
  { name: '🟡 Đang xử lý', value: 'claimed' },
  { name: '⚫ Đã đóng', value: 'closed' },
];

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('Tra cứu lịch sử ticket của 1 user và gửi summary lên channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addUserOption((o) =>
    o.setName('user').setDescription('User cần tra').setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('option').setDescription('Lọc theo loại ticket').setRequired(false).setAutocomplete(true),
  )
  .addStringOption((o) =>
    o.setName('status').setDescription('Trạng thái').setRequired(false).addChoices(...STATUS_CHOICES),
  )
  .addStringOption((o) =>
    o.setName('keyword').setDescription('Từ khóa (tìm trong form data, content, tags)').setRequired(false),
  );

// Autocomplete cho option
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const { data } = await axios.get(`${API_URL}/api/options`, { timeout: 3000 });
    const options = (data?.data || []).filter((o) => o.isActive);
    const filtered = options
      .filter((o) => o.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((o) => ({ name: `${o.emoji || '◈'} ${o.name}`, value: o.id }));
    await interaction.respond(filtered);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction) {
  const cfg = (await getConfig().catch(() => null))?.data || {};
  let dbStaff = [];
  try {
    dbStaff = await getStaff();
  } catch (e) {
    logger.error('Lỗi khi lấy danh sách staff từ API:', e.message);
  }
  const isDbStaff = dbStaff.some(s => s.discordId === interaction.member.id);

  const isStaff = (cfg.staffRoleId && interaction.member.roles.cache.has(cfg.staffRoleId)) || isDbStaff;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    || interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
  if (!isStaff && !isAdmin) {
    return interaction.reply({ content: '❌ Chỉ staff được dùng lệnh này!', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user');
  const optionId = interaction.options.getString('option');
  const status = interaction.options.getString('status');
  const keyword = interaction.options.getString('keyword');

  try {
    const params = { creatorId: target.id, limit: 100 };
    if (optionId) params.optionId = optionId;
    if (status && status !== 'all') params.status = status;
    if (keyword) params.keyword = keyword;

    const res = await axios.get(`${API_URL}/api/tickets/history`, {
      params,
      headers: actorHeaders(interaction),
      timeout: 10000,
    });

    const { items = [], total = 0, stats = {} } = res.data?.data || {};

    if (items.length === 0) {
      return interaction.editReply({
        content: `📭 **${target.username}** không có ticket nào${formatFilters({ optionId, status, keyword })}.`,
      });
    }

    // Build summary embed
    const summary = buildSummaryEmbed(target, items, stats, { optionId, status, keyword });

    // Build select menu (tối đa 25)
    const visibleItems = items.slice(0, 25);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`history_select:${target.id}`)
      .setPlaceholder(`Chọn 1 trong ${visibleItems.length}/${total} ticket để xem & gửi...`)
      .addOptions(
        visibleItems.map((t) => {
          const num = String(t.ticketNum).padStart(4, '0');
          const statusEmoji = t.status === 'open' ? '🟢' : t.status === 'claimed' ? '🟡' : '⚫';
          const date = new Date(t.openedAt).toLocaleDateString('vi-VN');
          const optionLabel = t.option ? `${t.option.emoji || ''} ${t.option.name}` : '—';
          return {
            label: `#${num} · ${optionLabel}`.slice(0, 100),
            description: `${statusEmoji} ${t.status} · ${date} · ${t._count?.messages ?? 0} msgs${t.tags ? ' · ' + t.tags.split(',').slice(0, 2).join(',') : ''}`.slice(0, 100),
            value: t.id,
          };
        }),
      );

    await interaction.editReply({
      embeds: [summary],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await interaction.editReply({ content: `❌ ${msg}` });
    logger.error('/history lỗi:', msg);
  }
}

function formatFilters({ optionId, status, keyword }) {
  const parts = [];
  if (optionId) parts.push('option');
  if (status && status !== 'all') parts.push(`status=${status}`);
  if (keyword) parts.push(`keyword="${keyword}"`);
  return parts.length ? ' (filter: ' + parts.join(', ') + ')' : '';
}

function buildSummaryEmbed(target, items, stats, filters) {
  const byStatus = stats.byStatus || {};
  const byOption = stats.byOption || {};

  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(`📚 Lịch sử ticket của ${target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`Tìm thấy **${items.length}** ticket${formatFilters(filters)}`)
    .addFields(
      {
        name: '🛡️ Theo trạng thái',
        value: [
          `🟢 Mở: **${byStatus.open || 0}**`,
          `🟡 Xử lý: **${byStatus.claimed || 0}**`,
          `⚫ Đóng: **${byStatus.closed || 0}**`,
        ].join('\n'),
        inline: true,
      },
      ...(Object.keys(byOption).length ? [{
        name: '📋 Theo loại (top 5)',
        value: Object.entries(byOption).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([name, count]) => `• ${name}: **${count}**`).join('\n'),
        inline: true,
      }] : []),
    )
    .setFooter({ text: 'Chọn 1 ticket từ menu dưới đây để xem chi tiết hoặc gửi lên channel' });

  if (items.length > 25) {
    embed.addFields({
      name: '⚠️ Lưu ý',
      value: `Có **${items.length}** kết quả nhưng chỉ hiện 25 mới nhất. Dùng filter (option/status/keyword) để thu hẹp.`,
      inline: false,
    });
  }

  return embed;
}

// ─── Handle select menu ───────────────────────────────────────────────────
export async function handleSelect(interaction) {
  const ticketId = interaction.values[0];

  await interaction.deferUpdate();

  try {
    const res = await axios.get(`${API_URL}/api/tickets/${ticketId}`, {
      headers: actorHeaders(interaction),
      timeout: 10000,
    }).catch(() => null);

    const ticket = res?.data?.data;
    if (!ticket) {
      return interaction.editReply({ content: '❌ Không tìm thấy ticket', embeds: [], components: [] });
    }

    const embed = buildTicketPreviewEmbed(ticket);

    const sendBtn = new ButtonBuilder()
      .setCustomId(`history_send:${ticket.id}`)
      .setLabel('📤 Gửi vào channel này (kèm transcript .md)')
      .setStyle(ButtonStyle.Primary);
    const dmBtn = new ButtonBuilder()
      .setCustomId(`history_dm:${ticket.id}`)
      .setLabel('💌 DM cho tôi')
      .setStyle(ButtonStyle.Secondary);
    const backBtn = new ButtonBuilder()
      .setCustomId(`history_back:${ticket.creatorId}`)
      .setLabel('← Quay lại')
      .setStyle(ButtonStyle.Secondary);

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(sendBtn, dmBtn, backBtn)],
    });
  } catch (err) {
    logger.error('history_select lỗi:', err.message);
    try { await interaction.editReply({ content: '❌ ' + err.message }); } catch {}
  }
}

function buildTicketPreviewEmbed(ticket) {
  const num = String(ticket.ticketNum).padStart(4, '0');
  const color = parseInt(String(ticket.option?.color || '#9d7bff').replace('#', ''), 16) || 0x9d7bff;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎫 Ticket #${num}`)
    .addFields(
      { name: '👤 Người tạo', value: `<@${ticket.creatorId}>`, inline: true },
      { name: '🛡️ Trạng thái', value: ticket.status, inline: true },
      { name: '⚡ Priority', value: ticket.priority, inline: true },
      { name: '📋 Loại', value: ticket.option ? `${ticket.option.emoji || ''} ${ticket.option.name}` : '—', inline: true },
      { name: '👮 Staff', value: ticket.claimerName || '—', inline: true },
      { name: '💬 Messages', value: String(ticket.messages?.length || 0), inline: true },
      { name: '📅 Mở', value: `<t:${Math.floor(new Date(ticket.openedAt).getTime() / 1000)}:F>`, inline: false },
    );

  if (ticket.closedAt) {
    embed.addFields({ name: '🔒 Đóng', value: `<t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`, inline: true });
  }
  if (ticket.tags) {
    embed.addFields({ name: '🏷️ Tags', value: ticket.tags.split(',').map((t) => `\`${t.trim()}\``).join(', '), inline: false });
  }

  // Form data
  if (ticket.formData && ticket.formData !== '{}') {
    try {
      const data = JSON.parse(ticket.formData);
      for (const f of Object.values(data).slice(0, 4)) {
        embed.addFields({
          name: `📝 ${f.label}`,
          value: (f.value || '_(trống)_').slice(0, 256),
          inline: false,
        });
      }
    } catch {}
  }

  if (ticket.note) {
    embed.addFields({ name: '📝 Ghi chú nội bộ', value: ticket.note.slice(0, 512), inline: false });
  }

  embed.setFooter({ text: `ID: ${ticket.id}` });
  embed.setTimestamp();

  return embed;
}

// ─── Handle buttons ───────────────────────────────────────────────────────
export async function handleButton(interaction) {
  const customId = interaction.customId;

  // Send to channel
  if (customId.startsWith('history_send:')) {
    const ticketId = customId.split(':')[1];
    await interaction.deferUpdate();
    try {
      await axios.post(
        `${API_URL}/api/tickets/${ticketId}/send-to-channel`,
        { channelId: interaction.channelId, includeTranscript: true },
        { headers: actorHeaders(interaction), timeout: 15000 },
      );
      await interaction.editReply({
        content: `✅ Đã gửi ticket vào kênh này. Mọi người trong kênh đều thấy.`,
        embeds: [], components: [],
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      await interaction.followUp({ content: '❌ ' + msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  // DM .md to staff
  if (customId.startsWith('history_dm:')) {
    const ticketId = customId.split(':')[1];
    await interaction.deferUpdate();
    try {
      // Fetch transcript markdown từ API
      const res = await axios.get(`${API_URL}/api/tickets/${ticketId}/transcript.md`, {
        headers: actorHeaders(interaction),
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const buf = Buffer.from(res.data);

      // Lấy ticket info cho filename + embed gọn
      const tRes = await axios.get(`${API_URL}/api/tickets/${ticketId}`, {
        headers: actorHeaders(interaction),
      });
      const ticket = tRes.data?.data;
      const num = ticket ? String(ticket.ticketNum).padStart(4, '0') : ticketId;

      const { sendDMWithFile } = await import('../../lib/discord.js');
      await sendDMWithFile(
        interaction.user.id,
        {
          content: `📄 Transcript Ticket #${num} cho bạn.`,
          allowed_mentions: { parse: [] },
        },
        { name: `ticket-${num}.md`, content: buf },
      );

      await interaction.followUp({
        content: `✅ Đã DM transcript cho bạn (.md file).`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      await interaction.followUp({
        content: '❌ Không gửi DM được. ' + (msg.includes('Cannot send') ? 'Bạn có thể đã tắt DM từ bot.' : msg),
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
    return;
  }

  // Back to list — tái khởi tạo flow với user gốc
  if (customId.startsWith('history_back:')) {
    await interaction.reply({
      content: 'Dùng lại `/history` với filter khác để tra cứu tiếp.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

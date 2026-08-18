// ========================
// Command /staff — Discord Admin quản lý staff toàn diện
// Subcommands: add, role, remove, list, info
// ========================

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import axios from 'axios';
import logger from '../utils/logger.js';

const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;
const BOT_SECRET = process.env.BOT_API_SECRET;

function buildHeaders(interaction) {
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

const ROLE_CHOICES = [
  { name: 'MOD — Nhận & đóng ticket', value: 'MOD' },
  { name: 'ADMIN — Toàn quyền dashboard', value: 'ADMIN' },
];

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Quản lý staff hệ thống ticket (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  // ── /staff add ────────────────────────────────────────────
  .addSubcommand((sc) => sc
    .setName('add')
    .setDescription('Thêm staff mới')
    .addUserOption((o) => o.setName('user').setDescription('User Discord').setRequired(true))
    .addStringOption((o) => o.setName('role').setDescription('Role').setRequired(false).addChoices(...ROLE_CHOICES)),
  )
  // ── /staff role ───────────────────────────────────────────
  .addSubcommand((sc) => sc
    .setName('role')
    .setDescription('Đổi role của staff hiện có')
    .addUserOption((o) => o.setName('user').setDescription('User Discord').setRequired(true))
    .addStringOption((o) => o.setName('role').setDescription('Role mới').setRequired(true).addChoices(...ROLE_CHOICES)),
  )
  // ── /staff remove ─────────────────────────────────────────
  .addSubcommand((sc) => sc
    .setName('remove')
    .setDescription('Xóa staff khỏi hệ thống')
    .addUserOption((o) => o.setName('user').setDescription('User Discord').setRequired(true)),
  )
  // ── /staff list ───────────────────────────────────────────
  .addSubcommand((sc) => sc.setName('list').setDescription('Xem danh sách tất cả staff'))
  // ── /staff info ───────────────────────────────────────────
  .addSubcommand((sc) => sc
    .setName('info')
    .setDescription('Thông tin chi tiết 1 staff')
    .addUserOption((o) => o.setName('user').setDescription('User Discord').setRequired(true)),
  );

export async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ Chỉ Discord Admin được dùng lệnh này!',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sub = interaction.options.getSubcommand();
  try {
    switch (sub) {
      case 'add':    return await handleAdd(interaction);
      case 'role':   return await handleRole(interaction);
      case 'remove': return await handleRemove(interaction);
      case 'list':   return await handleList(interaction);
      case 'info':   return await handleInfo(interaction);
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await interaction.editReply({ content: `❌ ${msg}` });
    logger.error(`/staff ${sub} lỗi:`, msg);
  }
}

// ─── /staff add ──────────────────────────────────────────────
async function handleAdd(interaction) {
  const target = interaction.options.getUser('user');
  const role = interaction.options.getString('role') || 'MOD';

  const res = await axios.post(
    `${API_URL}/api/staff`,
    {
      discordId: target.id,
      username: target.username,
      avatar: target.avatar
        ? `https://cdn.discordapp.com/avatars/${target.id}/${target.avatar}.png`
        : null,
      role,
    },
    { headers: buildHeaders(interaction), timeout: 10000 },
  );

  if (res.data?.success) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('✅ Đã thêm staff')
      .setDescription(`**${target.username}** giờ là **${role}**`)
      .addFields(
        { name: '🆔 Discord ID', value: `\`${target.id}\``, inline: true },
        { name: '🛡️ Role', value: role, inline: true },
        { name: '➕ Thêm bởi', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: 'Họ đăng nhập web dashboard được ngay bây giờ.' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    logger.success(`/staff add: ${target.username} (${role})`);
  } else {
    await interaction.editReply({ content: `❌ ${res.data?.message || 'Lỗi'}` });
  }
}

// ─── /staff role ─────────────────────────────────────────────
async function handleRole(interaction) {
  const target = interaction.options.getUser('user');
  const role = interaction.options.getString('role');

  const res = await axios.patch(
    `${API_URL}/api/staff/${target.id}/role`,
    { role },
    { headers: buildHeaders(interaction), timeout: 10000 },
  );

  if (res.data?.success) {
    const staff = res.data.data;
    const embed = new EmbedBuilder()
      .setColor(role === 'ADMIN' ? Colors.Purple : Colors.Blue)
      .setTitle(role === 'ADMIN' ? '⬆️ Promoted' : '🔄 Role updated')
      .setDescription(`**${target.username}** giờ là **${role}**`)
      .addFields(
        { name: '🆔 Discord ID', value: `\`${target.id}\``, inline: true },
        { name: '🛡️ Role mới', value: role, inline: true },
        { name: '👤 Bởi', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    logger.success(`/staff role: ${target.username} → ${role}`);
  } else {
    await interaction.editReply({ content: `❌ ${res.data?.message || 'Lỗi'}` });
  }
}

// ─── /staff remove ───────────────────────────────────────────
async function handleRemove(interaction) {
  const target = interaction.options.getUser('user');

  if (target.id === interaction.user.id) {
    return interaction.editReply({ content: '❌ Không thể xóa chính mình!' });
  }

  const res = await axios.delete(
    `${API_URL}/api/staff/${target.id}`,
    { headers: buildHeaders(interaction), timeout: 10000 },
  );

  if (res.data?.success) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('🗑️ Đã xóa staff')
      .setDescription(`**${target.username}** không còn quyền truy cập dashboard nữa.`)
      .addFields(
        { name: '🆔 Discord ID', value: `\`${target.id}\``, inline: true },
        { name: '🗑️ Xóa bởi', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    logger.success(`/staff remove: ${target.username}`);
  } else {
    await interaction.editReply({ content: `❌ ${res.data?.message || 'Lỗi'}` });
  }
}

// ─── /staff list ─────────────────────────────────────────────
async function handleList(interaction) {
  // GET /api/staff cần auth — dùng bot secret + actor để bypass
  const res = await axios.get(`${API_URL}/api/staff`, {
    headers: buildHeaders(interaction), timeout: 10000,
  }).catch(() => null);

  const list = res?.data?.data || [];

  if (list.length === 0) {
    return interaction.editReply({ content: '📋 Chưa có staff nào.' });
  }

  const admins = list.filter((s) => s.role === 'ADMIN');
  const mods = list.filter((s) => s.role === 'MOD');

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`👥 Danh sách Staff (${list.length})`)
    .addFields(
      ...(admins.length ? [{
        name: `🛡️ ADMIN (${admins.length})`,
        value: admins.map((s) => `• <@${s.discordId}> — \`${s.discordId}\``).join('\n').slice(0, 1000),
        inline: false,
      }] : []),
      ...(mods.length ? [{
        name: `👮 MOD (${mods.length})`,
        value: mods.map((s) => `• <@${s.discordId}> — \`${s.discordId}\``).join('\n').slice(0, 1000),
        inline: false,
      }] : []),
    )
    .setFooter({ text: 'Dùng /staff info <user> để xem chi tiết' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── /staff info ─────────────────────────────────────────────
async function handleInfo(interaction) {
  const target = interaction.options.getUser('user');

  const res = await axios.get(`${API_URL}/api/staff/${target.id}`, {
    headers: buildHeaders(interaction), timeout: 10000,
  }).catch(() => null);

  const staff = res?.data?.data;
  if (!staff) {
    return interaction.editReply({ content: `❌ **${target.username}** không phải staff.` });
  }

  const addedAt = Math.floor(new Date(staff.addedAt).getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(staff.role === 'ADMIN' ? Colors.Purple : Colors.Blue)
    .setTitle(`👤 ${staff.username}`)
    .setThumbnail(staff.avatar || target.displayAvatarURL())
    .addFields(
      { name: '🆔 Discord ID', value: `\`${staff.discordId}\``, inline: true },
      { name: '🛡️ Role', value: staff.role, inline: true },
      { name: '📅 Ngày thêm', value: `<t:${addedAt}:F>`, inline: false },
      { name: '🎫 Tickets claimed', value: String(staff.stats?.claimed ?? 0), inline: true },
      { name: '🔒 Tickets closed', value: String(staff.stats?.closed ?? 0), inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

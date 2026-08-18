// Discord rich log — push embed cho mọi audit event vào log channel
// Search-friendly: title luôn có [ACTION] prefix, ticket # rõ ràng, link web dashboard
import { prisma } from './db.js';
import { sendChannelMessage } from './discord.js';

// Cache config (logChannelId) 60s để tránh hammer DB
let cfgCache = null;
let cfgCacheAt = 0;
const CFG_TTL = 60_000;

async function getLogChannelId() {
  const now = Date.now();
  if (cfgCache && now - cfgCacheAt < CFG_TTL) return cfgCache.logChannelId;
  try {
    const cfg = await prisma.guildConfig.findFirst();
    cfgCache = cfg || { logChannelId: null };
    cfgCacheAt = now;
    return cfgCache.logChannelId;
  } catch {
    return null;
  }
}

export function clearLogCache() {
  cfgCache = null;
  cfgCacheAt = 0;
}

// ─── Action metadata ───────────────────────────────────────────────────────
// Mỗi action có: tag (search), emoji, title, color
const ACTIONS = {
  'ticket.create':   { tag: 'TICKET_CREATE',   emoji: '🆕', title: 'Tạo Ticket',     color: 0x57F287 },
  'ticket.claim':    { tag: 'TICKET_CLAIM',    emoji: '✋', title: 'Claim Ticket',   color: 0xFEE75C },
  'ticket.close':    { tag: 'TICKET_CLOSE',    emoji: '🔒', title: 'Đóng Ticket',    color: 0xED4245 },
  'ticket.reply':    { tag: 'TICKET_REPLY',    emoji: '💬', title: 'Reply Từ Web',   color: 0x5865F2 },
  'ticket.note':     { tag: 'TICKET_NOTE',     emoji: '📝', title: 'Sửa Ghi Chú',    color: 0x747F8D },
  'ticket.priority': { tag: 'TICKET_PRIORITY', emoji: '⚡', title: 'Đổi Priority',   color: 0xFAA61A },
  'ticket.tags':     { tag: 'TICKET_TAGS',     emoji: '🏷️', title: 'Đổi Tags',       color: 0x747F8D },
  'ticket.bulk.close':    { tag: 'BULK_CLOSE',    emoji: '🔒', title: 'Bulk Đóng',       color: 0xED4245 },
  'ticket.bulk.priority': { tag: 'BULK_PRIORITY', emoji: '⚡', title: 'Bulk Priority',   color: 0xFAA61A },
  'option.create':   { tag: 'OPTION_CREATE',   emoji: '➕', title: 'Tạo Option',     color: 0x5865F2 },
  'option.update':   { tag: 'OPTION_UPDATE',   emoji: '✏️', title: 'Sửa Option',     color: 0x5865F2 },
  'option.delete':   { tag: 'OPTION_DELETE',   emoji: '🗑️', title: 'Xóa Option',     color: 0xED4245 },
  'option.toggle':   { tag: 'OPTION_TOGGLE',   emoji: '🔄', title: 'Toggle Option',  color: 0x747F8D },
  'staff.add':       { tag: 'STAFF_ADD',       emoji: '👤+', title: 'Thêm Staff',    color: 0x57F287 },
  'staff.role':      { tag: 'STAFF_ROLE',      emoji: '🛡️', title: 'Đổi Role Staff', color: 0x5865F2 },
  'staff.remove':    { tag: 'STAFF_REMOVE',    emoji: '👤−', title: 'Xóa Staff',     color: 0xED4245 },
  'config.update':   { tag: 'CONFIG_UPDATE',   emoji: '⚙️', title: 'Cập Nhật Config', color: 0x5865F2 },
  'canned.create':   { tag: 'CANNED_CREATE',   emoji: '💬', title: 'Tạo Canned',     color: 0x5865F2 },
  'canned.update':   { tag: 'CANNED_UPDATE',   emoji: '✏️', title: 'Sửa Canned',     color: 0x5865F2 },
  'canned.delete':   { tag: 'CANNED_DELETE',   emoji: '🗑️', title: 'Xóa Canned',     color: 0xED4245 },
  'ticket.rating':   { tag: 'TICKET_RATING',   emoji: '⭐', title: 'User Rating',    color: 0xFAA61A },
  'ticket.sla.breach': { tag: 'SLA_BREACH',    emoji: '⚠️', title: 'SLA Breach',      color: 0xED4245 },
  'faq.create':      { tag: 'FAQ_CREATE',      emoji: '➕', title: 'Tạo FAQ',         color: 0x5865F2 },
  'faq.update':      { tag: 'FAQ_UPDATE',      emoji: '✏️', title: 'Sửa FAQ',         color: 0x5865F2 },
  'faq.delete':      { tag: 'FAQ_DELETE',      emoji: '🗑️', title: 'Xóa FAQ',         color: 0xED4245 },
  'autotag.create':  { tag: 'AUTOTAG_CREATE',  emoji: '🏷️', title: 'Tạo Auto-tag',    color: 0x5865F2 },
  'webhook.create':  { tag: 'WEBHOOK_CREATE',  emoji: '🔌', title: 'Tạo Webhook',     color: 0x5865F2 },
};

// Actions không log vào Discord (chỉ giữ web audit)
const SKIP_DISCORD = new Set(['auth.login']);

function fmtMetadata(action, metadata) {
  const m = metadata || {};
  switch (action) {
    case 'ticket.create':
      return [
        { name: '🎫 Ticket', value: `#${String(m.ticketNum || '?').padStart(4, '0')}`, inline: true },
        { name: '📋 Loại', value: m.optionName || '—', inline: true },
      ];
    case 'ticket.priority':
      return [
        { name: 'Từ', value: `\`${m.from || '?'}\``, inline: true },
        { name: 'Sang', value: `\`${m.to || '?'}\``, inline: true },
      ];
    case 'ticket.tags':
      return [{ name: 'Tags', value: m.tags ? `\`${m.tags}\`` : '_(trống)_', inline: false }];
    case 'ticket.reply':
      return [{ name: 'Độ dài', value: `${m.length || 0} ký tự`, inline: true }];
    case 'ticket.note':
      return [{ name: 'Độ dài', value: `${m.length || 0} ký tự`, inline: true }];
    case 'option.create':
    case 'option.delete':
      return [{ name: 'Option', value: m.name || m.optionId || '—', inline: true }];
    case 'option.update':
      return [{ name: 'Fields', value: (m.fields || []).join(', ') || '—', inline: false }];
    case 'option.toggle':
      return [{ name: 'Active', value: m.isActive ? 'true ✅' : 'false ❌', inline: true }];
    case 'staff.add':
    case 'staff.remove':
      return [
        { name: 'Username', value: m.username || '—', inline: true },
        { name: 'Discord ID', value: `\`${m.discordId || '?'}\``, inline: true },
        ...(m.role ? [{ name: 'Role', value: m.role, inline: true }] : []),
      ];
    case 'staff.role':
      return [
        { name: 'User', value: m.username || '—', inline: true },
        { name: 'Discord ID', value: `\`${m.discordId || '?'}\``, inline: true },
        { name: 'Đổi role', value: `\`${m.from || '?'}\` → \`${m.to || '?'}\``, inline: false },
      ];
    case 'config.update':
      return [{ name: 'Fields đổi', value: (m.fields || []).join(', ') || '—', inline: false }];
    case 'ticket.bulk.close':
    case 'ticket.bulk.priority':
      return [{ name: 'Số ticket', value: String(m.count || m.ids?.length || 0), inline: true }];
    case 'canned.create':
    case 'canned.update':
    case 'canned.delete':
      return [{ name: 'Shortcut', value: m.shortcut ? `/${m.shortcut}` : '—', inline: true }];
    case 'ticket.rating':
      return [
        { name: 'Score', value: `${'⭐'.repeat(m.score || 0)}${'☆'.repeat(5 - (m.score || 0))} (${m.score || 0}/5)`, inline: true },
        ...(m.staffName ? [{ name: 'Staff được rate', value: m.staffName, inline: true }] : []),
      ];
    case 'ticket.sla.breach':
      return [
        { name: 'Target', value: `${m.targetMinutes || 0} phút`, inline: true },
        { name: 'Elapsed', value: `${m.elapsedMinutes || 0} phút`, inline: true },
      ];
    default:
      return [];
  }
}

/**
 * Push audit event lên Discord log channel.
 * Fire-and-forget — không bao giờ throw.
 */
export async function pushDiscordLog({ action, actorId, actorName, actorKind, ticketId, metadata, createdAt }) {
  try {
    if (SKIP_DISCORD.has(action)) return;
    const meta = ACTIONS[action];
    if (!meta) return; // action lạ → bỏ qua

    const channelId = await getLogChannelId();
    if (!channelId) return;

    const webUrl = process.env.WEB_URL || '';
    const fields = fmtMetadata(action, metadata);

    // Ticket info — nếu có ticketId, fetch ticketNum để hiển thị
    let ticketLine = null;
    if (ticketId) {
      try {
        const t = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { ticketNum: true },
        });
        if (t) {
          const num = String(t.ticketNum).padStart(4, '0');
          const link = webUrl ? `[#${num}](${webUrl}/tickets/${ticketId})` : `#${num}`;
          ticketLine = link;
        }
      } catch {}
    }

    const ts = createdAt ? Math.floor(new Date(createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const actorBadge = actorKind === 'bot' ? '🤖' : actorKind === 'system' ? '⚙️' : '👤';

    const embed = {
      title: `${meta.emoji} ${meta.title}  ·  [${meta.tag}]`,
      color: meta.color,
      fields: [
        { name: 'Người thực hiện', value: `${actorBadge} **${actorName}** \`${actorId}\``, inline: true },
        ...(ticketLine ? [{ name: 'Ticket', value: ticketLine, inline: true }] : []),
        { name: 'Thời gian', value: `<t:${ts}:F> · <t:${ts}:R>`, inline: false },
        ...fields,
      ],
      footer: { text: `Action: ${action}` },
      timestamp: new Date(ts * 1000).toISOString(),
    };

    await sendChannelMessage(channelId, { embeds: [embed], allowedMentions: { parse: [] } });
  } catch (err) {
    console.error('[DISCORD LOG ERROR]', err.message);
  }
}

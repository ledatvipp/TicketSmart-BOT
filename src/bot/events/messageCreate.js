// ========================
// Event: messageCreate
// 1. Realtime log mọi tin nhắn trong ticket channel vào DB
// 2. Auto-xóa tin nhắn trong setup channel
// ========================

import { getConfig, appendMessage } from '../utils/api.js';
import { lookupTicket } from '../utils/ticketCache.js';
import logger from '../utils/logger.js';
import { handleSmartMessage } from '../handlers/smartMessageHandler.js';
import { handleTicketSmartMessage } from '../handlers/ticketSmartHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import { awardChatMessage } from '../../services/chatLevelService.js';
import * as levelCommand from '../commands/level.js';
import * as rankCommand from '../commands/rank.js';
import * as leaderboardCommand from '../commands/leaderboard.js';
import { levelUpEmbed, sendLevelPayload, withRankCard } from '../ui/level-presentation.js';

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

export const name = 'messageCreate';
export const once = false;

async function handleLevelPrefixCommand(message) {
  const [name, rawLimit] = String(message.content || '').trim().slice(1).split(/\s+/, 2);
  if (name === 'level') { await levelCommand.executePrefix(message); return true; }
  if (name === 'rank') { await rankCommand.executePrefix(message); return true; }
  if (name === 'leaderboard') {
    const parsed = Number.parseInt(rawLimit, 10);
    await leaderboardCommand.executePrefix(message, Number.isFinite(parsed) ? parsed : 10);
    return true;
  }
  return false;
}

async function syncHighestLevelRole(message, config, profile) {
  const member = message.member;
  if (!member?.roles?.cache) return;
  const roles = [...(config.levelRoles || [])].sort((a, b) => a.minLevel - b.minLevel);
  const eligible = roles.filter((row) => row.minLevel <= profile.level);
  const highest = eligible.at(-1) || null;
  const managedRoleIds = [...new Set(roles.map((row) => row.roleId))];
  try {
    if (highest && !member.roles.cache.has(highest.roleId)) await member.roles.add(highest.roleId, 'Chat level role sync');
    const stale = managedRoleIds.filter((roleId) => roleId !== highest?.roleId && member.roles.cache.has(roleId));
    if (stale.length) await member.roles.remove(stale, 'Chat level role sync');
  } catch (error) {
    // XP is already committed; Discord hierarchy/permission failures must not roll it back.
    logger.warn(`Không thể đồng bộ level role cho ${message.author.id}: ${error.message}`);
  }
}

async function announceLevelUp(message, config, result) {
  if (!config.announcementEnabled || !result.crossedLevels.length) return;
  const channelId = config.announcementChannelId || message.channelId;
  try {
    const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) return;
    const permissions = message.guild.members?.me ? channel.permissionsFor?.(message.guild.members.me) : null;
    const imageEnabled = config.imageEnabled !== false && (!permissions || permissions.has(PermissionFlagsBits.AttachFiles));
    const embed = levelUpEmbed(message.author, result, config);
    const payload = await withRankCard(embed, message.author, result.profile, {
      config: { ...config, imageEnabled }, guildName: message.guild.name, levelUp: true,
    });
    await sendLevelPayload((body) => channel.send(body), payload);
  } catch (error) {
    logger.warn(`Không thể gửi thông báo level-up: ${error.message}`);
  }
}

export async function processChatLevelMessage(message, config, {
  award = awardChatMessage, syncRoles = syncHighestLevelRole, announce = announceLevelUp,
} = {}) {
  if (message.author?.bot || !config?.enabled) return;
  try {
    const result = await award({
      guildId: message.guild.id, userId: message.author.id, messageId: message.id,
      channelId: message.channelId, content: message.content,
      memberRoleIds: [...(message.member?.roles?.cache?.keys?.() || [])], config,
    });
    if (result.awarded && result.crossedLevels.length) {
      // Discord side effects happen only after the durable XP/reward transaction.
      // One side-effect failure must not suppress the other or ticket logging.
      await Promise.allSettled([
        Promise.resolve().then(() => syncRoles(message, config, result.profile)),
        Promise.resolve().then(() => announce(message, config, result)),
      ]);
    }
  } catch (error) {
    logger.warn('Level Chat tạm lỗi; vẫn tiếp tục xử lý ticket:', error?.message || 'Unknown error');
  }
}

export async function execute(message) {
  // Bỏ qua DM
  if (!message.guild) return;

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

    if (!message.author?.bot && String(message.content || '').trim().startsWith('!')) {
      if (await handleLevelPrefixCommand(message)) return;
    }

    // ─── 1. Auto-delete trong setup channel ──────────────────────────────────
    if (cfg.deleteSetupMessages && cfg.embedChannelId && message.channelId === cfg.embedChannelId) {
      if (message.author?.bot) return;
      await message.delete().catch(() => {});
      try {
        await message.author.send(
          `> ❌ **#${message.channel.name}** chỉ dành cho hệ thống ticket.\n` +
          `> Vui lòng dùng select menu bên trên để tạo ticket.`
        );
      } catch {}
      return;
    }

    // ─── 2. Chat XP and durable Minecraft rewards ───────────────────────────
    await processChatLevelMessage(message, cfg.chatLevelConfig);

    // ─── 3. Realtime message logger ──────────────────────────────────────────
    // ─── 3. Smart Assistant (chỉ ở channel đã cấu hình hoặc khi mention bot) ──
    try { await handleSmartMessage(message, cfg); }
    catch (error) { logger.warn('Smart Assistant tạm lỗi; vẫn lưu ticket:', error?.message || 'Unknown error'); }

    // ─── 3. Realtime message logger ──────────────────────────────────────────
    // Tối ưu: Chỉ kiểm tra nếu tên kênh có dạng ticket (kết thúc bằng 4 chữ số, vd: ticket-0001 hoặc staff-0001)
    if (!message.channel.name || !/-\d{4}$/.test(message.channel.name)) return;

    // Chỉ log nếu channel đang là ticket channel (có entry trong DB)
    const ticket = await lookupTicket(message.channelId);
    if (!ticket) return; // Không phải ticket channel

    // Đã closed thì không log nữa
    if (ticket.status === 'closed') return;

    await appendMessage(message.channelId, {
      discordMessageId: message.id,
      authorId: message.author?.id,
      authorName: message.author?.displayName || message.author?.username || 'Unknown',
      authorAvatar: message.author?.displayAvatarURL?.() || null,
      isBot: message.author?.bot || false,
      content: message.content || '',
      attachments: collectMessageMedia(message),
      timestamp: message.createdAt,
    });

    // ─── 5. AI an toàn bên trong ticket ─────────────────────────────────────
    // Chỉ trả lời theo policy: câu hỏi rõ ràng/mention, không spam, nhường staff khi đã claim.
    await handleTicketSmartMessage(message, ticket, cfg);
  } catch (error) {
    logger.error('Lỗi messageCreate:', error.message);
  }
}

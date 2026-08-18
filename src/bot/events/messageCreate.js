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

export async function execute(message) {
  // Bỏ qua DM
  if (!message.guild) return;

  try {
    const config = await getConfig();
    const cfg = config?.data || config || {};

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

    // ─── 2. Smart Assistant (chỉ ở channel đã cấu hình hoặc khi mention bot) ──
    await handleSmartMessage(message, cfg);

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

    // ─── 4. AI an toàn bên trong ticket ─────────────────────────────────────
    // Chỉ trả lời theo policy: câu hỏi rõ ràng/mention, không spam, nhường staff khi đã claim.
    await handleTicketSmartMessage(message, ticket, cfg);
  } catch (error) {
    logger.error('Lỗi messageCreate:', error.message);
  }
}

// Cache nhỏ giúp giảm lượt gọi GET /api/tickets/by-channel
// TTL ngắn (30s) — DB vẫn là nguồn truth, cache chỉ tránh hammer endpoint
import { getTicketByChannel } from './api.js';

const TTL = 30_000; // 30 giây
const NEGATIVE_TTL = 10 * 60 * 1000; // 10 phút (kênh không phải ticket sẽ không check lại liên tục)
const cache = new Map(); // channelId -> { data, expiresAt }

export async function lookupTicket(channelId) {
  const now = Date.now();
  const cached = cache.get(channelId);
  if (cached && cached.expiresAt > now) return cached.data;

  const ticket = await getTicketByChannel(channelId);
  if (!ticket) {
    cache.set(channelId, { data: null, expiresAt: now + NEGATIVE_TTL });
    return null;
  }

  cache.set(channelId, { data: ticket, expiresAt: now + TTL });
  return ticket;
}

/** Xóa cache cho 1 channel (gọi sau claim/close) */
export function invalidate(channelId) {
  cache.delete(channelId);
}

/** Update inline cache khi nhận response từ claim/close */
export function setTicket(channelId, ticket) {
  cache.set(channelId, { data: ticket, expiresAt: Date.now() + TTL });
}

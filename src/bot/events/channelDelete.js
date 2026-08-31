// ========================
// Event: channelDelete
// Tự động đóng ticket trong DB khi kênh bị xóa thủ công
// Tự động xóa danh mục trống nếu không có kênh nào khác
// ========================

import { Events, ChannelType } from 'discord.js';
import { getAllClusters, getAllOptions, getTicketByChannel, closeTicket } from '../utils/api.js';
import { invalidate } from '../utils/ticketCache.js';
import logger from '../utils/logger.js';
import { isConfiguredTicketCategory } from '../utils/ticketCategories.js';

export const name = Events.ChannelDelete;
export const once = false;

export async function execute(channel) {
  // Chỉ xử lý kênh văn bản trong server
  if (channel.type !== ChannelType.GuildText) return;

  try {
    // 1. Kiểm tra xem kênh bị xóa có phải là ticket đang mở/claimed hay không
    const ticket = await getTicketByChannel(channel.id);
    if (!ticket) return; // Không phải ticket channel hoặc đã đóng

    logger.warn(`Phát hiện kênh ticket #${ticket.ticketNum} (ID: ${channel.id}) bị xóa thủ công.`);

    if (ticket.status !== 'closed') {
      // 2. Cập nhật trạng thái đóng trong database
      await closeTicket(channel.id, 'system', 'Kênh bị xóa thủ công (Realtime)');
      invalidate(channel.id);
      logger.success(`Đã tự động đóng ticket #${ticket.ticketNum} trong DB.`);
    }

    // 3. Tự động xóa danh mục nếu trống (bỏ qua nếu là danh mục người dùng cấu hình thủ công)
    const parentCategory = channel.parent;
    if (!parentCategory) return;

    const [options, clusters] = await Promise.all([getAllOptions().catch(() => []), getAllClusters().catch(() => [])]);
    if (isConfiguredTicketCategory(parentCategory.id, { options: [ticket.option, ...options], clusters })) return;

    // Lọc bỏ kênh vừa xóa khỏi cache để kiểm tra xem danh mục có trống không
    const remaining = parentCategory.children.cache.filter((c) => c.id !== channel.id);
    if (remaining.size === 0) {
      await parentCategory.delete('Danh mục trống sau khi xóa kênh ticket (Realtime)').catch((err) => {
        logger.warn(`Lỗi xóa danh mục "${parentCategory.name}":`, err.message);
      });
      logger.success(`Đã xóa danh mục trống: "${parentCategory.name}"`);
    }
  } catch (error) {
    logger.error('Lỗi xử lý event channelDelete:', error.message);
  }
}

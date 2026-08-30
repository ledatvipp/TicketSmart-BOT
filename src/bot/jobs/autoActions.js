// Scheduler: chạy mỗi 60s
// - Auto-close ticket inactive
// - Auto-escalate ticket chưa claim
// - SLA breach detection + alert
import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../utils/api.js';
import logger from '../utils/logger.js';
import axios from 'axios';

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const SECRET = process.env.BOT_API_SECRET;

const HEADERS = SECRET ? { 'X-Bot-Secret': SECRET } : {};

let timer = null;
let initialTimer = null;
let running = false;

async function tick(client) {
  if (running) return;
  running = true;
  try {
    const config = await getConfig().catch(() => null);
    const cfg = config?.data || config || {};

    // Gọi API endpoint xử lý logic (xem autoActionsController)
    const { data } = await axios.post(`${API_URL}/api/auto-actions/run`, {}, {
      headers: HEADERS, timeout: 20000,
    });

    const actions = data?.data?.actions;
    if (data?.success !== true || !Array.isArray(actions)) {
      throw new Error('API auto-actions trả về dữ liệu không hợp lệ');
    }
    if (actions.length) {
      logger.info(`[AutoActions] xử lý ${actions.length} action(s)`);
      for (const action of actions) {
        await executeAction(client, action, cfg);
      }
    }
  } catch (err) {
    logger.warn('[AutoActions] tick lỗi:', err.message);
  } finally {
    running = false;
  }
}

async function executeAction(client, action, cfg) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const channel = guild.channels.cache.get(action.channelId);
    if (!channel) return;

    if (action.kind === 'auto-close') {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C) // Red color
        .setTitle('🔒 Tự Động Đóng Ticket')
        .setDescription(`Ticket này đã tự động đóng do không có hoạt động mới trong vòng **${action.inactiveHours} giờ**.`)
        .setFooter({ text: 'Hệ thống tự động dọn dẹp' })
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => {});
      setTimeout(() => channel.delete(`Auto-close inactive`).catch(() => {}), 5000);
    } else if (action.kind === 'auto-escalate') {
      const embed = new EmbedBuilder()
        .setColor(0xE67E22) // Orange color
        .setTitle('🚨 Cảnh Báo Khẩn Cấp — Auto-Escalated')
        .setDescription(`Ticket chưa được tiếp nhận (claimed) sau **${action.waitMinutes} phút** kể từ lúc mở.\nĐộ ưu tiên của ticket đã được tự động nâng cấp lên **Urgent (Khẩn cấp)**.`)
        .setTimestamp();

      let mention = '';
      if (action.allowedStaffRoles) {
        mention = action.allowedStaffRoles.split(',').map((r) => `<@&${r.trim()}>`).join(' ');
      } else if (cfg.staffRoleId) {
        mention = `<@&${cfg.staffRoleId}>`;
      }
      await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
    } else if (action.kind === 'sla-breach') {
      const embed = new EmbedBuilder()
        .setColor(0xF1C40F) // Yellow color
        .setTitle('⚠️ Cảnh Báo Vi Phạm SLA (SLA Breached)')
        .setDescription(`Ticket này đã vượt quá thời gian phản hồi mục tiêu (SLA target).\n\n• Thời gian phản hồi mục tiêu: **${action.targetMinutes} phút**\n• Thời gian đã trôi qua: **${action.elapsedMinutes} phút**`)
        .setTimestamp();

      let mention = '';
      if (action.allowedStaffRoles) {
        mention = action.allowedStaffRoles.split(',').map((r) => `<@&${r.trim()}>`).join(' ');
      } else if (cfg.staffRoleId) {
        mention = `<@&${cfg.staffRoleId}>`;
      }
      await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    logger.warn('[AutoActions] execute lỗi:', err.message);
  }
}

export function startScheduler(client, intervalMs = 60_000) {
  stopScheduler();
  timer = setInterval(() => tick(client), intervalMs);
  logger.info(`✅ Auto-actions scheduler started (every ${intervalMs}ms)`);
  // Chạy lần đầu sau 10s để bot wake up xong
  initialTimer = setTimeout(() => {
    initialTimer = null;
    tick(client);
  }, 10_000);
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
  if (initialTimer) { clearTimeout(initialTimer); initialTimer = null; }
}

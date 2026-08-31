// ========================
// Event: ready
// ========================

import { REST, Routes, Events, ChannelType } from 'discord.js';
import apiClient, { loadConfig, clearConfigCache } from '../utils/api.js';
import logger from '../utils/logger.js';
import { startScheduler } from '../jobs/autoActions.js';

export const name = Events.ClientReady;
export const once = true;

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

async function waitForApi(maxRetries = 10, delayMs = 1500) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await apiClient.get('/health');
      if (res.data && res.data.success) {
        logger.success(`✓ API Backend đã sẵn sàng (Phản hồi sau ${i} lần thử).`);
        return true;
      }
    } catch (err) {
      logger.info(`Đang chờ API Backend khởi động (Lần thử ${i}/${maxRetries})...`);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  logger.error('✗ API Backend không sẵn sàng sau thời gian chờ. Chạy bot tiếp tục với giới hạn.');
  return false;
}

export async function execute(client) {
  // Đợi API sẵn sàng để tránh race condition khi khởi động song song trên panel
  await waitForApi();

  logger.success(`Bot đã online: ${client.user.tag}`);
  logger.info(`Đang phục vụ ${client.guilds.cache.size} server(s)`);

  client.user.setPresence({
    activities: [{ name: '🎫 Hệ thống Ticket | /setup', type: 0 }],
    status: 'online',
  });

  // Đăng ký TẤT CẢ slash commands đã load vào client.commands
  await registerSlashCommands(client);

  await loadInitialConfig();

  // Khởi chạy tiến trình đồng bộ dữ liệu kênh ticket
  await syncStaleTickets(client);

  setInterval(async () => {
    clearConfigCache();
    await loadInitialConfig();
  }, 5 * 60 * 1000);

  // Start auto-actions scheduler
  startScheduler(client, 60_000);

  logger.success('Bot đã sẵn sàng hoạt động!');
}

async function syncStaleTickets(client) {
  logger.info('=== BẮT ĐẦU ĐỒNG BỘ HÓA DỮ LIỆU TICKET ===');
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      logger.warn('Không tìm thấy Guild nào để đồng bộ.');
      return;
    }

    // 1. Lấy tất cả ticket đang hoạt động (open, claimed) từ DB
    const openResp = await apiClient.get('/api/tickets?status=open').catch(() => null);
    const claimedResp = await apiClient.get('/api/tickets?status=claimed').catch(() => null);

    const dbActiveTickets = [
      ...(openResp?.data?.data?.tickets || []),
      ...(claimedResp?.data?.data?.tickets || [])
    ];

    logger.info(`Tìm thấy ${dbActiveTickets.length} ticket đang hoạt động trong DB.`);

    // Fetch toàn bộ kênh từ Guild Discord để cache đầy đủ nhất
    const channels = await guild.channels.fetch();
    const textChannels = channels.filter(c => c.type === ChannelType.GuildText);

    // Lưu danh sách channel ID thực tế trên Discord
    const discordChannelIds = new Set(textChannels.keys());

    let closedInDbCount = 0;
    let syncedMessagesCount = 0;

    // --- TIẾN TRÌNH 1: Đồng bộ từ DB -> Discord (Sửa các kênh bị lệch trạng thái) ---
    for (const t of dbActiveTickets) {
      if (!t.channelId) continue;

      const channelExists = discordChannelIds.has(t.channelId);

      if (!channelExists) {
        // A. Kênh đã bị xóa trên Discord nhưng DB vẫn ghi nhận là Open/Claimed
        logger.warn(`Kênh ticket #${t.ticketNum} (ID: ${t.channelId}) không tồn tại trên Discord. Tự động đóng ticket trong DB.`);
        await apiClient.patch(`/api/tickets/${t.id}/close`, {
          reason: 'Kênh Discord đã bị xóa thủ công khi Bot offline.',
          closeType: 'system_sync',
        }, {
          headers: { 'X-Bot-Actor': JSON.stringify({ discordId: 'system', username: 'Đồng bộ kênh Discord' }) },
        }).catch((err) => {
          logger.error(`Lỗi đóng ticket #${t.ticketNum} trong DB:`, err.message);
        });
        closedInDbCount++;
      } else {
        // B. Kênh tồn tại -> Tiến hành đồng bộ các tin nhắn bị thiếu khi bot offline
        const channel = textChannels.get(t.channelId);
        try {
          // Lấy tin nhắn từ Discord (tối đa 100 tin nhắn gần nhất)
          const discordMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
          if (discordMessages && discordMessages.size > 0) {
            // Lấy chi tiết ticket kèm tin nhắn đã có trong DB
            const ticketDetailResp = await apiClient.get(`/api/tickets/${t.id}`).catch(() => null);
            const dbTicket = ticketDetailResp?.data?.data;

            if (dbTicket) {
              const dbMsgIds = new Set((dbTicket.messages || []).map(m => m.discordMessageId));
              
              // Tìm các tin nhắn trên Discord chưa được lưu vào DB
              const missingMsgs = [...discordMessages.values()]
                .filter(m => !dbMsgIds.has(m.id))
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp) // Cũ xếp trước
                .map(m => ({
                  discordMessageId: m.id,
                  authorId: m.author?.id,
                  authorName: m.author?.displayName || m.author?.username || 'Unknown',
                  authorAvatar: m.author?.displayAvatarURL?.() || null,
                  isBot: m.author?.bot || false,
                  content: m.content || '',
                  attachments: collectMessageMedia(m),
                  timestamp: m.createdAt,
                }));

              if (missingMsgs.length > 0) {
                // Bulk insert tin nhắn bị thiếu vào DB
                await apiClient.post('/api/messages', { channelId: channel.id, messages: missingMsgs });
                logger.info(`  ✓ Đồng bộ thành công ${missingMsgs.length} tin nhắn bị thiếu cho ticket #${t.ticketNum}`);
                syncedMessagesCount += missingMsgs.length;
              }
            }
          }
        } catch (msgErr) {
          logger.warn(`Không thể đồng bộ tin nhắn kênh ticket #${t.ticketNum}:`, msgErr.message);
        }
      }
    }

    // --- TIẾN TRÌNH 2: Đồng bộ từ Discord -> DB (Xóa kênh của các ticket đã đóng trên Dashboard) ---
    // Duyệt qua tất cả các kênh văn bản có định dạng tên ticket (hoặc thuộc các category ticket)
    let deletedChannelsCount = 0;
    for (const [channelId, channel] of textChannels) {
      // Nhận diện kênh ticket qua topic hoặc định dạng tên kênh (kênh ticket kết thúc bằng số ticket ví dụ: ticket-0001 hoặc tenstaff-0001)
      const isTicketChannelName = /-\d{4}$/.test(channel.name);
      const isTicketTopic = channel.topic && channel.topic.includes('Ticket #');

      if (isTicketChannelName || isTicketTopic) {
        // Bỏ qua nếu kênh này nằm trong danh sách ticket đang hoạt động của DB
        const isActiveInDb = dbActiveTickets.some(t => t.channelId === channelId);
        if (isActiveInDb) continue;

        // Nếu kênh tồn tại nhưng không nằm trong danh sách active ticket, check xem ticket của kênh này đã closed chưa
        try {
          const ticketResp = await apiClient.get(`/api/tickets/by-channel/${channelId}`).catch(() => null);
          const ticket = ticketResp?.data?.data;

          if (ticket && ticket.status === 'closed') {
            logger.warn(`Kênh Discord "${channel.name}" thuộc ticket #${ticket.ticketNum} đã đóng trên Web Dashboard. Tự động xóa kênh.`);
            await channel.send({
              content: '🔒 **Đồng bộ hệ thống**: Ticket này đã được đóng trên Web Dashboard khi Bot offline. Kênh sẽ được xóa sau 5 giây.'
            }).catch(() => {});

            setTimeout(async () => {
              await channel.delete('Đóng kênh do ticket đã closed trên Dashboard (Đồng bộ)').catch(() => {});
            }, 5000);
            deletedChannelsCount++;
          }
        } catch (checkErr) {
          // Bỏ qua nếu không tìm thấy ticket hoặc lỗi API
        }
      }
    }

    // --- TIẾN TRÌNH 3: Dọn dẹp danh mục ticket trống (Không chứa kênh con nào và không cấu hình thủ công) ---
    let deletedCategoriesCount = 0;
    try {
      const [optionsResp, clustersResp] = await Promise.all([
        apiClient.get('/api/options').catch(() => null),
        apiClient.get('/api/clusters').catch(() => null),
      ]);
      const options = optionsResp?.data?.data || [];
      const clusters = clustersResp?.data?.data || [];
      const userManagedCategoryIds = new Set([
        ...options.map((option) => option.discordCategoryId),
        ...clusters.map((cluster) => cluster.discordCategoryId),
      ].filter(Boolean));

      // Lấy danh sách tất cả các kênh để lấy categories và kiểm tra children
      const allChannels = await guild.channels.fetch();
      const categories = allChannels.filter(c => c.type === ChannelType.GuildCategory);

      for (const [, category] of categories) {
        // Nhận diện danh mục do bot quản lý (so khớp theo emoji + tên option hoặc tên viết hoa)
        const isBotCategory = options.some(o => {
          const expectedName1 = `${o.emoji || '🗺️'} ${o.name.toUpperCase()}`;
          const expectedName2 = o.name.toUpperCase();
          return category.name === expectedName1 || category.name === expectedName2;
        });

        if (isBotCategory) {
          // Bỏ qua nếu danh mục được admin chọn thủ công trong Options
          if (userManagedCategoryIds.has(category.id)) continue;

          // Kiểm tra xem danh mục có kênh con nào không
          const children = allChannels.filter(c => c.parentId === category.id);
          if (children.size === 0) {
            logger.warn(`Danh mục ticket "${category.name}" trống. Tự động xóa danh mục.`);
            await category.delete('Đồng bộ dọn dẹp danh mục trống (Bot startup)').catch(err => {
              logger.error(`Lỗi xóa danh mục trống "${category.name}":`, err.message);
            });
            deletedCategoriesCount++;
          }
        }
      }
    } catch (catErr) {
      logger.warn('Lỗi dọn dẹp danh mục trống:', catErr.message);
    }

    logger.info('=== KẾT QUẢ ĐỒNG BỘ HÓA ===');
    logger.success(`- Số ticket bị mất kênh tự động đóng trong DB: ${closedInDbCount}`);
    logger.success(`- Số tin nhắn bị thiếu đã đồng bộ vào DB: ${syncedMessagesCount}`);
    logger.success(`- Số kênh dư thừa đã xóa trên Discord: ${deletedChannelsCount}`);
    logger.success(`- Số danh mục trống đã dọn dẹp: ${deletedCategoriesCount}`);
    logger.info('==========================================');

  } catch (error) {
    logger.error('Lỗi nghiêm trọng khi đồng bộ ticket:', error.message);
  }
}

async function registerSlashCommands(client) {
  const token = process.env.BOT_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    logger.error('Thiếu BOT_TOKEN hoặc CLIENT_ID');
    return;
  }

  try {
    // Lấy TẤT CẢ commands từ collection client.commands (do loadCommands() load lên)
    const commandsData = Array.from(client.commands.values())
      .filter((cmd) => cmd.data)
      .map((cmd) => cmd.data.toJSON());

    if (commandsData.length === 0) {
      logger.warn('Không có command nào để đăng ký');
      return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsData });
      logger.success(`Đã đăng ký ${commandsData.length} slash command(s) cho guild ${guildId}: ${commandsData.map((c) => '/' + c.name).join(', ')}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandsData });
      logger.success(`Đã đăng ký ${commandsData.length} global slash command(s)`);
    }
  } catch (error) {
    logger.error('Lỗi đăng ký slash commands:', error.message);
  }
}

async function loadInitialConfig() {
  try {
    const config = await loadConfig();
    logger.info(`Config loaded: staffRoleId=${config.staffRoleId}, logChannelId=${config.logChannelId}`);
  } catch (error) {
    logger.warn('Không tải được config, dùng default. Lỗi:', error.message);
  }
}

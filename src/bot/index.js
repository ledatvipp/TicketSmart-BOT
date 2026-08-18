// ========================
// Entry Point - Discord Ticket Bot
// discord.js v14, ES Modules
// ========================

import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import logger from './utils/logger.js';
import { validateEnv } from '../lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========================
// Kiểm tra biến môi trường bắt buộc
// ========================
try {
  validateEnv('bot');
} catch (error) {
  logger.error(error.message);
  logger.error('Copy .env.example thành .env và điền đầy đủ thông tin.');
  process.exit(1);
}

// ========================
// Khởi tạo Discord Client
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Xem thông tin guild
    GatewayIntentBits.GuildMessages,    // Đọc tin nhắn
    GatewayIntentBits.MessageContent,   // Đọc nội dung tin nhắn (cần enable trong Developer Portal)
    GatewayIntentBits.GuildMembers,     // Xem danh sách members
  ],
  partials: [
    Partials.Channel,   // Xử lý DM channels
    Partials.Message,   // Xử lý partial messages
  ],
});

// Collection để lưu commands
client.commands = new Collection();

// ========================
// Tải Commands vào Collection
// ========================
async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');

  try {
    const commandFiles = await readdir(commandsPath);
    const jsFiles = commandFiles.filter((f) => f.endsWith('.js'));

    logger.info(`Đang tải ${jsFiles.length} command(s)...`);

    for (const file of jsFiles) {
      const filePath = join(commandsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      const command = await import(fileUrl);

      if (!command.data || !command.execute) {
        logger.warn(`Command file ${file} thiếu 'data' hoặc 'execute'`);
        continue;
      }

      client.commands.set(command.data.name, command);
      logger.info(`  ✓ Command: /${command.data.name}`);
    }

    logger.success('Tất cả commands đã được tải!');
  } catch (error) {
    logger.error('Lỗi khi tải commands:', error.message);
    // Không throw — commands thiếu sẽ chỉ báo warn
  }
}

// ========================
// Tải và đăng ký Events
// ========================
async function loadEvents() {
  const eventsPath = join(__dirname, 'events');

  try {
    const eventFiles = await readdir(eventsPath);
    const jsFiles = eventFiles.filter((f) => f.endsWith('.js'));

    logger.info(`Đang tải ${jsFiles.length} event(s)...`);

    for (const file of jsFiles) {
      const filePath = join(eventsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      const event = await import(fileUrl);

      if (!event.name || !event.execute) {
        logger.warn(`Event file ${file} thiếu 'name' hoặc 'execute'`);
        continue;
      }

      if (event.once) {
        // Chạy 1 lần
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        // Chạy mỗi khi event xảy ra
        client.on(event.name, (...args) => event.execute(...args));
      }

      logger.info(`  ✓ Event: ${event.name} (${event.once ? 'once' : 'on'})`);
    }

    logger.success('Tất cả events đã được tải!');
  } catch (error) {
    logger.error('Lỗi khi tải events:', error.message);
    throw error;
  }
}

// ========================
// Xử lý lỗi không bắt được
// ========================
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Promise Rejection:', error.message);
  if (error.stack) {
    logger.debug(error.stack);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message);
  if (error.stack) {
    logger.debug(error.stack);
  }
  setTimeout(() => process.exit(1), 250).unref();
});

// Xử lý khi process bị kill (Ctrl+C)
process.on('SIGINT', () => {
  logger.info('Bot đang tắt...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Bot đang tắt (SIGTERM)...');
  client.destroy();
  process.exit(0);
});

// ========================
// Khởi động Bot
// ========================
async function start() {
  logger.info('========================================');
  logger.info('     Discord Ticket Bot đang khởi động   ');
  logger.info('========================================');

  try {
    // Tải commands vào Collection
    await loadCommands();

    // Tải events
    await loadEvents();

    // Đăng nhập vào Discord
    logger.info('Đang kết nối với Discord...');
    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    logger.error('Lỗi khi khởi động bot:', error.message);

    if (error.code === 'TokenInvalid') {
      logger.error('BOT_TOKEN không hợp lệ! Kiểm tra lại trong .env');
    }

    process.exit(1);
  }
}

// Chạy bot
start();

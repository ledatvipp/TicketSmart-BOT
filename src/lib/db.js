// Prisma client singleton với SQLite WAL mode tối ưu
import { PrismaClient } from '../generated/client/index.js'

const prisma = new PrismaClient()

// Khởi tạo SQLite WAL mode — dùng $queryRawUnsafe vì một số PRAGMA trả về kết quả
async function initDb() {
  await prisma.$connect()

  // Các PRAGMA dùng $queryRawUnsafe để handle cả có/không có return value
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')    // đọc/ghi đồng thời
  await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL')  // giảm fsync, nhanh hơn 2-3x
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000')   // retry 5s thay vì lỗi ngay
  await prisma.$queryRawUnsafe('PRAGMA cache_size=-65536')   // cache 64MB RAM
  await prisma.$queryRawUnsafe('PRAGMA temp_store=MEMORY')   // temp trong RAM
  await prisma.$queryRawUnsafe('PRAGMA mmap_size=268435456') // memory-map 256MB

  console.log('✅ Database ready (SQLite WAL mode)')
}

async function closeDb() {
  await prisma.$disconnect();
}

export { prisma, initDb, closeDb }

// Script tạo admin đầu tiên — chạy: node scripts/setup-admin.js
import 'dotenv/config'
import { PrismaClient } from '../src/generated/client/index.js'
import readline from 'readline'

const prisma = new PrismaClient()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(res => rl.question(q, res))

async function main() {
  console.log('\n🎫 Ticket System — Setup Admin\n')

  const discordId = await ask('Discord ID của bạn: ')
  const username  = await ask('Username Discord: ')

  if (!discordId.trim() || !username.trim()) {
    console.log('❌ Thiếu thông tin!'); process.exit(1)
  }

  // Kiểm tra đã tồn tại chưa
  const existing = await prisma.staff.findUnique({ where: { discordId: discordId.trim() } })
  if (existing) {
    await prisma.staff.update({ where: { discordId: discordId.trim() }, data: { role: 'ADMIN', username: username.trim() } })
    console.log(`\n✅ Đã cập nhật ${username} thành ADMIN!`)
  } else {
    await prisma.staff.create({ data: { discordId: discordId.trim(), username: username.trim(), role: 'ADMIN' } })
    console.log(`\n✅ Đã thêm ${username} làm ADMIN!`)
  }

  rl.close()
  await prisma.$disconnect()
}

main().catch(e => { console.error('❌ Lỗi:', e.message); process.exit(1) })

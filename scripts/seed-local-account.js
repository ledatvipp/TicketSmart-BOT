import 'dotenv/config';
import { PrismaClient } from '../src/generated/client/index.js';
import { hashPassword } from '../src/api/security/passwords.js';

const username = String(process.env.LOCAL_LOGIN_USERNAME || 'null2').trim();
const password = String(process.env.LOCAL_LOGIN_PASSWORD || '');

if (!/^[A-Za-z0-9_.-]{2,50}$/.test(username)) {
  throw new Error('LOCAL_LOGIN_USERNAME must contain 2-50 letters, numbers, dots, hyphens, or underscores.');
}
if (password.length < 8 || password.length > 256) {
  throw new Error('Set LOCAL_LOGIN_PASSWORD to a value between 8 and 256 characters before running this script.');
}

const prisma = new PrismaClient();

try {
  const passwordHash = await hashPassword(password);
  const staff = await prisma.staff.upsert({
    where: { discordId: `local:${username}` },
    create: { discordId: `local:${username}`, username, role: 'ADMIN' },
    update: { username, role: 'ADMIN' },
  });
  await prisma.localAccount.upsert({
    where: { username },
    create: { username, passwordHash, staffId: staff.id },
    update: { passwordHash, staffId: staff.id },
  });
  console.log(`Local account '${username}' is ready with ADMIN access.`);
} finally {
  await prisma.$disconnect();
}

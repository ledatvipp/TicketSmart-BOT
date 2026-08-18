import 'dotenv/config';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (process.env.NODE_ENV === 'production') {
  console.error('Không được dùng db push trong production; hãy dùng migration deploy.');
  process.exit(2);
}
if (process.env.ALLOW_DEV_DB_PUSH !== 'I_UNDERSTAND') {
  console.error('Đây là lệnh chỉ dành cho DB phát triển có thể tạo lại. Chạy với ALLOW_DEV_DB_PUSH=I_UNDERSTAND.');
  process.exit(2);
}
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [cli, 'db', 'push', '--schema', join(root, 'prisma/schema.prisma')], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

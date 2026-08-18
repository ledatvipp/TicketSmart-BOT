// One-time, guarded baselining for databases that were created with `prisma db push`
// or that already contain the legacy migrations before the new core baseline existed.
import 'dotenv/config';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CONFIRM = 'I_HAVE_A_VERIFIED_BACKUP';
if (process.env.BASELINE_EXISTING_DB !== CONFIRM) {
  console.error(`Từ chối chạy. Hãy sao lưu/kiểm tra restore, sau đó chạy với BASELINE_EXISTING_DB=${CONFIRM}`);
  process.exit(2);
}
if (!String(process.env.DATABASE_URL || '').startsWith('file:')) {
  console.error('Script baseline hiện chỉ hỗ trợ SQLite DATABASE_URL=file:...');
  process.exit(2);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prismaCli = join(root, 'node_modules', 'prisma', 'build', 'index.js');
const schema = join(root, 'prisma', 'schema.prisma');
const preHardening = [
  '20260729000000_baseline_core',
  '20260730070000_smart_assistant',
  '20260730103000_knowledge_action_engine',
  '20260730160000_smart_assistant_v5',
  '20260730190000_ticket_ai_v6',
  '20260730233000_multicluster_v62',
  '20260731113000_smartlearn_v1',
  '20260731143000_smartlearn_v2_knowledge_manager',
];
const requiredTables = [
  'Option', 'Ticket', 'Message', 'AuditLog', 'Staff', 'CannedResponse', 'RefreshToken',
  'Rating', 'AutoTagRule', 'Faq', 'Webhook', 'PushSubscription', 'TicketCreateLog',
  'GuildConfig', 'GeneratedBanner', 'TicketCounter', 'Cluster', 'IntentDetection',
  'SmartFeedback', 'SmartConversation', 'SmartConversationMessage', 'KnowledgeArticle',
  'KnowledgeRevision', 'KnowledgeAlias', 'KnowledgeCandidate', 'KnowledgeReview', 'ActionExecution',
];
const criticalColumns = {
  Ticket: ['workflowStatus', 'clusterKey', 'firstResponseAt'],
  GuildConfig: ['smartSupportEnabled', 'smartConversationEnabled', 'ticketAiEnabled', 'smartLearnEnabled'],
  KnowledgeArticle: ['clusterKeys', 'status', 'visibility'],
  KnowledgeCandidate: ['candidateType', 'targetArticleId'],
  Message: ['isInternal'],
};

let PrismaClient;
try {
  ({ PrismaClient } = await import('../src/generated/client/index.js'));
} catch (error) {
  console.error('Chưa có Prisma Client. Chạy `npm run db:generate` trước.', error.message);
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const tableRows = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = new Set(tableRows.map((row) => row.name));
  const missingTables = requiredTables.filter((name) => !tables.has(name));
  if (missingTables.length) {
    throw new Error(`Database không đủ schema v7.2.2 để baseline. Thiếu: ${missingTables.join(', ')}`);
  }
  for (const [table, columns] of Object.entries(criticalColumns)) {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(\"${table}\")`);
    const actual = new Set(rows.map((row) => row.name));
    const missing = columns.filter((column) => !actual.has(column));
    if (missing.length) throw new Error(`Bảng ${table} thiếu cột: ${missing.join(', ')}`);
  }

  let applied = new Set();
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL',
    );
    applied = new Set(rows.map((row) => row.migration_name));
  } catch { /* db push database has no migration table yet */ }

  const migrations = [...preHardening];
  if (tables.has('TicketCreationLock') && tables.has('WebhookDelivery')) {
    migrations.push('20260807000000_security_hardening');
  }

  await prisma.$disconnect();
  for (const migration of migrations) {
    if (applied.has(migration)) {
      console.log(`SKIP ${migration} (đã applied)`);
      continue;
    }
    const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'resolve', '--applied', migration, '--schema', schema], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      process.stderr.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      throw new Error(`Không thể resolve migration ${migration}`);
    }
    process.stdout.write(result.stdout || '');
  }
  console.log('Baseline hoàn tất. Tiếp theo chạy: npm run db:deploy');
} catch (error) {
  await prisma.$disconnect().catch(() => {});
  console.error('Baseline thất bại:', error.message);
  process.exit(1);
}

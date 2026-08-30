// Production supervisor: chạy API và Discord bot, tự hồi phục có giới hạn.
// Database/build được thực hiện bằng lệnh deploy rõ ràng, không tự npm install hoặc --accept-data-loss.
import 'dotenv/config';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const root = dirname(fileURLToPath(import.meta.url));
let appVersion = 'unknown';
try { appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || appVersion; } catch { /* startup still continues */ }
const children = new Map();
const restartHistory = new Map();
const restartTimers = new Map();
const processSpecs = new Map([
  ['API', 'src/api/index.js'],
  ['BOT', 'src/bot/index.js'],
]);

const RESTART_WINDOW_MS = 5 * 60_000;
const STABLE_RUNTIME_MS = 10 * 60_000;
const MAX_RESTARTS_PER_WINDOW = Math.max(1, Number.parseInt(process.env.PROCESS_RESTART_LIMIT, 10) || 5);
const MAX_RESTART_DELAY_MS = 30_000;
let shuttingDown = false;

function recentRestarts(name, now = Date.now()) {
  const history = (restartHistory.get(name) || []).filter((time) => now - time < RESTART_WINDOW_MS);
  restartHistory.set(name, history);
  return history;
}

function scheduleRestart(name, relativeFile, runtimeMs, exitCode) {
  const now = Date.now();
  const history = runtimeMs >= STABLE_RUNTIME_MS ? [] : recentRestarts(name, now);
  history.push(now);
  restartHistory.set(name, history);

  if (history.length > MAX_RESTARTS_PER_WINDOW) {
    console.error(`[${name}] lỗi liên tiếp quá ${MAX_RESTARTS_PER_WINDOW} lần trong 5 phút. Dừng hệ thống để tránh vòng lặp.`);
    shutdown(`${name.toLowerCase()}_restart_limit`, exitCode || 1);
    return;
  }

  const delay = Math.min(MAX_RESTART_DELAY_MS, 1000 * (2 ** Math.max(0, history.length - 1)));
  console.error(`[${name}] sẽ tự khởi động lại sau ${Math.round(delay / 1000)} giây (${history.length}/${MAX_RESTARTS_PER_WINDOW}).`);
  const timer = setTimeout(() => {
    restartTimers.delete(name);
    if (!shuttingDown) startProcess(name, relativeFile);
  }, delay);
  // Pending restarts must keep the supervisor alive even when both children exit.
  restartTimers.set(name, timer);
}

function startProcess(name, relativeFile) {
  if (shuttingDown || children.has(name)) return;
  const startedAt = Date.now();
  const child = spawn(process.execPath, [join(root, relativeFile)], {
    cwd: root,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.set(name, child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('error', (error) => console.error(`[${name}] không thể khởi động:`, error));
  child.on('exit', (code, signal) => {
    if (children.get(name) === child) children.delete(name);
    if (shuttingDown) return;
    const runtimeMs = Date.now() - startedAt;
    console.error(`[${name}] đã dừng (code=${code}, signal=${signal || 'none'}, runtime=${Math.round(runtimeMs / 1000)}s).`);
    scheduleRestart(name, relativeFile, runtimeMs, code || 1);
  });
}

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Đang tắt hệ thống (${signal})...`);

  for (const timer of restartTimers.values()) clearTimeout(timer);
  restartTimers.clear();

  const running = [...children.values()];
  for (const child of running) child.kill('SIGTERM');
  const timeout = setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 10_000);
  timeout.unref();

  if (running.length === 0) return process.exit(exitCode);
  Promise.all(running.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
  }))).finally(() => {
    clearTimeout(timeout);
    process.exit(exitCode);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

console.log(`🤖 Discord Smart Ticket System v${appVersion}`);
console.log('ℹ️  Deploy lần đầu: npm run db:generate && npm run db:deploy && npm run build');
for (const [name, file] of processSpecs) startProcess(name, file);

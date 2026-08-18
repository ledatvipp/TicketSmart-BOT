// Durable outgoing webhook outbox with SSRF protection, retry/backoff and HMAC signing.
import crypto from 'crypto';
import { prisma } from './db.js';
import { decryptSecret, encryptSecret } from './secrets.js';
import { safeHttpsPost } from './safeHttp.js';
import { APP_VERSION } from './version.js';

let cache = null;
let cacheAt = 0;
let workerTimer = null;
let workerBusy = false;
const CACHE_TTL_MS = 30_000;
function boundedEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name] || fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
const WORKER_INTERVAL_MS = boundedEnv('WEBHOOK_WORKER_INTERVAL_MS', 5_000, 1_000, 3_600_000);
const WEBHOOK_TIMEOUT_MS = boundedEnv('WEBHOOK_TIMEOUT_MS', 8_000, 1_000, 120_000);
const MAX_ATTEMPTS = boundedEnv('WEBHOOK_MAX_ATTEMPTS', 6, 1, 12);
const MAX_PAYLOAD_BYTES = boundedEnv('WEBHOOK_MAX_PAYLOAD_BYTES', 131_072, 16_384, 1_048_576);
const BATCH_SIZE = boundedEnv('WEBHOOK_BATCH_SIZE', 20, 1, 100);
const PROCESSING_TIMEOUT_MS = boundedEnv('WEBHOOK_PROCESSING_TIMEOUT_MS', 120_000, 30_000, 3_600_000);
const RETENTION_DAYS = boundedEnv('WEBHOOK_RETENTION_DAYS', 90, 1, 3650);
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000];

function eventMatches(eventsCsv, event) {
  const events = String(eventsCsv || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return events.length === 0 || events.includes('*') || events.includes(event);
}

function truncateError(value) {
  const text = String(value?.message || value || 'Lỗi webhook không xác định');
  return text.length > 1_000 ? `${text.slice(0, 997)}...` : text;
}

async function listWebhooks() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  cache = await prisma.webhook.findMany({ where: { enabled: true } });
  cacheAt = now;
  return cache;
}

export function clearWebhookCache() {
  cache = null;
  cacheAt = 0;
}

/**
 * Enqueue one immutable delivery per subscribed webhook. Network I/O is handled
 * by the worker, so user-facing mutations do not depend on remote endpoints.
 */
export async function fanOutWebhooks(event, payload) {
  const safeEvent = String(event || '').trim();
  if (!safeEvent) return { queued: 0 };

  const hooks = await listWebhooks();
  const matching = hooks.filter((hook) => eventMatches(hook.events, safeEvent));
  if (matching.length === 0) return { queued: 0 };

  const body = JSON.stringify({ event: safeEvent, payload, ts: Date.now() });
  if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw Object.assign(new Error('Payload webhook vượt giới hạn cho phép'), { code: 'WEBHOOK_PAYLOAD_TOO_LARGE' });
  }

  await prisma.$transaction(
    matching.map((hook) => prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: safeEvent,
        payload: body,
        status: 'pending',
        nextAttemptAt: new Date(),
      },
    })),
  );

  return { queued: matching.length };
}

function retryAtForAttempt(attempts) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay);
}

async function markFailure(delivery, error, responseStatus = null) {
  const attempts = delivery.attempts + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: dead ? 'dead' : 'retry',
      attempts,
      nextAttemptAt: dead ? delivery.nextAttemptAt : retryAtForAttempt(attempts),
      lockedAt: null,
      lastError: truncateError(error),
      responseStatus,
      deliveredAt: null,
    },
  });
}

async function processClaimedDelivery(delivery) {
  if (!delivery.webhook?.enabled) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'dead',
        attempts: delivery.attempts + 1,
        lockedAt: null,
        lastError: 'Webhook đã bị tắt hoặc không còn tồn tại',
      },
    }).catch(() => {});
    return;
  }

  try {
    const secret = delivery.webhook.secret ? decryptSecret(delivery.webhook.secret) : null;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': `TicketHub-Webhook/${APP_VERSION}`,
      'X-Webhook-Event': delivery.event,
      'X-Webhook-Delivery': delivery.id,
    };
    if (secret) {
      const signature = crypto.createHmac('sha256', secret).update(delivery.payload).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const response = await safeHttpsPost(delivery.webhook.url, {
      headers,
      body: delivery.payload,
      timeoutMs: WEBHOOK_TIMEOUT_MS,
      maxResponseBytes: 65_536,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      await markFailure(delivery, `Endpoint trả HTTP ${response.statusCode}`, response.statusCode);
      return;
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'delivered',
        attempts: delivery.attempts + 1,
        lockedAt: null,
        lastError: null,
        responseStatus: response.statusCode,
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    await markFailure(delivery, error, error?.statusCode || null);
  }
}

async function claimDelivery(candidate, now, staleBefore) {
  const claim = await prisma.webhookDelivery.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
        { status: 'processing', lockedAt: { lte: staleBefore } },
      ],
    },
    data: { status: 'processing', lockedAt: now },
  });
  if (claim.count !== 1) return null;
  return prisma.webhookDelivery.findUnique({
    where: { id: candidate.id },
    include: { webhook: true },
  });
}

export async function processWebhookDeliveries() {
  if (workerBusy) return { processed: 0, skipped: true };
  workerBusy = true;
  let processed = 0;
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);
    const candidates = await prisma.webhookDelivery.findMany({
      where: {
        OR: [
          { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: now } },
          { status: 'processing', lockedAt: { lte: staleBefore } },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: BATCH_SIZE,
      select: { id: true },
    });

    for (const candidate of candidates) {
      const delivery = await claimDelivery(candidate, now, staleBefore);
      if (!delivery) continue;
      await processClaimedDelivery(delivery);
      processed += 1;
    }
    return { processed, skipped: false };
  } finally {
    workerBusy = false;
  }
}

export async function migrateLegacyWebhookSecrets() {
  const legacy = await prisma.webhook.findMany({
    where: { secret: { not: null }, NOT: { secret: { startsWith: 'enc:v1:' } } },
    select: { id: true, secret: true },
  });
  for (const item of legacy) {
    await prisma.webhook.update({
      where: { id: item.id },
      data: { secret: encryptSecret(item.secret) },
    });
  }
  if (legacy.length) clearWebhookCache();
  return legacy.length;
}

export async function cleanupWebhookDeliveries() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.webhookDelivery.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: ['delivered', 'dead'] },
    },
  });
}

export function startWebhookWorker() {
  if (workerTimer) return;
  const run = () => processWebhookDeliveries().catch((error) => console.error('[WEBHOOK WORKER]', truncateError(error)));
  workerTimer = setInterval(run, WORKER_INTERVAL_MS);
  workerTimer.unref?.();
  Promise.all([
    migrateLegacyWebhookSecrets(),
    cleanupWebhookDeliveries(),
  ]).then(([migrated, cleanup]) => {
    if (migrated) console.log(`[WEBHOOK] Đã mã hóa ${migrated} secret legacy`);
    if (cleanup.count) console.log(`[WEBHOOK] Đã dọn ${cleanup.count} delivery cũ`);
    return run();
  }).catch((error) => console.error('[WEBHOOK STARTUP]', truncateError(error)));
}

export async function stopWebhookWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  const deadline = Date.now() + 5_000;
  while (workerBusy && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

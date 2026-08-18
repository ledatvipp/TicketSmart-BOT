// Audit log helper — gọi từ mọi mutation để ghi vết
// DB + Socket.IO realtime + Discord rich log (fire-and-forget)
import { prisma } from './db.js';
import { emit } from './realtime.js';
import { pushDiscordLog } from './discordLog.js';
import { fanOutWebhooks } from './webhooks.js';

/**
 * Ghi audit log + emit realtime + push Discord log
 */
export async function logAudit({
  action,
  actorId,
  actorName,
  actorKind = 'user',
  ticketId = null,
  metadata = {},
}) {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        action,
        actorId: String(actorId),
        actorName: String(actorName),
        actorKind,
        ticketId,
        metadata: JSON.stringify(metadata || {}),
      },
    });

    // Realtime emit
    emit('audit:logged', { ...entry, metadata: metadata || {} });
    if (ticketId) emit(`ticket:${ticketId}:audit`, { ...entry, metadata: metadata || {} });

    // Discord push — chạy nền nhưng luôn bắt lỗi để tránh unhandled rejection.
    void Promise.resolve(pushDiscordLog({
      action,
      actorId,
      actorName,
      actorKind,
      ticketId,
      metadata: metadata || {},
      createdAt: entry.createdAt,
    })).catch((error) => console.error('[DISCORD AUDIT LOG]', error?.message || error));

    // Outgoing webhooks được ghi vào durable outbox trước khi mutation hoàn tất.
    // Lỗi queue không làm mất audit DB nhưng được log rõ để vận hành phát hiện.
    try {
      await fanOutWebhooks(action, { actorId, actorName, actorKind, ticketId, metadata: metadata || {}, at: entry.createdAt });
    } catch (error) {
      console.error('[WEBHOOK OUTBOX]', error?.message || error);
    }

    return entry;
  } catch (err) {
    console.error('[AUDIT ERROR]', err.message);
    return null;
  }
}

/**
 * Lấy audit log với filter
 */
export async function listAudit({ ticketId, actorId, action, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (ticketId) where.ticketId = ticketId;
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    items: items.map((i) => ({ ...i, metadata: safeParse(i.metadata) })),
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

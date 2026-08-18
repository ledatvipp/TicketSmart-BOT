import crypto from 'crypto';
import { prisma } from '../../lib/db.js';
import { clearWebhookCache } from '../../lib/webhooks.js';
import { encryptSecret, maskSecret } from '../../lib/secrets.js';
import { resolveSafeHttpsUrl } from '../../lib/safeHttp.js';
import { logAudit } from '../../lib/audit.js';
import {
  ValidationError,
  cleanBoolean,
  cleanId,
  cleanString,
  cleanUrl,
} from '../security/validation.js';

const EVENT_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const DELIVERY_STATUSES = new Set(['pending', 'processing', 'retry', 'delivered', 'dead']);

function normalizeEvents(input) {
  const values = Array.isArray(input) ? input : String(input ?? '*').split(',');
  const events = [...new Set(values.map((event) => String(event).trim()).filter(Boolean))];
  if (events.length === 0) return '*';
  if (events.length > 64) throw new ValidationError('Tối đa 64 event cho mỗi webhook');
  for (const event of events) {
    if (event !== '*' && !EVENT_PATTERN.test(event)) {
      throw new ValidationError(`Event không hợp lệ: ${event}`);
    }
  }
  if (events.includes('*')) return '*';
  return events.join(',');
}

function publicWebhook(item, revealedSecret = null) {
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    events: item.events,
    enabled: item.enabled,
    hasSecret: Boolean(item.secret),
    secretPreview: item.secret ? maskSecret(item.secret) : null,
    deliveryCount: item._count?.deliveries ?? undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(revealedSecret ? { secret: revealedSecret } : {}),
  };
}

async function validatedUrl(value) {
  const url = cleanUrl(value, { field: 'url', protocols: ['https:'], max: 2_048 });
  await resolveSafeHttpsUrl(url);
  return url;
}

function freshSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

export const list = async (_req, res) => {
  const items = await prisma.webhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { deliveries: true } } },
  });
  res.json({ success: true, data: items.map((item) => publicWebhook(item)) });
};

export const create = async (req, res) => {
  const name = cleanString(req.body?.name, { field: 'name', min: 1, max: 120 });
  const url = await validatedUrl(req.body?.url);
  const events = normalizeEvents(req.body?.events);
  const enabled = req.body?.enabled === undefined ? true : cleanBoolean(req.body.enabled, { field: 'enabled' });
  const rawSecret = req.body?.secret
    ? cleanString(req.body.secret, { field: 'secret', min: 32, max: 256, trim: false })
    : freshSecret();

  const item = await prisma.webhook.create({
    data: { name, url, events, enabled, secret: encryptSecret(rawSecret) },
  });
  clearWebhookCache();
  await logAudit({
    action: 'webhook.create',
    actorId: req.user.discordId,
    actorName: req.user.username,
    metadata: { webhookId: item.id, name: item.name, url: item.url, events: item.events },
  });
  res.status(201).json({ success: true, data: publicWebhook(item, rawSecret) });
};

export const update = async (req, res) => {
  const id = cleanId(req.params.id, { field: 'id' });
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy webhook' });

  const data = {};
  if (req.body?.name !== undefined) data.name = cleanString(req.body.name, { field: 'name', min: 1, max: 120 });
  if (req.body?.url !== undefined) data.url = await validatedUrl(req.body.url);
  if (req.body?.events !== undefined) data.events = normalizeEvents(req.body.events);
  if (req.body?.enabled !== undefined) data.enabled = cleanBoolean(req.body.enabled, { field: 'enabled' });
  // Blank/omitted secret intentionally means "keep the existing secret".
  if (req.body?.secret !== undefined && String(req.body.secret).length > 0) {
    const rawSecret = cleanString(req.body.secret, { field: 'secret', min: 32, max: 256, trim: false });
    data.secret = encryptSecret(rawSecret);
  }
  if (Object.keys(data).length === 0) throw new ValidationError('Không có trường hợp lệ để cập nhật');

  const item = await prisma.webhook.update({ where: { id }, data });
  clearWebhookCache();
  await logAudit({
    action: 'webhook.update',
    actorId: req.user.discordId,
    actorName: req.user.username,
    metadata: { webhookId: item.id, fields: Object.keys(data).filter((key) => key !== 'secret') },
  });
  res.json({ success: true, data: publicWebhook(item) });
};

export const rotateSecret = async (req, res) => {
  const id = cleanId(req.params.id, { field: 'id' });
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy webhook' });
  const rawSecret = freshSecret();
  const item = await prisma.webhook.update({ where: { id }, data: { secret: encryptSecret(rawSecret) } });
  clearWebhookCache();
  await logAudit({
    action: 'webhook.secret.rotate',
    actorId: req.user.discordId,
    actorName: req.user.username,
    metadata: { webhookId: item.id, name: item.name },
  });
  res.json({ success: true, data: publicWebhook(item, rawSecret) });
};

export const listDeliveries = async (req, res) => {
  const webhookId = cleanId(req.params.id, { field: 'id' });
  const statusRaw = req.query?.status ? cleanString(req.query.status, { field: 'status', max: 32 }) : null;
  if (statusRaw && !DELIVERY_STATUSES.has(statusRaw)) throw new ValidationError('Trạng thái delivery không hợp lệ');
  const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query?.limit || '50'), 10) || 50));
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId }, select: { id: true } });
  if (!webhook) return res.status(404).json({ success: false, message: 'Không tìm thấy webhook' });
  const items = await prisma.webhookDelivery.findMany({
    where: { webhookId, ...(statusRaw ? { status: statusRaw } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      event: true,
      status: true,
      attempts: true,
      nextAttemptAt: true,
      lastError: true,
      responseStatus: true,
      createdAt: true,
      deliveredAt: true,
    },
  });
  res.json({ success: true, data: items });
};

export const replayDelivery = async (req, res) => {
  const id = cleanId(req.params.deliveryId, { field: 'deliveryId' });
  const existing = await prisma.webhookDelivery.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy delivery' });
  const item = await prisma.webhookDelivery.update({
    where: { id },
    data: {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lastError: null,
      responseStatus: null,
      deliveredAt: null,
    },
    select: { id: true, webhookId: true, event: true, status: true, nextAttemptAt: true },
  });
  await logAudit({
    action: 'webhook.delivery.replay',
    actorId: req.user.discordId,
    actorName: req.user.username,
    metadata: { webhookId: item.webhookId, deliveryId: item.id, event: item.event },
  });
  res.json({ success: true, data: item });
};

export const remove = async (req, res) => {
  const id = cleanId(req.params.id, { field: 'id' });
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy webhook' });
  await prisma.webhook.delete({ where: { id } });
  clearWebhookCache();
  await logAudit({
    action: 'webhook.delete',
    actorId: req.user.discordId,
    actorName: req.user.username,
    metadata: { webhookId: existing.id, name: existing.name },
  });
  res.json({ success: true });
};

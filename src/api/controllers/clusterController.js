import { prisma } from '../../lib/db.js';
import { logAudit } from '../../lib/audit.js';
import { emit } from '../../lib/realtime.js';
import {
  ValidationError, cleanBoolean, cleanDiscordId, cleanId, cleanInteger, cleanString,
} from '../security/validation.js';

function cleanCsv(value, { maxItems = 100, maxLength = 80, discordIds = false } = {}) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  const cleaned = [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
  if (cleaned.length > maxItems) throw new ValidationError(`Danh sách không được vượt quá ${maxItems} mục`);
  for (const item of cleaned) {
    if (item.length > maxLength) throw new ValidationError('Một mục trong danh sách quá dài');
    if (discordIds) cleanDiscordId(item);
  }
  return cleaned.join(',');
}
function cleanKey(value) {
  const key = cleanString(value, { field: 'key', min: 2, max: 40 }).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new ValidationError('Key cluster chỉ gồm chữ thường, số và dấu gạch ngang');
  return key;
}
function cleanColor(value) {
  const color = cleanString(value ?? '#5865F2', { field: 'color', min: 7, max: 7 }).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new ValidationError('Màu phải có dạng #RRGGBB');
  return color;
}
function normalize(body = {}, { partial = false, existing = null } = {}) {
  const data = {};
  if (!partial || body.key !== undefined || body.name !== undefined && !existing) {
    const key = cleanKey(body.key || body.name);
    if (existing && key !== existing.key) throw new ValidationError('Key cluster là định danh cố định và không thể đổi');
    data.key = key;
  }
  if (!partial || body.name !== undefined) data.name = cleanString(body.name, { field: 'name', min: 1, max: 80 });
  if (body.emoji !== undefined || !partial) data.emoji = cleanString(body.emoji || '🗺️', { field: 'emoji', min: 1, max: 16 });
  if (body.color !== undefined || !partial) data.color = cleanColor(body.color);
  if (body.aliases !== undefined || !partial) data.aliases = cleanCsv(body.aliases, { maxItems: 50, maxLength: 80 });
  if (body.description !== undefined || !partial) data.description = cleanString(body.description || '', { field: 'description', max: 500, allowEmpty: true, trim: false });
  if (body.discordCategoryId !== undefined) data.discordCategoryId = body.discordCategoryId ? cleanDiscordId(body.discordCategoryId, 'Category ID') : null;
  if (body.supportChannelIds !== undefined || !partial) data.supportChannelIds = cleanCsv(body.supportChannelIds, { maxItems: 100, maxLength: 32, discordIds: true });
  if (body.staffRoleIds !== undefined || !partial) data.staffRoleIds = cleanCsv(body.staffRoleIds, { maxItems: 100, maxLength: 32, discordIds: true });
  if (body.sortOrder !== undefined) data.sortOrder = cleanInteger(body.sortOrder, { field: 'sortOrder', min: -100_000, max: 100_000 });
  if (body.isActive !== undefined) data.isActive = cleanBoolean(body.isActive, { field: 'isActive' });
  return data;
}

async function withCounts(clusters) {
  const counts = await prisma.ticket.groupBy({ by: ['clusterKey'], _count: { _all: true } }).catch(() => []);
  const map = new Map(counts.map((item) => [item.clusterKey, item._count._all]));
  return clusters.map((cluster) => ({ ...cluster, _count: { tickets: map.get(cluster.key) || 0 } }));
}

export const getClusters = async (req, res, next) => {
  try {
    if (req.query.active !== undefined && !['true', 'false'].includes(String(req.query.active))) throw new ValidationError('active phải là true hoặc false');
    const where = req.query.active === 'true' ? { isActive: true } : req.query.active === 'false' ? { isActive: false } : {};
    const clusters = await prisma.cluster.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ success: true, data: await withCounts(clusters) });
  } catch (error) { next(error); }
};

export const createCluster = async (req, res, next) => {
  try {
    const cluster = await prisma.cluster.create({ data: normalize(req.body) });
    await logAudit({ action: 'cluster.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { clusterId: cluster.id, key: cluster.key } });
    emit('cluster:created', cluster);
    res.status(201).json({ success: true, data: cluster });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Key cluster đã tồn tại' });
    next(error);
  }
};

export const updateCluster = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, 'Cluster ID');
    const existing = await prisma.cluster.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy cluster' });
    const data = normalize(req.body, { partial: true, existing });
    delete data.key;
    if (!Object.keys(data).length) throw new ValidationError('Không có thay đổi nào');
    const cluster = await prisma.cluster.update({ where: { id }, data });
    await logAudit({ action: 'cluster.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { clusterId: id, key: cluster.key, fields: Object.keys(data) } });
    emit('cluster:updated', cluster);
    res.json({ success: true, data: cluster });
  } catch (error) { next(error); }
};

export const deleteCluster = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, 'Cluster ID');
    const existing = await prisma.cluster.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy cluster' });
    const [ticketCount, optionCount, knowledgeCount] = await Promise.all([
      prisma.ticket.count({ where: { clusterKey: existing.key } }),
      prisma.option.count({ where: { OR: [
        { clusterKeys: existing.key }, { clusterKeys: { startsWith: `${existing.key},` } },
        { clusterKeys: { endsWith: `,${existing.key}` } }, { clusterKeys: { contains: `,${existing.key},` } },
      ] } }),
      prisma.knowledgeArticle.count({ where: { OR: [
        { clusterKeys: existing.key }, { clusterKeys: { startsWith: `${existing.key},` } },
        { clusterKeys: { endsWith: `,${existing.key}` } }, { clusterKeys: { contains: `,${existing.key},` } },
      ] } }),
    ]);
    if (ticketCount || optionCount || knowledgeCount) {
      return res.status(409).json({
        success: false,
        message: `Cluster đang được tham chiếu bởi ${ticketCount} ticket, ${optionCount} option và ${knowledgeCount} bài knowledge; hãy tắt thay vì xóa`,
        code: 'CLUSTER_IN_USE',
      });
    }
    await prisma.cluster.delete({ where: { id } });
    await logAudit({ action: 'cluster.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { clusterId: id, key: existing.key } });
    emit('cluster:deleted', { id, key: existing.key });
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const toggleCluster = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, 'Cluster ID');
    const existing = await prisma.cluster.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy cluster' });
    const cluster = await prisma.cluster.update({ where: { id }, data: { isActive: !existing.isActive } });
    await logAudit({ action: 'cluster.toggle', actorId: req.user.discordId, actorName: req.user.username, metadata: { clusterId: id, key: cluster.key, isActive: cluster.isActive } });
    emit('cluster:updated', cluster);
    res.json({ success: true, data: cluster });
  } catch (error) { next(error); }
};

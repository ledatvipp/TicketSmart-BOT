import { prisma } from '../../lib/db.js';
import { logAudit } from '../../lib/audit.js';
import { ValidationError, cleanBoolean, cleanId, cleanString } from '../security/validation.js';

function normalizeKeywords(value) {
  const values = [...new Set(String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (!values.length) throw new ValidationError('Cần ít nhất một keyword');
  if (values.length > 100 || values.some((item) => item.length > 100)) throw new ValidationError('Danh sách keyword vượt giới hạn');
  return values.join(',');
}
function normalizeTag(value) {
  const tag = cleanString(value, { field: 'tag', min: 1, max: 50 }).toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(tag)) throw new ValidationError('Tag chứa ký tự không hợp lệ');
  return tag;
}
function normalize(body = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = cleanString(body.name, { field: 'name', min: 1, max: 100 });
  if (!partial || body.keywords !== undefined) data.keywords = normalizeKeywords(body.keywords);
  if (!partial || body.tag !== undefined) data.tag = normalizeTag(body.tag);
  if (body.enabled !== undefined) data.enabled = cleanBoolean(body.enabled, { field: 'enabled' });
  if (body.matchAll !== undefined) data.matchAll = cleanBoolean(body.matchAll, { field: 'matchAll' });
  return data;
}

export const list = async (_req, res, next) => {
  try { res.json({ success: true, data: await prisma.autoTagRule.findMany({ orderBy: { createdAt: 'desc' } }) }); }
  catch (error) { next(error); }
};
export const create = async (req, res, next) => {
  try {
    const item = await prisma.autoTagRule.create({ data: normalize(req.body) });
    await logAudit({ action: 'autotag.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, name: item.name, tag: item.tag } });
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
};
export const update = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const data = normalize(req.body, { partial: true });
    if (!Object.keys(data).length) throw new ValidationError('Không có thay đổi nào');
    if (!(await prisma.autoTagRule.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ success: false, message: 'Không tìm thấy rule' });
    const item = await prisma.autoTagRule.update({ where: { id }, data });
    await logAudit({ action: 'autotag.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { id, fields: Object.keys(data) } });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};
export const remove = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const existing = await prisma.autoTagRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy rule' });
    await prisma.autoTagRule.delete({ where: { id } });
    await logAudit({ action: 'autotag.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { id, name: existing.name } });
    res.json({ success: true });
  } catch (error) { next(error); }
};

import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { ValidationError, cleanId, cleanInteger, cleanString } from '../security/validation.js';

function normalizeShortcut(value) {
  const shortcut = cleanString(value, { field: 'shortcut', min: 1, max: 40 }).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(shortcut)) throw new ValidationError('Shortcut chỉ được gồm a-z, 0-9, _ và -');
  return shortcut;
}
function normalize(body = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || body.shortcut !== undefined) data.shortcut = normalizeShortcut(body.shortcut);
  if (!partial || body.title !== undefined) data.title = cleanString(body.title, { field: 'title', min: 1, max: 120 });
  if (!partial || body.content !== undefined) data.content = cleanString(body.content, { field: 'content', min: 1, max: 2_000, trim: false });
  if (body.category !== undefined || !partial) data.category = cleanString(body.category || '', { field: 'category', max: 80, allowEmpty: true });
  if (body.sortOrder !== undefined) data.sortOrder = cleanInteger(body.sortOrder, { field: 'sortOrder', min: -100_000, max: 100_000 });
  return data;
}

export const lookupCanned = async (req, res, next) => {
  try {
    const shortcut = normalizeShortcut(req.params.shortcut);
    const item = await prisma.cannedResponse.findUnique({ where: { shortcut } });
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy canned response' });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};
export const listCanned = async (_req, res, next) => {
  try {
    const items = await prisma.cannedResponse.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};
export const createCanned = async (req, res, next) => {
  try {
    const item = await prisma.cannedResponse.create({ data: normalize(req.body) });
    await logAudit({ action: 'canned.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, shortcut: item.shortcut } });
    emit('canned:updated', null);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Shortcut đã tồn tại' });
    next(error);
  }
};
export const updateCanned = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const data = normalize(req.body, { partial: true });
    if (!Object.keys(data).length) throw new ValidationError('Không có thay đổi nào');
    if (!(await prisma.cannedResponse.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ success: false, message: 'Không tìm thấy canned response' });
    const item = await prisma.cannedResponse.update({ where: { id }, data });
    await logAudit({ action: 'canned.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { id, fields: Object.keys(data) } });
    emit('canned:updated', null);
    res.json({ success: true, data: item });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Shortcut đã tồn tại' });
    next(error);
  }
};
export const deleteCanned = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const existing = await prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy canned response' });
    await prisma.cannedResponse.delete({ where: { id } });
    await logAudit({ action: 'canned.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { id, shortcut: existing.shortcut } });
    emit('canned:updated', null);
    res.json({ success: true });
  } catch (error) { next(error); }
};

import { prisma } from '../../lib/db.js';
import { logAudit } from '../../lib/audit.js';
import { findAccessibleTicket, mergeWhereWithTicketScope } from '../security/policy.js';
import {
  ValidationError, cleanBoolean, cleanId, cleanInteger, cleanString,
} from '../security/validation.js';

function normalizeFaq(body = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || body.title !== undefined) data.title = cleanString(body.title, { field: 'title', min: 1, max: 200 });
  if (!partial || body.content !== undefined) data.content = cleanString(body.content, { field: 'content', min: 1, max: 20_000, trim: false });
  if (body.keywords !== undefined || !partial) data.keywords = cleanString(body.keywords || '', { field: 'keywords', max: 2_000, allowEmpty: true });
  if (body.category !== undefined || !partial) data.category = cleanString(body.category || '', { field: 'category', max: 100, allowEmpty: true });
  if (body.enabled !== undefined) data.enabled = cleanBoolean(body.enabled, { field: 'enabled' });
  if (body.sortOrder !== undefined) data.sortOrder = cleanInteger(body.sortOrder, { field: 'sortOrder', min: -100_000, max: 100_000 });
  return data;
}

export const listFaqs = async (req, res, next) => {
  try {
    const search = req.query.search ? cleanString(req.query.search, { field: 'search', min: 1, max: 200 }) : null;
    const all = req.query.all === 'true';
    const where = all ? {} : { enabled: true };
    if (search) where.OR = [{ title: { contains: search } }, { keywords: { contains: search } }, { content: { contains: search } }];
    const items = await prisma.faq.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

export const getFaq = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const existing = await prisma.faq.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy FAQ' });
    const item = await prisma.faq.update({ where: { id }, data: { views: { increment: 1 } } });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

export const createFaq = async (req, res, next) => {
  try {
    const item = await prisma.faq.create({ data: normalizeFaq(req.body) });
    await logAudit({ action: 'faq.create', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, title: item.title } });
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
};

export const updateFaq = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const data = normalizeFaq(req.body, { partial: true });
    if (!Object.keys(data).length) throw new ValidationError('Không có thay đổi nào');
    const existing = await prisma.faq.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy FAQ' });
    const item = await prisma.faq.update({ where: { id }, data });
    await logAudit({ action: 'faq.update', actorId: req.user.discordId, actorName: req.user.username, metadata: { id: item.id, fields: Object.keys(data) } });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

export const deleteFaq = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const existing = await prisma.faq.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy FAQ' });
    await prisma.faq.delete({ where: { id } });
    await logAudit({ action: 'faq.delete', actorId: req.user.discordId, actorName: req.user.username, metadata: { id, title: existing.title } });
    res.json({ success: true });
  } catch (error) { next(error); }
};

/** Similar tickets are constrained to the same object scope as the source ticket. */
export const findSimilarTickets = async (req, res, next) => {
  try {
    const id = cleanId(req.params.id, { field: 'id' });
    const ticket = await findAccessibleTicket({ id, user: req.user });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    const tags = String(ticket.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
    const similarity = {
      id: { not: id },
      OR: [
        ...tags.map((tag) => ({ tags: { contains: tag } })),
        ...(ticket.optionId ? [{ optionId: ticket.optionId }] : []),
      ],
    };
    if (!similarity.OR.length) return res.json({ success: true, data: [] });
    const items = await prisma.ticket.findMany({
      where: mergeWhereWithTicketScope(similarity, req.user),
      take: 10,
      orderBy: { openedAt: 'desc' },
      select: { id: true, ticketNum: true, creatorName: true, tags: true, status: true, openedAt: true, optionId: true },
    });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

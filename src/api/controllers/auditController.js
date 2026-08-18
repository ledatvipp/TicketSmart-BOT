import { prisma } from '../../lib/db.js';
import { findAccessibleTicket, ticketScopeForUser } from '../security/policy.js';
import { cleanId, cleanInteger, cleanString } from '../security/validation.js';

function safeParse(value) {
  try { return JSON.parse(value); } catch { return {}; }
}

export async function getAuditLog(req, res, next) {
  try {
    const ticketId = req.query.ticketId ? cleanId(req.query.ticketId, 'Ticket ID') : null;
    const actorId = req.query.actorId ? cleanString(req.query.actorId, { min: 1, max: 64, allowEmpty: false }) : null;
    const action = req.query.action ? cleanString(req.query.action, { min: 1, max: 100, allowEmpty: false }) : null;
    const limit = cleanInteger(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const offset = cleanInteger(req.query.offset, { min: 0, max: 100_000, fallback: 0 });
    if (ticketId && !(await findAccessibleTicket({ id: ticketId, user: req.user }))) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    }

    const where = {};
    if (ticketId) where.ticketId = ticketId;
    if (actorId) where.actorId = actorId;
    if (action) where.action = action;
    const ticketScope = ticketScopeForUser(req.user);
    if (Object.keys(ticketScope).length) where.ticket = ticketScope;

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    ]);
    res.json({ success: true, data: { total, items: items.map((item) => ({ ...item, metadata: safeParse(item.metadata) })) } });
  } catch (error) { next(error); }
}

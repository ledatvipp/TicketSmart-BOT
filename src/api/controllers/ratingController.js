import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { ticketScopeForUser } from '../security/policy.js';
import { cleanDiscordId, cleanId, cleanInteger, cleanString } from '../security/validation.js';

export async function submitRating(req, res, next) {
  try {
    const ticketId = cleanId(req.body?.ticketId, 'Ticket ID');
    const raterId = cleanDiscordId(req.body?.raterId);
    const score = cleanInteger(req.body?.score, { min: 1, max: 5 });
    const comment = cleanString(req.body?.comment, { max: 1000 }) || null;
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (ticket.status !== 'closed') return res.status(409).json({ success: false, message: 'Chỉ có thể đánh giá ticket đã đóng' });
    if (ticket.creatorId !== raterId) return res.status(403).json({ success: false, message: 'Chỉ người tạo ticket được đánh giá' });
    try {
      const rating = await prisma.rating.create({ data: { ticketId, raterId, score, comment, staffId: ticket.claimerId, staffName: ticket.claimerName } });
      await logAudit({ action: 'ticket.rating', actorId: raterId, actorName: ticket.creatorName || 'User', actorKind: 'user', ticketId, metadata: { score, staffId: ticket.claimerId, staffName: ticket.claimerName } });
      emit('rating:new', { ...rating, optionId: ticket.optionId });
      return res.json({ success: true, data: rating });
    } catch (error) {
      if (error?.code === 'P2002') return res.status(409).json({ success: false, message: 'Ticket đã được đánh giá' });
      throw error;
    }
  } catch (error) { next(error); }
}

export async function listRatings(req, res, next) {
  try {
    const staffId = req.query.staffId ? cleanDiscordId(req.query.staffId, 'Staff ID') : null;
    const limit = cleanInteger(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const ticketScope = ticketScopeForUser(req.user);
    const where = { ...(staffId ? { staffId } : {}), ...(Object.keys(ticketScope).length ? { ticket: ticketScope } : {}) };
    const [items, aggregate, grouped] = await Promise.all([
      prisma.rating.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: { ticket: { select: { ticketNum: true, creatorName: true, optionId: true } } } }),
      prisma.rating.aggregate({ where, _avg: { score: true }, _count: { id: true } }),
      prisma.rating.groupBy({ by: ['score'], where, _count: { id: true } }),
    ]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of grouped) distribution[row.score] = row._count.id;
    res.json({ success: true, data: { items, stats: { total: aggregate._count.id, avg: aggregate._avg.score || 0, distribution } } });
  } catch (error) { next(error); }
}

export async function ratingsByStaff(req, res, next) {
  try {
    const ticketScope = ticketScopeForUser(req.user);
    const where = { staffId: { not: null }, ...(Object.keys(ticketScope).length ? { ticket: ticketScope } : {}) };
    const grouped = await prisma.rating.groupBy({ by: ['staffId', 'staffName'], _avg: { score: true }, _count: { id: true }, where });
    const data = grouped.map((row) => ({ staffId: row.staffId, staffName: row.staffName, avgScore: row._avg.score, count: row._count.id })).sort((a, b) => b.avgScore - a.avgScore);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

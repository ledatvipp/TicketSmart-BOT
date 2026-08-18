import { prisma } from '../../lib/db.js';
import { mergeWhereWithTicketScope, ticketScopeForUser } from '../security/policy.js';
import { cleanDate, cleanEnum, cleanInteger, safeCsvCell } from '../security/validation.js';
import { summarizeTicketMoves } from '../../tickets/ticketMovePolicy.js';

const TICKET_STATUSES = ['open', 'claimed', 'closed'];

function scoped(where, req) {
  return mergeWhereWithTicketScope(where, req.user);
}

function ratingScope(req, extra = {}) {
  const ticketScope = ticketScopeForUser(req.user);
  return Object.keys(ticketScope).length ? { ...extra, ticket: ticketScope } : extra;
}

export async function getOverview(req, res, next) {
  try {
    const [totalTickets, openTickets, claimedTickets, closedTickets, slaBreached, closed, ratings] = await Promise.all([
      prisma.ticket.count({ where: scoped({}, req) }),
      prisma.ticket.count({ where: scoped({ status: 'open' }, req) }),
      prisma.ticket.count({ where: scoped({ status: 'claimed' }, req) }),
      prisma.ticket.count({ where: scoped({ status: 'closed' }, req) }),
      prisma.ticket.count({ where: scoped({ slaBreachedAt: { not: null } }, req) }),
      prisma.ticket.findMany({ where: scoped({ status: 'closed', closedAt: { not: null } }, req), select: { openedAt: true, closedAt: true, firstResponseAt: true } }),
      prisma.rating.findMany({ where: ratingScope(req), select: { score: true } }),
    ]);
    const closeTimes = closed.map((row) => (row.closedAt - row.openedAt) / 60_000).filter(Number.isFinite);
    const responseTimes = closed.filter((row) => row.firstResponseAt).map((row) => (row.firstResponseAt - row.openedAt) / 60_000).filter(Number.isFinite);
    const avgRating = ratings.length ? ratings.reduce((sum, row) => sum + row.score, 0) / ratings.length : 0;
    res.json({ success: true, data: {
      totalTickets, openTickets, claimedTickets, closedTickets, slaBreached,
      avgCloseTimeMinutes: avg(closeTimes), p50CloseTimeMinutes: percentile(closeTimes, 50), p95CloseTimeMinutes: percentile(closeTimes, 95),
      avgFirstResponseMinutes: avg(responseTimes), p95FirstResponseMinutes: percentile(responseTimes, 95),
      avgRating, ratingCount: ratings.length,
    } });
  } catch (error) { next(error); }
}

export async function getChart(req, res, next) {
  try {
    const days = cleanInteger(req.query.days, { min: 1, max: 90, fallback: 14 });
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    const tickets = await prisma.ticket.findMany({ where: scoped({ openedAt: { gte: start } }, req), select: { openedAt: true, status: true } });
    const byDate = {};
    for (let index = 0; index < days; index += 1) {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      byDate[key] = { date: key, opened: 0, closed: 0 };
    }
    for (const ticket of tickets) {
      const key = ticket.openedAt.toISOString().slice(0, 10);
      if (byDate[key]) {
        byDate[key].opened += 1;
        if (ticket.status === 'closed') byDate[key].closed += 1;
      }
    }
    res.json({ success: true, data: { chart: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)) } });
  } catch (error) { next(error); }
}

export async function getByOption(req, res, next) {
  try {
    const scope = ticketScopeForUser(req.user);
    const grouped = await prisma.ticket.groupBy({ by: ['optionId'], where: scope, _count: { id: true } });
    const allowedIds = req.user.allOptions ? undefined : req.user.allowedOptions;
    const options = await prisma.option.findMany({
      where: allowedIds ? { id: { in: allowedIds } } : undefined,
      select: { id: true, name: true, emoji: true, color: true },
    });
    const map = Object.fromEntries(options.map((row) => [row.id, row]));
    const data = grouped.map((group) => ({
      optionId: group.optionId,
      optionName: group.optionId ? (map[group.optionId]?.name || 'Unknown') : '—',
      emoji: group.optionId ? map[group.optionId]?.emoji : '◈',
      color: group.optionId ? map[group.optionId]?.color : '#666',
      count: group._count.id,
    })).sort((a, b) => b.count - a.count);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getHeatmap(req, res, next) {
  try {
    const days = cleanInteger(req.query.days, { min: 1, max: 90, fallback: 30 });
    const since = new Date(Date.now() - days * 86_400_000);
    const tickets = await prisma.ticket.findMany({ where: scoped({ openedAt: { gte: since } }, req), select: { openedAt: true } });
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const ticket of tickets) grid[ticket.openedAt.getDay()][ticket.openedAt.getHours()] += 1;
    res.json({ success: true, data: { grid, days, totalTickets: tickets.length } });
  } catch (error) { next(error); }
}

export async function getTopRequesters(req, res, next) {
  try {
    const limit = cleanInteger(req.query.limit, { min: 1, max: 50, fallback: 10 });
    const grouped = await prisma.ticket.groupBy({
      by: ['creatorId', 'creatorName'], where: ticketScopeForUser(req.user), _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: limit,
    });
    res.json({ success: true, data: grouped.map((row) => ({ creatorId: row.creatorId, creatorName: row.creatorName, count: row._count.id })) });
  } catch (error) { next(error); }
}

export async function getDistribution(req, res, next) {
  try {
    const closed = await prisma.ticket.findMany({ where: scoped({ status: 'closed', closedAt: { not: null } }, req), select: { openedAt: true, closedAt: true, firstResponseAt: true } });
    const closeBuckets = bucketize(closed.map((row) => (row.closedAt - row.openedAt) / 60_000), [15, 60, 240, 1440, 10080, Infinity], ['<15m', '15m-1h', '1h-4h', '4h-1d', '1d-1w', '>1w']);
    const responseBuckets = bucketize(closed.filter((row) => row.firstResponseAt).map((row) => (row.firstResponseAt - row.openedAt) / 60_000), [5, 15, 60, 240, Infinity], ['<5m', '5-15m', '15m-1h', '1h-4h', '>4h']);
    res.json({ success: true, data: { closeTime: closeBuckets, firstResponse: responseBuckets } });
  } catch (error) { next(error); }
}

export async function getTagCloud(req, res, next) {
  try {
    const tickets = await prisma.ticket.findMany({ where: scoped({ NOT: { tags: '' } }, req), select: { tags: true } });
    const counter = {};
    for (const ticket of tickets) {
      for (const tag of (ticket.tags || '').split(',').map((value) => value.trim()).filter(Boolean)) counter[tag] = (counter[tag] || 0) + 1;
    }
    const data = Object.entries(counter).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getMoveAnalytics(req, res, next) {
  try {
    const days = cleanInteger(req.query.days, { min: 1, max: 365, fallback: 30 });
    const since = new Date(Date.now() - days * 86_400_000);
    const ticketScope = ticketScopeForUser(req.user);
    const moveWhere = {
      createdAt: { gte: since },
      ...(Object.keys(ticketScope).length ? { ticket: ticketScope } : {}),
    };
    const [moveRows, openedTickets, movedOpenedTickets] = await Promise.all([
      prisma.ticketMove.findMany({
        where: moveWhere,
        orderBy: { createdAt: 'desc' },
        take: 10_001,
        select: {
          ticketId: true, fromOptionId: true, fromOptionName: true, toOptionId: true, toOptionName: true,
          movedById: true, movedByName: true, source: true, createdAt: true,
        },
      }),
      prisma.ticket.count({ where: scoped({ openedAt: { gte: since } }, req) }),
      prisma.ticket.count({ where: scoped({ openedAt: { gte: since }, moveCount: { gt: 0 } }, req) }),
    ]);
    const truncated = moveRows.length > 10_000;
    const moves = moveRows.slice(0, 10_000);
    const summary = summarizeTicketMoves(moves);

    res.json({ success: true, data: {
      days, ...summary,
      openedTickets,
      movedOpenedTickets,
      moveRatePercent: openedTickets ? Math.round((movedOpenedTickets / openedTickets) * 10_000) / 100 : 0,
      truncated,
      topTransitions: summary.topTransitions.slice(0, 20),
      topMovers: summary.topMovers.slice(0, 20),
      recent: moves.slice(0, 50),
    } });
  } catch (error) { next(error); }
}

export async function exportMoveCsv(req, res, next) {
  try {
    const days = cleanInteger(req.query.days, { min: 1, max: 365, fallback: 30 });
    const since = new Date(Date.now() - days * 86_400_000);
    const ticketScope = ticketScopeForUser(req.user);
    const moves = await prisma.ticketMove.findMany({
      where: {
        createdAt: { gte: since },
        ...(Object.keys(ticketScope).length ? { ticket: ticketScope } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      select: {
        id: true, ticketId: true, fromOptionId: true, fromOptionName: true, toOptionId: true, toOptionName: true,
        fromCategoryId: true, toCategoryId: true, movedById: true, movedByName: true, reason: true, source: true, createdAt: true,
        ticket: { select: { ticketNum: true, creatorId: true, creatorName: true } },
      },
    });
    const header = [
      'createdAt', 'ticketNum', 'ticketId', 'creatorId', 'creatorName',
      'fromOptionId', 'fromOptionName', 'toOptionId', 'toOptionName',
      'fromCategoryId', 'toCategoryId', 'movedById', 'movedByName', 'source', 'reason', 'moveId',
    ];
    const rows = moves.map((move) => [
      move.createdAt.toISOString(), move.ticket?.ticketNum || '', move.ticketId, move.ticket?.creatorId || '', move.ticket?.creatorName || '',
      move.fromOptionId || '', move.fromOptionName || '', move.toOptionId, move.toOptionName,
      move.fromCategoryId || '', move.toCategoryId || '', move.movedById, move.movedByName, move.source, move.reason || '', move.id,
    ]);
    const csv = [header, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-moves-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${csv}`);
  } catch (error) { next(error); }
}

export async function exportCsv(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = cleanEnum(req.query.status, TICKET_STATUSES, 'Trạng thái');
    const dateFrom = cleanDate(req.query.dateFrom, 'Ngày bắt đầu');
    const dateTo = cleanDate(req.query.dateTo, 'Ngày kết thúc');
    if (dateFrom || dateTo) {
      where.openedAt = {};
      if (dateFrom) where.openedAt.gte = dateFrom;
      if (dateTo) where.openedAt.lte = dateTo;
      if (dateFrom && dateTo && dateFrom > dateTo) throw Object.assign(new Error('Ngày bắt đầu phải trước ngày kết thúc'), { statusCode: 400 });
    }
    const tickets = await prisma.ticket.findMany({
      where: scoped(where, req), include: { option: { select: { name: true } } }, orderBy: { openedAt: 'desc' }, take: 5000,
    });
    const header = ['ticketNum', 'status', 'priority', 'type', 'option', 'creator', 'staff', 'tags', 'openedAt', 'closedAt', 'messageCount', 'moveCount', 'lastMovedAt', 'lastMovedBy'];
    const rows = tickets.map((ticket) => [
      ticket.ticketNum, ticket.status, ticket.priority, ticket.type, ticket.option?.name || '', ticket.creatorName,
      ticket.claimerName || '', ticket.tags || '', ticket.openedAt.toISOString(), ticket.closedAt?.toISOString() || '', ticket.messageCount || 0,
      ticket.moveCount || 0, ticket.lastMovedAt?.toISOString() || '', ticket.lastMovedBy || '',
    ]);
    const csv = [header, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${csv}`);
  } catch (error) { next(error); }
}

function avg(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}
function bucketize(values, edges, labels) {
  const buckets = labels.map((label) => ({ label, count: 0 }));
  for (const value of values.filter(Number.isFinite)) {
    for (let index = 0; index < edges.length; index += 1) {
      if (value < edges[index]) { buckets[index].count += 1; break; }
    }
  }
  return buckets;
}

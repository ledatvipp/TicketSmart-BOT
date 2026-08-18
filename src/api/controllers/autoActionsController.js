// Auto-actions controller — bot ping mỗi 60s, controller xử lý logic + trả về list action cần làm
import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { captureResolvedTicketLearning } from '../../smartlearn/resolvedTicketLearning.js';

/**
 * POST /api/auto-actions/run (bot secret only)
 * Returns { actions: [{ kind, channelId, ticketId, ... }] }
 */
export async function runAutoActions(_req, res) {
  try {
    const config = await prisma.guildConfig.findFirst();
    if (!config) return res.json({ success: true, data: { actions: [] } });

    const now = Date.now();
    const actions = [];

    const openTickets = await prisma.ticket.findMany({
      where: { status: { in: ['open', 'claimed'] } },
      include: { option: true },
    });

    for (const t of openTickets) {
      const autoCloseHrs   = t.option?.autoCloseHours      ?? config.defaultAutoCloseHours;
      const autoEscaleMin  = t.option?.autoEscalateMinutes ?? config.defaultAutoEscalateMinutes;
      const slaMin = pickSla(t.priority, config);

      const lastActivity = t.lastMessageAt ? new Date(t.lastMessageAt).getTime() : new Date(t.openedAt).getTime();
      const inactiveMs = now - lastActivity;
      const sinceOpenMs = now - new Date(t.openedAt).getTime();

      // 1. Auto-close inactive
      if (autoCloseHrs > 0 && inactiveMs > autoCloseHrs * 3600_000) {
        // Close trong DB
        await prisma.ticket.update({
          where: { id: t.id },
          data: { status: 'closed', closedAt: new Date(), closeReason: `Auto-close: inactive ${autoCloseHrs}h` },
        }).catch(() => {});
        await logAudit({
          action: 'ticket.close',
          actorId: 'system', actorName: 'AutoClose', actorKind: 'system',
          ticketId: t.id,
          metadata: { reason: 'inactive', inactiveHours: autoCloseHrs },
        });
        await captureResolvedTicketLearning(prisma, t.id).catch((error) => {
          console.warn('[AUTO CLOSE SMARTLEARN]', t.id, error.message);
        });
        emit('ticket:closed', { ...t, status: 'closed' });
        if (t.channelId) actions.push({ kind: 'auto-close', channelId: t.channelId, ticketId: t.id, inactiveHours: autoCloseHrs });
        continue;
      }

      // 2. Auto-escalate chưa claim
      if (t.status === 'open' && autoEscaleMin > 0 && sinceOpenMs > autoEscaleMin * 60_000 && t.priority !== 'urgent') {
        await prisma.ticket.update({ where: { id: t.id }, data: { priority: 'urgent' } });
        await logAudit({
          action: 'ticket.priority',
          actorId: 'system', actorName: 'AutoEscalate', actorKind: 'system',
          ticketId: t.id,
          metadata: { from: t.priority, to: 'urgent', reason: 'no-claim' },
        });
        if (t.channelId) actions.push({
          kind: 'auto-escalate',
          channelId: t.channelId,
          ticketId: t.id,
          waitMinutes: autoEscaleMin,
          allowedStaffRoles: t.option?.allowedStaffRoles || '',
        });
      }

      // 3. SLA breach detection (chỉ alert 1 lần)
      if (!t.firstResponseAt && !t.slaBreachedAt && slaMin > 0 && sinceOpenMs > slaMin * 60_000) {
        await prisma.ticket.update({ where: { id: t.id }, data: { slaBreachedAt: new Date() } });
        await logAudit({
          action: 'ticket.sla.breach',
          actorId: 'system', actorName: 'SLA', actorKind: 'system',
          ticketId: t.id,
          metadata: { targetMinutes: slaMin, elapsedMinutes: Math.round(sinceOpenMs / 60_000) },
        });
        if (t.channelId) actions.push({
          kind: 'sla-breach',
          channelId: t.channelId,
          ticketId: t.id,
          targetMinutes: slaMin,
          elapsedMinutes: Math.round(sinceOpenMs / 60_000),
          allowedStaffRoles: t.option?.allowedStaffRoles || '',
        });
      }
    }

    res.json({ success: true, data: { actions } });
  } catch (err) {
    console.error('[AUTO ACTIONS ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi auto actions' });
  }
}

function pickSla(priority, cfg) {
  switch (priority) {
    case 'urgent': return cfg.slaUrgentMinutes;
    case 'high':   return cfg.slaHighMinutes;
    default:       return cfg.slaNormalMinutes;
  }
}

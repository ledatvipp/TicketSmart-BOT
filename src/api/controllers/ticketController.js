// Controller quản lý tickets — dùng prisma singleton, emit realtime, ghi audit
import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { sendChannelMessage, sendDM } from '../../lib/discord.js';
import { applyAutoTagRules } from '../../lib/autoTag.js';
import {
  actorFromRequest, canViewInternal, hasPermission, mergeWhereWithTicketScope, findAccessibleTicket,
} from '../security/policy.js';
import {
  cleanBoolean, cleanDate, cleanDiscordId, cleanEnum, cleanHttpUrl, cleanId, cleanInteger, cleanString, cleanStringArray,
  parseJsonObject, ValidationError,
} from '../security/validation.js';
import {
  TICKET_INCLUDE, assignTicketRecord, claimTicketRecord, closeTicketRecord, moveTicketRecord, renderTicketMarkdown, splitDiscordMessage,
} from '../../services/ticketService.js';
import { MessageActorType, persistTicketMessage } from '../../services/messageService.js';
import { getOpenTicketLimit } from '../../services/ticketLimit.js';

async function sendResolutionAndRating(ticket, { reason, staffName }) {
  if (!reason || !ticket.creatorId) return;

  const imageUrl = reason.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/i)?.[0];
  const resultEmbed = {
    color: 0x34c759,
    title: `Ticket #${String(ticket.ticketNum).padStart(4, '0')} đã được xử lý`,
    description: reason,
    fields: [{ name: 'Staff hỗ trợ', value: staffName || ticket.claimerName || 'Staff team', inline: true }],
    timestamp: new Date().toISOString(),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
  };
  await sendDM(ticket.creatorId, { embeds: [resultEmbed] });

  const ratingEmbed = {
    color: 0xffcc00,
    title: `Đánh giá Ticket #${String(ticket.ticketNum).padStart(4, '0')}`,
    description: `Ticket của bạn đã được xử lý${staffName ? ` bởi **${staffName}**` : ''}.\nBạn đánh giá trải nghiệm hỗ trợ này thế nào?`,
    footer: { text: 'Bấm số sao tương ứng - feedback giúp chúng tôi cải thiện!' },
  };
  const row = {
    type: 1,
    components: [1, 2, 3, 4, 5].map((score) => ({
      type: 2,
      custom_id: `rate:${ticket.id}:${score}`,
      label: '⭐'.repeat(score),
      style: score >= 4 ? 3 : score >= 3 ? 1 : 2,
    })),
  };
  await sendDM(ticket.creatorId, { embeds: [ratingEmbed], components: [row] });
}

// ─── GET /api/tickets ─────────────────────────────────────────────────────────

export const getTickets = async (req, res) => {
  try {
    const {
      status, optionId, type, priority, clusterKey, search, tag,
      mineOnly, claimerId, creatorId,
      dateFrom, dateTo, staleHours,
      sortBy = 'openedAt', sortDir = 'desc',
      page = '1', limit = '20',
    } = req.query;

    const filters = [];
    const base = {};
    if (status) base.status = cleanEnum(String(status), ['creating', 'open', 'claimed', 'closed', 'creation_failed'], 'Status');
    if (optionId) base.optionId = cleanId(optionId, 'Option ID');
    if (type) base.type = cleanString(type, { max: 100 });
    if (priority) base.priority = cleanEnum(String(priority), ['normal', 'high', 'urgent'], 'Priority');
    if (clusterKey) base.clusterKey = cleanString(clusterKey, { max: 80 });
    if (claimerId) base.claimerId = cleanDiscordId(claimerId);
    if (creatorId) base.creatorId = cleanDiscordId(creatorId);
    if (mineOnly === 'true' && req.authKind !== 'bot') base.claimerId = req.user.discordId;
    if (tag) base.tags = { contains: cleanString(tag, { max: 40 }) };
    if (Object.keys(base).length) filters.push(base);

    if (search) {
      const term = cleanString(search, { max: 200 });
      if (term) {
        const messageFilter = canViewInternal(req.user)
          ? { content: { contains: term } }
          : { content: { contains: term }, isInternal: false };
        filters.push({ OR: /^\d{15,22}$/.test(term) ? [
          { creatorId: term }, { claimerId: term }, { creatorName: { contains: term } },
        ] : [
          { creatorName: { contains: term } },
          { claimerName: { contains: term } },
          { tags: { contains: term } },
          ...(canViewInternal(req.user) ? [{ note: { contains: term } }] : []),
          { formData: { contains: term } },
          { messages: { some: messageFilter } },
        ] });
      }
    }

    if (dateFrom || dateTo) {
      const openedAt = {};
      if (dateFrom) openedAt.gte = cleanDate(dateFrom, 'dateFrom');
      if (dateTo) openedAt.lte = cleanDate(dateTo, 'dateTo');
      if (openedAt.gte && openedAt.lte && openedAt.gte > openedAt.lte) {
        throw new ValidationError('dateFrom phải trước dateTo');
      }
      filters.push({ openedAt });
    }

    if (staleHours !== undefined && staleHours !== '') {
      const hours = cleanInteger(staleHours, { min: 1, max: 24 * 365 });
      const cutoff = new Date(Date.now() - hours * 3600_000);
      filters.push({
        status: { not: 'closed' },
        OR: [
          { lastMessageAt: { lt: cutoff } },
          { lastMessageAt: null, openedAt: { lt: cutoff } },
        ],
      });
    }

    const where = mergeWhereWithTicketScope(filters.length === 0 ? {} : (filters.length === 1 ? filters[0] : { AND: filters }), req.user);
    const validSort = ['openedAt', 'claimedAt', 'closedAt', 'priority', 'ticketNum', 'lastMessageAt', 'messageCount'];
    const safeSort = validSort.includes(String(sortBy)) ? String(sortBy) : 'openedAt';
    const orderBy = { [safeSort]: sortDir === 'asc' ? 'asc' : 'desc' };
    const pageNum = cleanInteger(page, { min: 1, max: 1_000_000, fallback: 1 });
    const limitNum = cleanInteger(limit, { min: 1, max: 100, fallback: 20 });
    const skip = (pageNum - 1) * limitNum;

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({ where, orderBy, skip, take: limitNum, include: TICKET_INCLUDE }),
    ]);
    const data = canViewInternal(req.user) ? tickets : tickets.map(({ note: _note, aiSummary: _aiSummary, ...ticket }) => ticket);
    res.json({
      success: true,
      data: { tickets: data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } },
    });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[GET TICKETS ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách tickets' });
  }
};

// ─── GET /api/tickets/:id ─────────────────────────────────────────────────────

export const getTicketById = async (req, res) => {
  try {
    const ticket = await findAccessibleTicket({
      id: cleanId(req.params.id, 'Ticket ID'),
      user: req.user,
      include: {
        option: true,
        messages: {
          where: canViewInternal(req.user) ? {} : { isInternal: false },
          orderBy: { timestamp: 'asc' },
        },
      },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (!canViewInternal(req.user)) {
      ticket.note = null;
      ticket.aiSummary = null;
    }
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[GET TICKET BY ID ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy thông tin ticket' });
  }
};

// ─── GET /api/tickets/by-channel/:channelId ───────────────────────────────────

export async function getTicketByChannel(req, res) {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { channelId: cleanDiscordId(req.params.channelId, 'Channel ID') },
      include: { option: true },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    res.json({ success: true, data: ticket });
  } catch (err) {
    console.error('[GET BY CHANNEL ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy ticket' });
  }
}

// ─── GET /api/tickets/by-channel/:channelId/ai-context ─────────────────────────

/** Bot-only: recent public conversation context for in-ticket AI. */
export async function getTicketAiContext(req, res) {
  try {
    const channelId = cleanDiscordId(req.params.channelId, 'Channel ID');
    const limit = cleanInteger(req.query?.limit, { min: 2, max: 20, fallback: 8 });
    const ticket = await prisma.ticket.findFirst({
      where: { channelId },
      select: {
        id: true, ticketNum: true, optionId: true, type: true, clusterKey: true, creatorId: true,
        claimerId: true, status: true, priority: true, workflowStatus: true, aiLastIntent: true,
        aiSummary: true, tags: true, lastEscalatedAt: true,
      },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });

    const rows = await prisma.message.findMany({
      where: { ticketId: ticket.id, isInternal: false },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true, discordMessageId: true, authorId: true, authorName: true, isBot: true, content: true, timestamp: true,
      },
    });
    const authorIds = [...new Set(rows.filter((row) => !row.isBot).map((row) => row.authorId))];
    const staffRows = authorIds.length
      ? await prisma.staff.findMany({ where: { discordId: { in: authorIds } }, select: { discordId: true } })
      : [];
    const staffIds = new Set(staffRows.map((row) => row.discordId));
    if (ticket.claimerId) staffIds.add(ticket.claimerId);

    const history = rows.reverse().map((row) => ({
      id: row.id,
      messageId: row.discordMessageId || null,
      role: row.isBot ? 'assistant' : row.authorId === ticket.creatorId ? 'user' : staffIds.has(row.authorId) ? 'staff' : 'user',
      authorId: row.authorId,
      authorName: row.authorName,
      content: cleanString(row.content || '', { max: 2500, trim: false }),
      timestamp: row.timestamp,
    }));
    return res.json({ success: true, data: { ticket, history } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[GET TICKET AI CONTEXT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Không tải được ngữ cảnh AI của ticket' });
  }
}

// ─── POST /api/tickets ────────────────────────────────────────────────────────

export const createTicket = async (req, res) => {
  try {
    const body = req.body || {};
    const optionId = body.optionId ? cleanId(body.optionId, 'Option ID') : null;
    const creationKey = body.creationKey ? cleanString(body.creationKey, { min: 8, max: 128, allowEmpty: false }) : null;
    const type = cleanString(body.type, { min: 1, max: 100, allowEmpty: false });
    const creatorId = cleanDiscordId(body.creatorId);
    const creatorName = cleanString(body.creatorName, { min: 1, max: 100, allowEmpty: false });
    const creatorAvatar = cleanHttpUrl(body.creatorAvatar, { nullable: true });
    const channelId = body.channelId ? cleanDiscordId(body.channelId, 'Channel ID') : null;
    const priority = cleanEnum(body.priority || 'normal', ['normal', 'high', 'urgent'], 'Priority');
    const formData = parseJsonObject(body.formData, {});
    const serializedFormData = JSON.stringify(formData);
    if (Buffer.byteLength(serializedFormData, 'utf8') > 32 * 1024) throw new ValidationError('Form data quá lớn');

    let option = null;
    if (optionId) {
      option = await prisma.option.findUnique({ where: { id: optionId } });
      if (!option) return res.status(404).json({ success: false, message: 'Không tìm thấy option' });
      if (!option.isActive) return res.status(400).json({ success: false, message: 'Option đang bị vô hiệu hóa' });
    }

    let normalizedClusterKey = null;
    if (body.clusterKey) {
      const key = cleanString(body.clusterKey, { min: 1, max: 80, allowEmpty: false });
      const cluster = await prisma.cluster.findUnique({ where: { key } });
      if (!cluster || !cluster.isActive) return res.status(400).json({ success: false, message: 'Cụm máy chủ không hợp lệ hoặc đang tắt' });
      normalizedClusterKey = cluster.key;
      if (option?.clusterKeys && option.clusterKeys !== '*') {
        const scopes = option.clusterKeys.split(',').map((item) => item.trim()).filter(Boolean);
        if (!scopes.includes(normalizedClusterKey)) {
          return res.status(400).json({ success: false, message: 'Loại ticket này không áp dụng cho cụm đã chọn' });
        }
      }
    }

    const config = await prisma.guildConfig.findFirst();
    const openLimit = getOpenTicketLimit(option?.maxOpenPerUser);
    const cooldownSeconds = Math.max(0, Number(config?.ticketCooldownSeconds ?? 60));

    const creation = await prisma.$transaction(async (tx) => {
      // Serialize creation per creator across processes/instances.
      await tx.ticketCreationLock.upsert({
        where: { creatorId },
        create: { creatorId },
        update: { touchedAt: new Date() },
      });

      // Idempotency cho bot retry, kể cả khi timeout xảy ra trước lúc tạo Discord channel.
      if (creationKey) {
        const duplicate = await tx.ticket.findUnique({ where: { creationKey }, include: TICKET_INCLUDE });
        if (duplicate) return { ticket: duplicate, reused: true };
      }
      if (channelId) {
        const duplicate = await tx.ticket.findFirst({ where: { channelId }, include: TICKET_INCLUDE });
        if (duplicate) return { ticket: duplicate, reused: true };
      }

      if (openLimit > 0) {
        const openCount = await tx.ticket.count({
          where: { creatorId, status: { in: ['creating', 'open', 'claimed'] } },
        });
        if (openCount >= openLimit) {
          const error = new ValidationError(`Bạn đã có ${openCount} ticket đang mở (tối đa ${openLimit}). Đóng bớt trước khi tạo mới!`, 'TICKET_LIMIT');
          error.statusCode = 429;
          throw error;
        }
      }

      if (cooldownSeconds > 0) {
        const recent = await tx.ticketCreateLog.findFirst({
          where: { creatorId, createdAt: { gt: new Date(Date.now() - cooldownSeconds * 1000) } },
          orderBy: { createdAt: 'desc' },
        });
        if (recent) {
          const wait = Math.max(1, Math.ceil(cooldownSeconds - (Date.now() - recent.createdAt.getTime()) / 1000));
          const error = new ValidationError(`Vui lòng đợi ${wait}s trước khi tạo ticket mới.`, 'TICKET_COOLDOWN');
          error.statusCode = 429;
          throw error;
        }
      }

      // Khóa hàng counter toàn cục rồi tăng atomically. Lock theo creator ở trên
      // không đủ vì hai người khác nhau vẫn có thể tạo ticket đồng thời.
      const maxTicket = await tx.ticket.aggregate({ _max: { ticketNum: true } });
      const maxExisting = maxTicket._max.ticketNum || 0;
      const currentCounter = await tx.ticketCounter.upsert({
        where: { id: 'global' },
        create: { id: 'global', value: maxExisting },
        update: { value: { increment: 0 } },
      });
      if (currentCounter.value < maxExisting) {
        await tx.ticketCounter.update({ where: { id: 'global' }, data: { value: maxExisting } });
      }
      const counter = await tx.ticketCounter.update({
        where: { id: 'global' },
        data: { value: { increment: 1 } },
      });
      const ticketNum = counter.value;

      const created = await tx.ticket.create({
        data: {
          ticketNum,
          creationKey,
          optionId,
          type,
          clusterKey: normalizedClusterKey,
          creatorId,
          creatorName,
          creatorAvatar,
          channelId,
          priority,
          status: channelId ? 'open' : 'creating',
          formData: serializedFormData,
        },
        include: TICKET_INCLUDE,
      });
      await tx.ticketCreateLog.create({ data: { creatorId, optionId, clusterKey: normalizedClusterKey } });
      return { ticket: created, reused: false };
    }, { timeout: 15_000 });

    const { ticket, reused } = creation;
    if (!reused) applyAutoTagRules(ticket.id, formData).catch((error) => console.warn('[AUTO TAG]', error.message));
    if (!reused) await logAudit({
      action: 'ticket.create', actorId: creatorId, actorName: creatorName, actorKind: 'user', ticketId: ticket.id,
      metadata: {
        type, optionId, optionName: ticket.option ? `${ticket.option.emoji || ''} ${ticket.option.name}` : null,
        ticketNum: ticket.ticketNum, clusterKey: normalizedClusterKey,
      },
    });
    if (!reused) emit('ticket:created', ticket);
    res.status(reused ? 200 : 201).json({ success: true, data: ticket, reused });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
    console.error('[CREATE TICKET ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi tạo ticket' });
  }
};

// ─── PATCH /api/tickets/:id/channel ──────────────────────────────────────────

export const updateTicketChannel = async (req, res) => {
  try {
    const channelId = cleanDiscordId(req.body?.channelId, 'Channel ID');
    const result = await prisma.ticket.updateMany({
      where: { id: cleanId(req.params.id, 'Ticket ID'), status: 'creating', channelId: null },
      data: { channelId, status: 'open' },
    });
    if (result.count !== 1) return res.status(409).json({ success: false, message: 'Ticket không còn ở trạng thái tạo hoặc đã có channel' });
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: TICKET_INCLUDE });
    emit('ticket:updated', ticket);
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UPDATE CHANNEL]', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật channelId' });
  }
};

// ─── DELETE /api/tickets/:id/creation ─────────────────────────────────────────

export const cancelTicketCreation = async (req, res) => {
  try {
    const id = cleanId(req.params.id, 'Ticket ID');
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.json({ success: true });
    if (ticket.status !== 'creating' || ticket.channelId) {
      return res.status(409).json({ success: false, message: 'Ticket đã được mở, không thể rollback' });
    }
    const deleted = await prisma.ticket.deleteMany({ where: { id, status: 'creating', channelId: null } });
    if (deleted.count !== 1) return res.status(409).json({ success: false, message: 'Ticket vừa thay đổi, không thể rollback' });
    await prisma.ticketCreateLog.deleteMany({
      where: { creatorId: ticket.creatorId, optionId: ticket.optionId, createdAt: { gte: new Date(ticket.openedAt.getTime() - 5000) } },
    });
    await logAudit({
      action: 'ticket.creation_rollback', actorId: 'discord-bot', actorName: 'Discord Bot', actorKind: 'system',
      metadata: { ticketNum: ticket.ticketNum, reason: cleanString(req.body?.reason || '', { max: 500 }) },
    });
    emit('ticket:deleted', { id: ticket.id, ticketNum: ticket.ticketNum, reason: 'creation_failed', optionId: ticket.optionId });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[ROLLBACK TICKET CREATION]', err);
    res.status(500).json({ success: false, message: 'Lỗi rollback ticket' });
  }
};

// ─── PATCH /api/tickets/:id/note ──────────────────────────────────────────────

export const updateTicketNote = async (req, res) => {
  try {
    const note = req.body?.note === null || req.body?.note === '' ? null : cleanString(req.body?.note, { max: 5000 });
    const actor = actorFromRequest(req);
    const ticket = await prisma.ticket.update({ where: { id: req.ticket.id }, data: { note } });
    await logAudit({
      action: 'ticket.note', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: ticket.id, metadata: { length: note?.length || 0 },
    });
    emit('ticket:updated', { id: ticket.id, optionId: ticket.optionId, note });
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UPDATE NOTE ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật ghi chú' });
  }
};

// ─── PATCH /api/tickets/:id/priority ──────────────────────────────────────────

export const updateTicketPriority = async (req, res) => {
  try {
    const priority = cleanEnum(req.body?.priority, ['normal', 'high', 'urgent'], 'Priority');
    const actor = actorFromRequest(req);
    const before = req.ticket.priority;
    const ticket = await prisma.ticket.update({ where: { id: req.ticket.id }, data: { priority }, include: TICKET_INCLUDE });
    await logAudit({
      action: 'ticket.priority', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: ticket.id, metadata: { from: before, to: priority },
    });
    emit('ticket:updated', ticket);
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UPDATE PRIORITY ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật priority' });
  }
};

// ─── PATCH /api/tickets/:id/workflow ──────────────────────────────────────────

/**
 * Dashboard endpoint: chỉ cho phép thay đổi trạng thái workflow và pause AI.
 * Các field vận hành nội bộ (counter, message IDs, timestamps...) chỉ bot được
 * cập nhật qua endpoint by-channel có bot secret.
 */
export const updateTicketWorkflow = async (req, res) => {
  try {
    if (req.ticket.status === 'closed') {
      return res.status(409).json({ success: false, message: 'Ticket đã đóng' });
    }

    const data = {};
    if (req.body?.workflowStatus !== undefined) {
      data.workflowStatus = cleanEnum(
        String(req.body.workflowStatus),
        ['waiting_staff', 'waiting_user', 'ai_assisting', 'resolved'],
        'Workflow status',
      );
    }
    if (req.body?.aiPaused !== undefined) data.aiPaused = cleanBoolean(req.body.aiPaused);
    if (!Object.keys(data).length) throw new ValidationError('Không có trường workflow hợp lệ để cập nhật');

    const actor = actorFromRequest(req);
    const ticket = await prisma.ticket.update({
      where: { id: req.ticket.id },
      data,
      include: TICKET_INCLUDE,
    });
    await logAudit({
      action: 'ticket.workflow',
      actorId: actor.discordId,
      actorName: actor.username,
      actorKind: actor.kind,
      ticketId: ticket.id,
      metadata: {
        fields: Object.keys(data),
        from: { workflowStatus: req.ticket.workflowStatus, aiPaused: req.ticket.aiPaused },
        to: { workflowStatus: ticket.workflowStatus, aiPaused: ticket.aiPaused },
      },
    });
    emit('ticket:updated', ticket);
    return res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UPDATE DASHBOARD WORKFLOW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật workflow ticket' });
  }
};

// ─── PATCH /api/tickets/:id/claim ─────────────────────────────────────────────

export const claimTicket = async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const result = await claimTicketRecord({ selector: { id: cleanId(req.params.id, 'Ticket ID') }, actor, user: req.user });
    if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: `Không thể claim ticket ở trạng thái ${result.currentStatus}` });
    if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được người khác claim' });
    await logAudit({ action: 'ticket.claim', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, ticketId: result.ticket.id });
    emit('ticket:claimed', result.ticket);
    emit('ticket:updated', result.ticket);
    res.json({ success: true, data: result.ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[CLAIM ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi claim ticket' });
  }
};

// ─── PATCH /api/tickets/:id/close ─────────────────────────────────────────────

export const closeTicket = async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const result = await closeTicketRecord({
      selector: { id: cleanId(req.params.id, 'Ticket ID') }, actor, user: req.user,
      reason: req.body?.reason, closeType: req.body?.closeType,
    });
    if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: 'Ticket đã đóng' });
    if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được đóng bởi request khác' });
    await logAudit({
      action: 'ticket.close', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: result.ticket.id, metadata: { reason: result.reason, closeType: result.closeType },
    });
    if (result.reason && req.authKind !== 'bot') {
      sendResolutionAndRating(result.ticket, { reason: result.reason, staffName: result.ticket.claimerName || actor.username })
        .catch((error) => console.warn('[CLOSE DM WARN]', error.message));
    }
    emit('ticket:closed', result.ticket);
    emit('ticket:updated', result.ticket);
    res.json({ success: true, data: result.ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[CLOSE ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi đóng ticket' });
  }
};

// ─── POST /api/tickets/:id/reply ──────────────────────────────────────────────

/**
 * Staff gửi reply từ web vào ticket channel
 * Body: { content }
 */
export const replyTicket = async (req, res) => {
  try {
    const content = cleanString(req.body?.content, { min: 1, max: 20_000, allowEmpty: false });
    const ticket = req.ticket;
    if (!ticket.channelId) return res.status(400).json({ success: false, message: 'Ticket không có channel Discord' });
    if (ticket.status === 'closed') return res.status(409).json({ success: false, message: 'Ticket đã đóng' });

    const rendered = content
      .replaceAll('{user}', `<@${ticket.creatorId}>`)
      .replaceAll('{ticketNum}', String(ticket.ticketNum).padStart(4, '0'))
      .replaceAll('{staff}', req.user.username);
    const prefix = `**${req.user.username.replace(/[\r\n]/g, ' ')}** (Staff):\n`;
    const chunks = splitDiscordMessage(rendered, { prefix });
    const persistedMessages = [];
    let sendError = null;

    // Discord is external and cannot participate in a DB transaction. Persist
    // every successfully sent chunk immediately so a later chunk failure never
    // creates an invisible message or a wrong messageCount.
    for (let index = 0; index < chunks.length; index += 1) {
      try {
        const sent = await sendChannelMessage(ticket.channelId, {
          content: chunks[index],
          allowedMentions: { parse: ['users'] },
        });
        const row = {
          ticketId: ticket.id,
          discordMessageId: String(sent.id),
          authorId: req.user.discordId,
          authorName: req.user.username,
          authorAvatar: req.user.avatar || null,
          isBot: false,
          isInternal: false,
          content: chunks[index].startsWith(prefix) ? chunks[index].slice(prefix.length) : chunks[index],
          attachments: '[]',
          timestamp: sent.timestamp ? new Date(sent.timestamp) : new Date(),
        };
        const persisted = await persistTicketMessage(row, {
          actorType: MessageActorType.STAFF,
          canonicalizeDuplicate: true,
        });
        if (persisted.message) persistedMessages.push(persisted.message);
      } catch (error) {
        sendError = error;
        break;
      }
    }

    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: {
        id: true, optionId: true, lastMessageAt: true, lastStaffMessageAt: true,
        firstResponseAt: true, workflowStatus: true, messageCount: true,
      },
    });
    for (const message of persistedMessages) {
      emit(`ticket:${ticket.id}:message`, { ...message, optionId: ticket.optionId, attachments: [] });
    }
    if (updatedTicket) emit('ticket:updated', updatedTicket);

    const sentCount = persistedMessages.length;
    await logAudit({
      action: sendError ? 'ticket.reply_partial' : 'ticket.reply',
      actorId: req.user.discordId,
      actorName: req.user.username,
      actorKind: 'user',
      ticketId: ticket.id,
      metadata: {
        length: rendered.length,
        requestedChunks: chunks.length,
        sentChunks: sentCount,
        ...(sendError ? { error: String(sendError.message || 'Discord send failed').slice(0, 300) } : {}),
      },
    });

    if (sendError) {
      console.error('[REPLY PARTIAL ERROR]', sendError);
      return res.status(502).json({
        success: false,
        message: sentCount
          ? `Discord chỉ nhận ${sentCount}/${chunks.length} phần; các phần đã gửi vẫn được lưu`
          : 'Không gửi được reply tới Discord',
        code: sentCount ? 'PARTIAL_DISCORD_SEND' : 'DISCORD_SEND_FAILED',
        data: { sent: sentCount, requested: chunks.length },
        requestId: req.requestId,
      });
    }

    return res.json({ success: true, data: { sent: sentCount } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[REPLY ERROR]', err);
    return res.status(502).json({ success: false, message: 'Không gửi được reply tới Discord', requestId: req.requestId });
  }
};

// ─── GET /api/tickets/history ─────────────────────────────────────────────────

/**
 * Lịch sử ticket với smart filter. Hỗ trợ tìm trong formData + content.
 * Query: creatorId, optionId, status, priority, keyword (search formData + content + tags), limit
 */
export const getTicketHistory = async (req, res) => {
  try {
    const { creatorId, optionId, status, priority, clusterKey, keyword, limit = '50' } = req.query;
    const where = {};
    if (creatorId) where.creatorId = cleanDiscordId(creatorId);
    if (optionId) where.optionId = cleanId(optionId, 'Option ID');
    if (status) where.status = cleanEnum(String(status), ['creating', 'open', 'claimed', 'closed', 'creation_failed'], 'Status');
    if (priority) where.priority = cleanEnum(String(priority), ['normal', 'high', 'urgent'], 'Priority');
    if (clusterKey) where.clusterKey = cleanString(clusterKey, { max: 80 });
    if (keyword) {
      const term = cleanString(keyword, { max: 200 });
      where.OR = [
        { tags: { contains: term } },
        { formData: { contains: term } },
        ...(canViewInternal(req.user) ? [{ note: { contains: term } }] : []),
        { closeReason: { contains: term } },
        { messages: { some: { content: { contains: term }, ...(canViewInternal(req.user) ? {} : { isInternal: false }) } } },
      ];
    }
    const scopedWhere = mergeWhereWithTicketScope(where, req.user);
    const items = await prisma.ticket.findMany({
      where: scopedWhere,
      orderBy: { openedAt: 'desc' },
      take: cleanInteger(limit, { min: 1, max: 200, fallback: 50 }),
      include: { option: { select: { id: true, name: true, emoji: true, color: true } }, _count: { select: { messages: true } } },
    });
    const visibleItems = canViewInternal(req.user) ? items : items.map(({ note: _note, aiSummary: _summary, ...item }) => item);
    const byOption = {};
    const byStatus = { creating: 0, open: 0, claimed: 0, closed: 0, creation_failed: 0 };
    for (const ticket of visibleItems) {
      const key = ticket.option?.name || 'Không rõ';
      byOption[key] = (byOption[key] || 0) + 1;
      byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;
    }
    res.json({ success: true, data: { items: visibleItems, total: visibleItems.length, stats: { byOption, byStatus } } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[HISTORY ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy lịch sử' });
  }
};

// ─── POST /api/tickets/:id/send-to-channel ───────────────────────────────────

/**
 * Bot gọi: gửi ticket summary + transcript .md vào Discord channel
 * Body: { channelId, includeTranscript = true }
 */
export const sendTicketToChannel = async (req, res) => {
  try {
    const channelId = cleanDiscordId(req.body?.channelId, 'Channel ID');
    const includeTranscript = cleanBoolean(req.body?.includeTranscript, true);
    const requestedInternal = cleanBoolean(req.body?.includeInternal, false);
    if (requestedInternal && !hasPermission(req.user, 'ticket.exportInternal')) {
      return res.status(403).json({ success: false, message: 'Không có quyền export dữ liệu nội bộ' });
    }

    const config = await prisma.guildConfig.findFirst({ select: { logChannelId: true } });
    const allowed = new Set([
      config?.logChannelId,
      ...String(process.env.TRANSCRIPT_CHANNEL_ALLOWLIST || '').split(','),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    if (!allowed.has(channelId)) {
      return res.status(403).json({ success: false, message: 'Channel đích không nằm trong allowlist transcript', code: 'CHANNEL_NOT_ALLOWED' });
    }

    const ticket = await findAccessibleTicket({
      id: cleanId(req.params.id, 'Ticket ID'), user: req.user,
      include: {
        option: true,
        messages: { where: requestedInternal ? {} : { isInternal: false }, orderBy: { timestamp: 'asc' } },
      },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });

    const num = String(ticket.ticketNum).padStart(4, '0');
    const fields = [
      { name: '👤 Người tạo', value: `<@${ticket.creatorId}>`, inline: true },
      { name: '📋 Loại', value: cleanString(ticket.option ? `${ticket.option.emoji || ''} ${ticket.option.name}` : '—', { max: 1024 }), inline: true },
      { name: '🛡️ Trạng thái', value: cleanString(ticket.status, { max: 100 }), inline: true },
      { name: '📅 Mở lúc', value: `<t:${Math.floor(new Date(ticket.openedAt).getTime() / 1000)}:F>`, inline: true },
    ];
    if (ticket.claimerName) fields.push({ name: '👮 Staff', value: cleanString(ticket.claimerName, { max: 1024 }), inline: true });
    if (ticket.closedAt) fields.push({ name: '🔒 Đóng', value: `<t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`, inline: true });
    if (ticket.priority !== 'normal') fields.push({ name: '⚡ Priority', value: ticket.priority, inline: true });
    if (ticket.tags) fields.push({ name: '🏷️ Tags', value: cleanString(ticket.tags, { max: 1024 }), inline: false });
    if (ticket.formData && ticket.formData !== '{}') {
      try {
        const data = Object.values(JSON.parse(ticket.formData));
        for (const field of data.slice(0, 5)) {
          fields.push({
            name: `📝 ${cleanString(field?.label || 'Trường', { max: 250 })}`,
            value: cleanString(field?.value || '—', { max: 1024 }), inline: false,
          });
        }
      } catch { /* legacy malformed data */ }
    }
    fields.push({ name: '💬 Messages', value: String(ticket.messages.length), inline: true });
    const actor = actorFromRequest(req);
    const embed = {
      color: parseColorToInt(ticket.option?.color || '#9d7bff'),
      title: `🎫 Ticket #${num}`,
      description: 'Tổng quan ticket cho staff tham khảo',
      fields: fields.slice(0, 25),
      footer: { text: `Sender: ${actor.username.slice(0, 100)} · ID: ${ticket.id}` },
      timestamp: new Date().toISOString(),
    };
    const body = { embeds: [embed], allowed_mentions: { parse: [] } };
    if (includeTranscript) {
      const md = renderTicketMarkdown(ticket, { includeInternal: requestedInternal });
      await sendChannelMessageWithFile(channelId, body, { name: `ticket-${num}.md`, content: Buffer.from(md, 'utf8') });
    } else {
      await sendChannelMessage(channelId, { embeds: [embed], allowedMentions: { parse: [] } });
    }
    await logAudit({
      action: 'ticket.send-to-channel', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: ticket.id, metadata: { channelId, includeTranscript, includeInternal: requestedInternal },
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[SEND TO CHANNEL ERROR]', err);
    res.status(502).json({ success: false, message: 'Không gửi được ticket tới Discord', requestId: req.requestId });
  }
};

function parseColorToInt(hex) {
  return parseInt(String(hex).replace('#', ''), 16) || 0x9d7bff;
}

async function sendChannelMessageWithFile(channelId, payload, file) {
  const { sendChannelMessageMultipart } = await import('../../lib/discord.js');
  return sendChannelMessageMultipart(channelId, payload, file);
}

// ─── GET /api/tickets/:id/transcript.md ──────────────────────────────────────

/**
 * Export ticket transcript dạng Markdown để staff download
 */
export const downloadTranscript = async (req, res) => {
  try {
    const includeInternal = req.query.includeInternal === 'true';
    if (includeInternal && !hasPermission(req.user, 'ticket.exportInternal')) {
      return res.status(403).json({ success: false, message: 'Không có quyền export dữ liệu nội bộ' });
    }
    const ticket = await findAccessibleTicket({
      id: cleanId(req.params.id, 'Ticket ID'), user: req.user,
      include: {
        option: true,
        messages: { where: includeInternal ? {} : { isInternal: false }, orderBy: { timestamp: 'asc' } },
      },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    const num = String(ticket.ticketNum).padStart(4, '0');
    const md = renderTicketMarkdown(ticket, { includeInternal });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${num}.md"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(md);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[DOWNLOAD TRANSCRIPT ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi export transcript' });
  }
};

// ─── PATCH /api/tickets/:id/tags ──────────────────────────────────────────────

export const updateTicketTags = async (req, res) => {
  try {
    const tags = cleanStringArray(req.body?.tags || [], { maxItems: 30, maxLength: 40 });
    const csv = tags.join(',');
    const actor = actorFromRequest(req);
    const ticket = await prisma.ticket.update({ where: { id: req.ticket.id }, data: { tags: csv }, include: TICKET_INCLUDE });
    await logAudit({
      action: 'ticket.tags', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: ticket.id, metadata: { tags },
    });
    emit('ticket:updated', ticket);
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[TAGS ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật tags' });
  }
};

// ─── POST /api/tickets/bulk ───────────────────────────────────────────────────

/**
 * Body: { ids: [], action: 'close'|'priority'|'tag-add'|'tag-remove', value? }
 */
export const bulkUpdate = async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((id) => cleanId(id, 'Ticket ID')))];
    if (ids.length === 0) throw new ValidationError('Danh sách ticket trống');
    if (ids.length > 100) throw new ValidationError('Tối đa 100 ticket mỗi lần');
    const action = cleanEnum(req.body?.action, ['close', 'priority', 'tag-add', 'tag-remove'], 'Action');
    const scopedWhere = mergeWhereWithTicketScope({ id: { in: ids } }, req.user);
    const accessible = await prisma.ticket.findMany({ where: scopedWhere, select: { id: true, status: true, tags: true } });
    if (accessible.length !== ids.length) {
      return res.status(404).json({ success: false, message: 'Một hoặc nhiều ticket không tồn tại hoặc nằm ngoài phạm vi quyền' });
    }

    const actor = actorFromRequest(req);
    let changed = 0;
    if (action === 'close') {
      const reason = req.body?.reason ? cleanString(req.body.reason, { max: 1800 }) : null;
      for (const row of accessible) {
        const result = await closeTicketRecord({
          selector: { id: row.id }, actor, user: req.user, reason, closeType: 'bulk',
        });
        if (result.status !== 'ok') continue;
        changed += 1;
        await logAudit({
          action: 'ticket.close', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
          ticketId: result.ticket.id, metadata: { reason: result.reason, closeType: 'bulk' },
        });
        emit('ticket:closed', result.ticket);
        emit('ticket:updated', result.ticket);
      }
    } else if (action === 'priority') {
      const priority = cleanEnum(req.body?.value, ['normal', 'high', 'urgent'], 'Priority');
      const result = await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { priority } });
      changed = result.count;
    } else {
      const tag = cleanString(req.body?.value, { min: 1, max: 40, allowEmpty: false });
      await prisma.$transaction(async (tx) => {
        for (const ticket of accessible) {
          const tags = new Set(cleanStringArray(ticket.tags, { maxItems: 30, maxLength: 40 }));
          const before = [...tags].join(',');
          if (action === 'tag-add') tags.add(tag); else tags.delete(tag);
          if (tags.size > 30) throw new ValidationError('Ticket có quá nhiều tags');
          const after = [...tags].join(',');
          if (after !== before) {
            await tx.ticket.update({ where: { id: ticket.id }, data: { tags: after } });
            changed += 1;
          }
        }
      });
    }

    await logAudit({
      action: `ticket.bulk.${action}`, actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      metadata: { ids, value: req.body?.value ?? null, count: changed },
    });
    if (action !== 'close') {
      const updated = await prisma.ticket.findMany({ where: { id: { in: ids } }, include: TICKET_INCLUDE });
      for (const ticket of updated) emit('ticket:updated', ticket);
    }
    res.json({ success: true, data: { updated: changed } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[BULK ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi bulk update' });
  }
};

// ─── POST /api/tickets/:id/watch ──────────────────────────────────────────────

export async function watchTicket(req, res) {
  try {
    const actor = actorFromRequest(req);
    const discordId = req.authKind === 'bot' && req.body?.discordId
      ? cleanDiscordId(req.body.discordId)
      : actor.discordId;
    const watchers = new Set(cleanStringArray(req.ticket.watchers, { maxItems: 100, maxLength: 32 }));
    watchers.add(discordId);
    if (watchers.size > 100) throw new ValidationError('Ticket đã đạt giới hạn 100 watcher');
    await prisma.ticket.update({ where: { id: req.ticket.id }, data: { watchers: [...watchers].join(',') } });
    await logAudit({ action: 'ticket.watch', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, ticketId: req.ticket.id, metadata: { discordId } });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[WATCH ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi watch ticket' });
  }
}

export async function unwatchTicket(req, res) {
  try {
    const actor = actorFromRequest(req);
    const discordId = req.authKind === 'bot' && req.body?.discordId
      ? cleanDiscordId(req.body.discordId)
      : actor.discordId;
    const watchers = new Set(cleanStringArray(req.ticket.watchers, { maxItems: 100, maxLength: 32 }));
    watchers.delete(discordId);
    await prisma.ticket.update({ where: { id: req.ticket.id }, data: { watchers: [...watchers].join(',') } });
    await logAudit({ action: 'ticket.unwatch', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, ticketId: req.ticket.id, metadata: { discordId } });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UNWATCH ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi unwatch ticket' });
  }
}

// ─── PATCH /api/tickets/by-channel/:channelId/claim ──────────────────────────

export async function claimByChannel(req, res) {
  try {
    const actor = actorFromRequest(req);
    const result = await claimTicketRecord({
      selector: { channelId: cleanDiscordId(req.params.channelId, 'Channel ID') }, actor, user: req.user,
    });
    if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: `Không thể claim ticket ở trạng thái ${result.currentStatus}` });
    if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được người khác claim' });
    await logAudit({ action: 'ticket.claim', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, ticketId: result.ticket.id });
    emit('ticket:claimed', result.ticket);
    emit('ticket:updated', result.ticket);
    res.json({ success: true, data: result.ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[CLAIM BY CHANNEL ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi claim ticket' });
  }
}

// ─── PATCH /api/tickets/by-channel/:channelId/workflow ───────────────────────

export async function updateTicketWorkflowByChannel(req, res) {
  try {
    const channelId = cleanDiscordId(req.params.channelId, 'Channel ID');
    const existing = await prisma.ticket.findFirst({ where: mergeWhereWithTicketScope({ channelId }, req.user) });
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });

    const data = {};
    const body = req.body || {};
    if (body.workflowStatus !== undefined) data.workflowStatus = cleanEnum(String(body.workflowStatus), ['waiting_staff', 'waiting_user', 'ai_assisting', 'resolved'], 'Workflow status');
    if (body.panelMessageId !== undefined) data.panelMessageId = body.panelMessageId ? cleanDiscordId(body.panelMessageId, 'Panel message ID') : null;
    if (body.aiPanelMessageId !== undefined) data.aiPanelMessageId = body.aiPanelMessageId ? cleanDiscordId(body.aiPanelMessageId, 'AI panel message ID') : null;
    if (body.aiPaused !== undefined) data.aiPaused = cleanBoolean(body.aiPaused);
    if (body.aiReplyCount !== undefined) data.aiReplyCount = cleanInteger(body.aiReplyCount, { min: 0, max: 1000 });
    if (cleanBoolean(body.incrementAiReplyCount, false)) data.aiReplyCount = { increment: 1 };
    if (body.aiLastIntent !== undefined) data.aiLastIntent = body.aiLastIntent ? cleanString(body.aiLastIntent, { max: 80 }) : null;
    if (body.aiLastReplyAt !== undefined) data.aiLastReplyAt = body.aiLastReplyAt ? cleanDate(body.aiLastReplyAt, 'aiLastReplyAt') : null;
    if (body.aiSummary !== undefined) data.aiSummary = body.aiSummary ? cleanString(body.aiSummary, { max: 1800 }) : null;
    if (body.aiTriage !== undefined) {
      const triage = typeof body.aiTriage === 'string' ? parseJsonObject(body.aiTriage, {}) : parseJsonObject(body.aiTriage || {}, {});
      const serialized = JSON.stringify(triage);
      if (Buffer.byteLength(serialized, 'utf8') > 12 * 1024) throw new ValidationError('AI triage payload quá lớn');
      data.aiTriage = serialized;
    }
    if (body.aiTriageConfidence !== undefined) {
      const value = Number(body.aiTriageConfidence);
      if (!Number.isFinite(value)) throw new ValidationError('AI triage confidence không hợp lệ');
      data.aiTriageConfidence = Math.max(0, Math.min(1, value));
    }
    if (body.aiEvidenceScore !== undefined) {
      const value = Number(body.aiEvidenceScore);
      if (!Number.isFinite(value)) throw new ValidationError('AI evidence score không hợp lệ');
      data.aiEvidenceScore = Math.max(0, Math.min(1, value));
    }
    if (body.aiNeedsHuman !== undefined) data.aiNeedsHuman = cleanBoolean(body.aiNeedsHuman);
    if (body.aiMissingInfo !== undefined) {
      const list = cleanStringArray(body.aiMissingInfo, { maxItems: 8, maxLength: 180, field: 'AI missing info' });
      data.aiMissingInfo = JSON.stringify(list);
    }
    if (body.aiLastTriageAt !== undefined) data.aiLastTriageAt = body.aiLastTriageAt ? cleanDate(body.aiLastTriageAt, 'aiLastTriageAt') : null;
    if (body.tags !== undefined) data.tags = cleanStringArray(body.tags, { maxItems: 20, maxLength: 40, field: 'Tags' }).join(',');
    if (body.lastUserMessageAt !== undefined) data.lastUserMessageAt = body.lastUserMessageAt ? cleanDate(body.lastUserMessageAt, 'lastUserMessageAt') : null;
    if (body.lastStaffMessageAt !== undefined) data.lastStaffMessageAt = body.lastStaffMessageAt ? cleanDate(body.lastStaffMessageAt, 'lastStaffMessageAt') : null;
    if (body.lastEscalatedAt !== undefined) data.lastEscalatedAt = body.lastEscalatedAt ? cleanDate(body.lastEscalatedAt, 'lastEscalatedAt') : null;
    if (body.priority !== undefined) data.priority = cleanEnum(String(body.priority), ['normal', 'high', 'urgent'], 'Priority');
    if (body.clusterKey !== undefined) {
      if (!body.clusterKey) data.clusterKey = null;
      else {
        const key = cleanString(body.clusterKey, { max: 80 });
        const cluster = await prisma.cluster.findUnique({ where: { key } });
        if (!cluster?.isActive) return res.status(400).json({ success: false, message: 'Cụm máy chủ không hợp lệ' });
        data.clusterKey = cluster.key;
      }
    }
    if (!Object.keys(data).length) return res.json({ success: true, data: existing });

    const actor = actorFromRequest(req);
    const ticket = await prisma.ticket.update({ where: { id: existing.id }, data, include: TICKET_INCLUDE });
    await logAudit({
      action: 'ticket.workflow', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: ticket.id, metadata: { fields: Object.keys(data), workflowStatus: ticket.workflowStatus, aiPaused: ticket.aiPaused },
    });
    emit('ticket:updated', ticket);
    res.json({ success: true, data: ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[UPDATE TICKET WORKFLOW ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật workflow ticket' });
  }
}

// ─── PATCH /api/tickets/:id/assign and /by-channel/:channelId/assign ────────

async function resolveAssignee(body) {
  const discordId = cleanDiscordId(body?.discordId, 'Assignee Discord ID');
  const staff = await prisma.staff.findUnique({ where: { discordId } });
  if (!staff) throw new ValidationError('Người được giao chưa có trong danh sách staff');
  return { discordId: staff.discordId, username: staff.username };
}

async function assignTicketBySelector(req, res, selector) {
  const actor = actorFromRequest(req);
  const assignee = await resolveAssignee(req.body);
  const result = await assignTicketRecord({ selector, actor, assignee, user: req.user });
  if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
  if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: `Không thể giao ticket ở trạng thái ${result.currentStatus}` });
  if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được cập nhật bởi request khác' });
  await logAudit({
    action: 'ticket.assign', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
    ticketId: result.ticket.id,
    metadata: { from: result.previous.discordId, to: assignee.discordId, toName: assignee.username },
  });
  emit('ticket:claimed', result.ticket);
  emit('ticket:updated', result.ticket);
  return res.json({ success: true, data: result.ticket });
}

export async function assignTicket(req, res) {
  try { return await assignTicketBySelector(req, res, { id: cleanId(req.params.id, 'Ticket ID') }); }
  catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[ASSIGN TICKET ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi giao ticket' });
  }
}

export async function assignByChannel(req, res) {
  try { return await assignTicketBySelector(req, res, { channelId: cleanDiscordId(req.params.channelId, 'Channel ID') }); }
  catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[ASSIGN BY CHANNEL ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi giao ticket' });
  }
}

// ─── PATCH /api/tickets/by-channel/:channelId/close ──────────────────────────

export async function closeByChannel(req, res) {
  try {
    const actor = actorFromRequest(req);
    const result = await closeTicketRecord({
      selector: { channelId: cleanDiscordId(req.params.channelId, 'Channel ID') }, actor, user: req.user,
      reason: req.body?.reason, closeType: req.body?.closeType,
    });
    if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: 'Ticket đã đóng' });
    if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được đóng bởi request khác' });
    await logAudit({
      action: 'ticket.close', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      ticketId: result.ticket.id, metadata: { reason: result.reason, closeType: result.closeType },
    });
    emit('ticket:closed', result.ticket);
    emit('ticket:updated', result.ticket);
    res.json({ success: true, data: result.ticket });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[CLOSE BY CHANNEL ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi đóng ticket' });
  }
}


// ─── Ticket move / routing history (v7.3.1) ───────────────────────────────

async function handleMoveResult(req, res, result) {
  if (result.status === 'not_found') return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
  if (result.status === 'target_not_found') return res.status(404).json({ success: false, message: 'Mục đích không tồn tại hoặc đang tắt', code: 'MOVE_TARGET_NOT_FOUND' });
  if (result.status === 'same_option') return res.status(409).json({ success: false, message: 'Ticket đã nằm trong mục này', code: 'MOVE_SAME_OPTION' });
  if (result.status === 'invalid_state') return res.status(409).json({ success: false, message: `Không thể move ticket ở trạng thái ${result.currentStatus}`, code: 'MOVE_INVALID_STATE' });
  if (result.status === 'cluster_mismatch') return res.status(409).json({ success: false, message: `Mục đích không hỗ trợ cụm ${result.clusterKey}`, code: 'MOVE_CLUSTER_MISMATCH' });
  if (result.status !== 'ok') return res.status(409).json({ success: false, message: 'Ticket vừa được chuyển bởi thao tác khác, hãy thử lại', code: 'MOVE_CONFLICT' });

  const actor = actorFromRequest(req);
  await logAudit({
    action: 'ticket.move', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, ticketId: result.ticket.id,
    metadata: {
      fromOptionId: result.move.fromOptionId, fromOptionName: result.move.fromOptionName,
      toOptionId: result.move.toOptionId, toOptionName: result.move.toOptionName,
      fromCategoryId: result.move.fromCategoryId, toCategoryId: result.move.toCategoryId,
      reason: result.move.reason, source: result.move.source, moveId: result.move.id,
    },
  });
  emit('ticket:moved', { ticketId: result.ticket.id, optionId: result.ticket.optionId, ticket: result.ticket, move: result.move });
  emit('ticket:updated', result.ticket);
  return res.json({ success: true, data: { ticket: result.ticket, move: result.move } });
}

export async function moveByChannel(req, res) {
  try {
    const actor = actorFromRequest(req);
    const targetOptionId = cleanId(req.body?.targetOptionId, 'Target option ID');
    const reason = req.body?.reason ? cleanString(req.body.reason, { max: 500 }) : null;
    const fromCategoryId = req.body?.fromCategoryId ? cleanDiscordId(req.body.fromCategoryId, 'From category ID') : null;
    const toCategoryId = req.body?.toCategoryId ? cleanDiscordId(req.body.toCategoryId, 'To category ID') : null;
    const result = await moveTicketRecord({
      selector: { channelId: cleanDiscordId(req.params.channelId, 'Channel ID') },
      actor, user: req.user, targetOptionId, reason, source: 'discord', fromCategoryId, toCategoryId,
    });
    return handleMoveResult(req, res, result);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[MOVE BY CHANNEL ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi chuyển mục ticket' });
  }
}

export async function getTicketMoves(req, res) {
  try {
    const ticketId = cleanId(req.params.id, 'Ticket ID');
    const accessible = await findAccessibleTicket({ id: ticketId, user: req.user });
    if (!accessible) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    const moves = await prisma.ticketMove.findMany({
      where: { ticketId }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    return res.json({ success: true, data: moves });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[GET TICKET MOVES ERROR]', err);
    return res.status(500).json({ success: false, message: 'Lỗi tải lịch sử chuyển mục' });
  }
}

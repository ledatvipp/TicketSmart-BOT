// Message persistence cho ticket. Input Discord được coi là untrusted data.
import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { MessageActorType, persistTicketMessage } from '../../services/messageService.js';
import { canViewInternal, findAccessibleTicket } from '../security/policy.js';
import {
  cleanBoolean, cleanDate, cleanDiscordId, cleanHttpUrl, cleanId, cleanInteger, cleanString,
  ValidationError,
} from '../security/validation.js';

function sanitizeAttachments(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  if (list.length > 20) throw new ValidationError('Tối đa 20 attachment mỗi message');
  return list.map((item) => {
    const source = item && typeof item === 'object' ? item : {};
    const clean = {
      kind: cleanString(source.kind || 'attachment', { max: 30 }),
      name: cleanString(source.name || source.title || 'attachment', { max: 255 }),
      contentType: source.contentType ? cleanString(source.contentType, { max: 100 }) : null,
    };
    for (const key of ['url', 'image', 'thumbnail']) {
      if (source[key]) clean[key] = cleanHttpUrl(source[key], { allowHttp: false, nullable: true });
    }
    for (const key of ['title', 'description', 'author', 'provider', 'footer']) {
      if (source[key]) clean[key] = cleanString(source[key], { max: key === 'description' ? 2000 : 256 });
    }
    if (Number.isInteger(source.index)) clean.index = source.index;
    if (Number.isInteger(source.color)) clean.color = source.color;
    return clean;
  });
}

function normalizeIncomingMessage(message, ticketId) {
  const timestamp = message.timestamp ? cleanDate(message.timestamp, 'Message timestamp') : new Date();
  const maxFuture = Date.now() + 5 * 60_000;
  if (timestamp.getTime() > maxFuture) throw new ValidationError('Message timestamp nằm quá xa trong tương lai');
  return {
    ticketId,
    discordMessageId: cleanDiscordId(message.discordMessageId, 'Message ID'),
    authorId: cleanDiscordId(message.authorId, 'Author ID'),
    authorName: cleanString(message.authorName || 'Unknown', { min: 1, max: 100, allowEmpty: false }),
    authorAvatar: cleanHttpUrl(message.authorAvatar, { nullable: true }),
    isBot: cleanBoolean(message.isBot, false),
    isInternal: cleanBoolean(message.isInternal, false),
    content: cleanString(message.content || '', { max: 20_000, trim: false }),
    attachments: JSON.stringify(sanitizeAttachments(message.attachments || [])),
    timestamp,
  };
}

/** POST /api/messages — bot append một hoặc nhiều Discord message. */
export async function appendMessages(req, res) {
  try {
    const channelId = cleanDiscordId(req.body?.channelId, 'Channel ID');
    const ticket = await prisma.ticket.findFirst({ where: { channelId } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    if (ticket.status === 'closed') return res.status(409).json({ success: false, message: 'Ticket đã đóng' });

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [req.body];
    if (rawMessages.length > 100) throw new ValidationError('Tối đa 100 message mỗi request');
    const normalized = rawMessages.filter(Boolean).map((message) => normalizeIncomingMessage(message, ticket.id));
    if (normalized.length === 0) return res.json({ success: true, data: { inserted: 0 } });

    const humanAuthorIds = [...new Set(normalized
      .filter((message) => !message.isBot && !message.isInternal)
      .map((message) => message.authorId))];
    const staffRows = humanAuthorIds.length
      ? await prisma.staff.findMany({ where: { discordId: { in: humanAuthorIds } }, select: { discordId: true } })
      : [];
    const staffIds = new Set(staffRows.map((staff) => staff.discordId));
    if (ticket.claimerId) staffIds.add(ticket.claimerId);

    const actorTypeFor = (message) => {
      if (message.isInternal) return MessageActorType.INTERNAL;
      if (message.isBot) return MessageActorType.BOT;
      if (message.authorId === ticket.creatorId) return MessageActorType.USER;
      if (staffIds.has(message.authorId)) return MessageActorType.STAFF;
      return MessageActorType.OTHER;
    };

    const inserted = [];
    for (const data of [...normalized].sort((a, b) => a.timestamp - b.timestamp)) {
      const result = await persistTicketMessage(data, { actorType: actorTypeFor(data) });
      if (result.inserted && result.message) inserted.push(result.message);
    }
    if (inserted.length === 0) return res.json({ success: true, data: { inserted: 0 } });

    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { optionId: true, lastMessageAt: true, firstResponseAt: true, workflowStatus: true, messageCount: true },
    });
    for (const message of inserted) {
      emit(`ticket:${ticket.id}:message`, { ...message, optionId: ticket.optionId, attachments: safeParseJson(message.attachments) });
    }
    emit('ticket:updated', { id: ticket.id, ...(updatedTicket || { optionId: ticket.optionId }) });
    res.json({ success: true, data: { inserted: inserted.length } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message, code: err.code });
    console.error('[APPEND MESSAGES ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu message' });
  }
}

/** GET /api/messages?ticketId=... — luôn áp object scope và internal visibility. */
export async function getMessages(req, res) {
  try {
    const ticketId = cleanId(req.query?.ticketId, 'Ticket ID');
    const ticket = await findAccessibleTicket({ id: ticketId, user: req.user });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    const includeInternal = req.query.includeInternal === 'true' && canViewInternal(req.user);
    const messages = await prisma.message.findMany({
      where: { ticketId, ...(includeInternal ? {} : { isInternal: false }) },
      orderBy: { timestamp: 'asc' },
      take: cleanInteger(req.query.limit, { min: 1, max: 2000, fallback: 500 }),
      skip: cleanInteger(req.query.offset, { min: 0, max: 1_000_000, fallback: 0 }),
    });
    res.json({ success: true, data: messages.map((message) => ({ ...message, attachments: safeParseJson(message.attachments) })) });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[GET MESSAGES ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy messages' });
  }
}

/** POST /api/messages/internal — ghi chú nội bộ có author/audit rõ ràng. */
export async function addInternalMessage(req, res) {
  try {
    const ticketId = cleanId(req.body?.ticketId, 'Ticket ID');
    const ticket = await findAccessibleTicket({ id: ticketId, user: req.user });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    const content = cleanString(req.body?.content, { min: 1, max: 5000, allowEmpty: false });
    const persisted = await persistTicketMessage({
      ticketId,
      authorId: req.user.discordId,
      authorName: req.user.username,
      authorAvatar: req.user.avatar || null,
      isBot: false,
      isInternal: true,
      content,
      attachments: '[]',
      timestamp: new Date(),
    }, { actorType: MessageActorType.INTERNAL });
    const message = persisted.message;
    await logAudit({
      action: 'ticket.internal_message', actorId: req.user.discordId, actorName: req.user.username,
      actorKind: 'user', ticketId, metadata: { length: content.length },
    });
    emit(`ticket:${ticketId}:message`, { ...message, optionId: ticket.optionId, attachments: [] });
    res.status(201).json({ success: true, data: { ...message, attachments: [] } });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ success: false, message: err.message });
    console.error('[INTERNAL MESSAGE ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu ghi chú nội bộ' });
  }
}

function safeParseJson(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

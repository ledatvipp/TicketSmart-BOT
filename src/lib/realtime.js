// Socket.IO realtime với cùng RBAC/object scope như REST.
import { Server } from 'socket.io';
import { prisma } from './db.js';
import { authenticateAccessToken } from '../api/middleware/auth.js';
import { canViewInternal, findAccessibleTicket, hasPermission, permissionsForStaff } from '../api/security/policy.js';

let io = null;

function joinPermissionRooms(socket) {
  socket.join('authenticated');
  socket.join(`staff:${socket.user.discordId}`);
  socket.join(`role:${socket.user.role}`);
  for (const permission of permissionsForStaff(socket.user)) {
    if (permission !== '*') socket.join(`perm:${permission}`);
  }
  if (hasPermission(socket.user, '*') || socket.user.allOptions) {
    socket.join('tickets:all');
  } else {
    for (const optionId of socket.user.allowedOptions || []) socket.join(`option:${optionId}`);
  }
}

export function attachSocket(httpServer, { corsOrigins = [] } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
    maxHttpBufferSize: 64 * 1024,
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing access token'));
      socket.user = await authenticateAccessToken(token);
      if (!hasPermission(socket.user, 'ticket.view')) return next(new Error('Forbidden'));
      next();
    } catch (error) {
      next(new Error(error?.name === 'TokenExpiredError' ? 'Token expired' : 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    joinPermissionRooms(socket);
    const subscribed = new Set();
    let windowStartedAt = Date.now();
    let subscribeCount = 0;

    socket.on('ticket:subscribe', async (rawTicketId, ack = () => {}) => {
      try {
        if (Date.now() - windowStartedAt >= 60_000) {
          windowStartedAt = Date.now();
          subscribeCount = 0;
        }
        subscribeCount += 1;
        if (subscribeCount > 60) return ack({ ok: false, code: 'RATE_LIMITED' });
        const ticketId = String(rawTicketId || '').trim();
        if (!/^[A-Za-z0-9_-]{5,128}$/.test(ticketId)) return ack({ ok: false, code: 'INVALID_ID' });
        if (subscribed.size >= 25 && !subscribed.has(ticketId)) return ack({ ok: false, code: 'ROOM_LIMIT' });

        const ticket = await findAccessibleTicket({ id: ticketId, user: socket.user });
        if (!ticket) return ack({ ok: false, code: 'NOT_FOUND' });
        await socket.join(`ticket:${ticketId}`);
        if (canViewInternal(socket.user)) await socket.join(`ticket:${ticketId}:internal`);
        subscribed.add(ticketId);
        ack({ ok: true });
      } catch {
        ack({ ok: false, code: 'SUBSCRIBE_FAILED' });
      }
    });

    socket.on('ticket:unsubscribe', async (rawTicketId, ack = () => {}) => {
      const ticketId = String(rawTicketId || '').trim();
      await socket.leave(`ticket:${ticketId}`);
      await socket.leave(`ticket:${ticketId}:internal`);
      subscribed.delete(ticketId);
      ack({ ok: true });
    });
  });

  console.log('✅ Socket.IO ready with RBAC rooms');
  return io;
}

async function resolveTicketRouting(ticketId, payload) {
  const optionId = payload?.optionId
    || payload?.option?.id
    || (await prisma.ticket.findUnique({ where: { id: ticketId }, select: { optionId: true } }).catch(() => null))?.optionId
    || null;
  return { ticketId, optionId };
}

function emitScopedTicketEvent(event, payload, { ticketId, optionId, internal = false }) {
  if (!io) return;
  if (ticketId) {
    const specificName = event.match(/^ticket:[^:]+:(.+)$/)?.[1] || event;
    io.to(internal ? `ticket:${ticketId}:internal` : `ticket:${ticketId}`).emit(specificName, payload);
  }
  if (internal) return;
  io.to('tickets:all').emit(event, payload);
  io.to(optionId ? `option:${optionId}` : 'option:none').emit(event, payload);
}

/**
 * API tương thích sync: tác vụ lookup routing chạy async và tự log lỗi.
 * Không còn broadcast toàn bộ ticket vào room dashboard global.
 */
export function emit(event, payload) {
  if (!io) return;

  const specific = event.match(/^ticket:([^:]+):(.+)$/);
  if (specific) {
    const ticketId = specific[1];
    resolveTicketRouting(ticketId, payload)
      .then((route) => emitScopedTicketEvent(event, payload, { ...route, internal: Boolean(payload?.isInternal) || specific[2] === 'audit' }))
      .catch((error) => console.warn('[SOCKET ROUTE]', error.message));
    return;
  }

  if (event.startsWith('ticket:')) {
    const ticketId = String(payload?.id || payload?.ticketId || '');
    if (!ticketId) return;
    resolveTicketRouting(ticketId, payload)
      .then((route) => emitScopedTicketEvent(event, payload, route))
      .catch((error) => console.warn('[SOCKET ROUTE]', error.message));
    return;
  }

  const roomByPrefix = [
    ['audit:', 'perm:audit.view'],
    ['rating:', 'perm:analytics.view'],
    ['canned:', 'perm:canned.view'],
    ['knowledge:', 'perm:knowledge.view'],
    ['smartlearn:', 'perm:smartlearn.view'],
    ['staff:', 'role:ADMIN'],
    ['config:', 'role:ADMIN'],
  ];
  const target = roomByPrefix.find(([prefix]) => event.startsWith(prefix))?.[1] || 'authenticated';
  io.to(target).emit(event, payload);
}

export function disconnectStaff(discordId, reason = 'permissions_changed') {
  if (!io) return;
  io.in(`staff:${discordId}`).disconnectSockets(true);
  console.log(`[socket] disconnected staff ${discordId}: ${reason}`);
}

export function getIo() {
  return io;
}

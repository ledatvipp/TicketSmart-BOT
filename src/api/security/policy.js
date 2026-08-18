import { prisma } from '../../lib/db.js';
// Re-export phần policy thuần để controller hiện tại không phải đổi import.
export {
  STAFF_ROLES,
  normalizeRole,
  parseAllowedOptions,
  serializeAllowedOptions,
  permissionsForStaff,
  hasPermission,
  safeStaff,
  ticketScopeForUser,
  mergeWhereWithTicketScope,
  canViewInternal,
} from './policyCore.js';

import {
  hasPermission,
  mergeWhereWithTicketScope,
  normalizeRole,
} from './policyCore.js';

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này', code: 'FORBIDDEN' });
    }
    next();
  };
}

export function requirePermissionOrBot(permission) {
  return (req, res, next) => {
    if (req.authKind === 'bot') return next();
    return requirePermission(permission)(req, res, next);
  };
}

export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này', code: 'FORBIDDEN' });
    }
    next();
  };
}

export async function findAccessibleTicket({ id, channelId, user, include }) {
  const selector = id ? { id } : { channelId };
  return prisma.ticket.findFirst({
    where: mergeWhereWithTicketScope(selector, user),
    ...(include ? { include } : {}),
  });
}

export async function requireTicketAccess(req, res, next) {
  try {
    const ticket = await findAccessibleTicket({ id: req.params.id, user: req.user });
    if (!ticket) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
    req.ticket = ticket;
    next();
  } catch (error) {
    next(error);
  }
}

export function actorFromRequest(req, fallback = { discordId: 'system', username: 'System', role: 'BOT' }) {
  const user = req.user || fallback;
  return {
    discordId: String(user.discordId || fallback.discordId),
    username: String(user.username || fallback.username),
    role: normalizeRole(user.role === 'BOT' ? 'ADMIN' : user.role),
    kind: req.authKind === 'bot' ? 'bot' : 'user',
  };
}

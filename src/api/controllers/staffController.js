import { prisma } from '../../lib/db.js';
import { emit, disconnectStaff } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { revokeAllRefreshTokens } from '../middleware/auth.js';
import {
  STAFF_ROLES,
  actorFromRequest,
  mergeWhereWithTicketScope,
  safeStaff,
  serializeAllowedOptions,
} from '../security/policy.js';
import {
  ValidationError,
  cleanDiscordId,
  cleanEnum,
  cleanHttpUrl,
  cleanString,
  cleanStringArray,
  parseJsonObject,
} from '../security/validation.js';

function normalizePermissions(value) {
  const parsed = parseJsonObject(value, {});
  const entries = Object.entries(parsed);
  if (entries.length > 80) throw new ValidationError('Không được cấu hình quá 80 permission');
  const normalized = {};
  for (const [key, allowed] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9.*_-]{1,79}$/.test(key)) throw new ValidationError(`Permission không hợp lệ: ${key}`);
    if (typeof allowed !== 'boolean') throw new ValidationError(`Permission ${key} phải là boolean`);
    normalized[key] = allowed;
  }
  return normalized;
}

async function normalizeAllowedOptions(value, tx = prisma) {
  if (value === undefined) return undefined;
  const ids = cleanStringArray(value, { maxItems: 100, maxLength: 128 });
  if (ids.length === 0 || ids.includes('*')) return '';
  const count = await tx.option.count({ where: { id: { in: ids } } });
  if (count !== ids.length) throw new ValidationError('allowedOptions chứa option không tồn tại');
  return serializeAllowedOptions(ids);
}

function staffPayload(staff) {
  return safeStaff(staff);
}

export async function getStaff(_req, res, next) {
  try {
    const staff = await prisma.staff.findMany({ orderBy: [{ role: 'asc' }, { addedAt: 'asc' }] });
    res.json({ success: true, data: staff.map(staffPayload) });
  } catch (error) { next(error); }
}

export async function addStaff(req, res, next) {
  try {
    const actor = actorFromRequest(req);
    const discordId = cleanDiscordId(req.body?.discordId);
    const username = cleanString(req.body?.username, { min: 1, max: 100, allowEmpty: false });
    const avatar = cleanHttpUrl(req.body?.avatar, { allowHttp: false, nullable: true });
    const role = cleanEnum(String(req.body?.role || 'MOD').toUpperCase(), STAFF_ROLES, 'Role');
    const permissions = normalizePermissions(req.body?.permissions);
    const allowedOptions = await normalizeAllowedOptions(req.body?.allowedOptions);

    const staff = await prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { discordId } });
      if (existing) {
        const error = new ValidationError('Staff đã tồn tại', 'STAFF_EXISTS');
        error.statusCode = 409;
        throw error;
      }
      return tx.staff.create({
        data: {
          discordId,
          username,
          avatar,
          role,
          permissions: JSON.stringify(permissions),
          allowedOptions: allowedOptions ?? '',
        },
      });
    });

    await logAudit({ action: 'staff.add', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, metadata: { discordId, username, role, allowedOptions: staff.allowedOptions } });
    emit('staff:added', staffPayload(staff));
    res.status(201).json({ success: true, data: staffPayload(staff) });
  } catch (error) { next(error); }
}

/** PATCH /api/staff/:discordId/role — cập nhật role, permission và phạm vi option. */
export async function updateStaffRole(req, res, next) {
  try {
    const actor = actorFromRequest(req);
    const discordId = cleanDiscordId(req.params.discordId);
    const role = req.body?.role === undefined ? undefined : cleanEnum(String(req.body.role).toUpperCase(), STAFF_ROLES, 'Role');
    const permissions = req.body?.permissions === undefined ? undefined : normalizePermissions(req.body.permissions);
    const allowedOptions = await normalizeAllowedOptions(req.body?.allowedOptions);
    if (role === undefined && permissions === undefined && allowedOptions === undefined) throw new ValidationError('Không có thay đổi nào');
    if (req.authKind !== 'bot' && req.user.discordId === discordId && role && role !== 'ADMIN') {
      throw new ValidationError('Không thể tự giảm role ADMIN của mình');
    }

    const staff = await prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { discordId } });
      if (!existing) {
        const error = new ValidationError('Không tìm thấy staff', 'NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (existing.role === 'ADMIN' && role && role !== 'ADMIN') {
        const admins = await tx.staff.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) throw new ValidationError('Không thể hạ quyền ADMIN cuối cùng');
      }
      const data = {};
      if (role !== undefined) data.role = role;
      if (permissions !== undefined) data.permissions = JSON.stringify(permissions);
      if (allowedOptions !== undefined) data.allowedOptions = allowedOptions;
      return tx.staff.update({ where: { discordId }, data });
    });

    await revokeAllRefreshTokens(discordId);
    disconnectStaff(discordId, 'access_changed');
    await logAudit({
      action: 'staff.access', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind,
      metadata: { discordId, role: staff.role, permissions: JSON.parse(staff.permissions || '{}'), allowedOptions: staff.allowedOptions },
    });
    emit('staff:updated', staffPayload(staff));
    res.json({ success: true, data: staffPayload(staff) });
  } catch (error) { next(error); }
}

export async function getStaffInfo(req, res, next) {
  try {
    const discordId = cleanDiscordId(req.params.discordId);
    const staff = await prisma.staff.findUnique({ where: { discordId } });
    if (!staff) return res.status(404).json({ success: false, message: 'Không tìm thấy staff' });
    const scope = mergeWhereWithTicketScope({ claimerId: discordId }, req.user);
    const [claimed, closed] = await Promise.all([
      prisma.ticket.count({ where: scope }),
      prisma.ticket.count({ where: mergeWhereWithTicketScope({ claimerId: discordId, status: 'closed' }, req.user) }),
    ]);
    res.json({ success: true, data: { ...staffPayload(staff), stats: { claimed, closed } } });
  } catch (error) { next(error); }
}

export async function deleteStaff(req, res, next) {
  try {
    const actor = actorFromRequest(req);
    const discordId = cleanDiscordId(req.params.discordId);
    if (req.authKind !== 'bot' && req.user.discordId === discordId) throw new ValidationError('Không thể xóa chính mình');

    const existing = await prisma.$transaction(async (tx) => {
      const row = await tx.staff.findUnique({ where: { discordId } });
      if (!row) {
        const error = new ValidationError('Không tìm thấy staff', 'NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (row.role === 'ADMIN') {
        const admins = await tx.staff.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) throw new ValidationError('Không thể xóa ADMIN cuối cùng');
      }
      await tx.refreshToken.deleteMany({ where: { discordId } });
      await tx.staff.delete({ where: { discordId } });
      return row;
    });

    disconnectStaff(discordId, 'staff_removed');
    await logAudit({ action: 'staff.remove', actorId: actor.discordId, actorName: actor.username, actorKind: actor.kind, metadata: { discordId, username: existing.username } });
    emit('staff:removed', { discordId });
    res.json({ success: true, message: 'Đã xóa staff' });
  } catch (error) { next(error); }
}

export async function getLeaderboard(req, res, next) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const where = mergeWhereWithTicketScope({
      status: { in: ['claimed', 'closed'] },
      claimedAt: { gte: startOfMonth, lt: endOfMonth },
      claimerId: { not: null },
    }, req.user);
    const claimedTickets = await prisma.ticket.groupBy({
      by: ['claimerId', 'claimerName'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } },
    });
    const staffList = await prisma.staff.findMany({ where: { discordId: { in: claimedTickets.map((row) => row.claimerId).filter(Boolean) } } });
    const staffMap = Object.fromEntries(staffList.map((row) => [row.discordId, row]));
    const leaderboard = claimedTickets.map((entry, index) => ({
      rank: index + 1,
      discordId: entry.claimerId,
      username: entry.claimerName || staffMap[entry.claimerId]?.username || 'Unknown',
      avatar: staffMap[entry.claimerId]?.avatar || null,
      role: staffMap[entry.claimerId]?.role || 'MOD',
      ticketsClaimed: entry._count.id,
    }));
    res.json({ success: true, data: { leaderboard, period: { start: startOfMonth.toISOString(), end: endOfMonth.toISOString(), month: now.getMonth() + 1, year: now.getFullYear() } } });
  } catch (error) { next(error); }
}

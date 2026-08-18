export const STAFF_ROLES = Object.freeze(['VIEWER', 'MOD', 'SENIOR', 'ADMIN']);

const ROLE_PERMISSIONS = Object.freeze({
  VIEWER: new Set([
    'ticket.view',
    'knowledge.view',
  ]),
  MOD: new Set([
    'ticket.view',
    'ticket.reply',
    'ticket.claim',
    'ticket.move',
    'ticket.close',
    'ticket.note',
    'ticket.viewInternal',
    'ticket.priority',
    'ticket.tags',
    'ticket.watch',
    'ticket.export',
    'analytics.view',
    'audit.view',
    'knowledge.view',
    'canned.view',
    'faq.view',
    'intelligence.view',
    'smartlearn.view',
  ]),
  SENIOR: new Set([
    'ticket.view',
    'ticket.reply',
    'ticket.claim',
    'ticket.assign',
    'ticket.move',
    'ticket.close',
    'ticket.note',
    'ticket.priority',
    'ticket.tags',
    'ticket.watch',
    'ticket.export',
    'ticket.exportInternal',
    'ticket.viewInternal',
    'ticket.bulk',
    'ticket.sendToChannel',
    'ticket.workflow',
    'analytics.view',
    'analytics.export',
    'audit.view',
    'knowledge.view',
    'canned.view',
    'faq.view',
    'intelligence.view',
    'smartlearn.view',
    'smartlearn.review',
  ]),
  ADMIN: new Set(['*']),
});

// Mapping từ tên permission cũ để không làm hỏng DB đang dùng.
const LEGACY_PERMISSION_ALIASES = Object.freeze({
  canView: 'ticket.view',
  canReply: 'ticket.reply',
  canClaim: 'ticket.claim',
  canMove: 'ticket.move',
  canClose: 'ticket.close',
  canReopen: 'ticket.close',
  canBulk: 'ticket.bulk',
  canExport: 'ticket.export',
  canViewInternal: 'ticket.viewInternal',
  canConfig: 'config.manage',
  canStaff: 'staff.manage',
  canAudit: 'audit.view',
  canAnalytics: 'analytics.view',
});

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeRole(role) {
  const normalized = String(role || 'VIEWER').trim().toUpperCase();
  return STAFF_ROLES.includes(normalized) ? normalized : 'VIEWER';
}

export function parseAllowedOptions(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const normalized = [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
  if (normalized.length === 0 || normalized.includes('*')) return null;
  return normalized;
}

export function serializeAllowedOptions(value) {
  const parsed = parseAllowedOptions(value);
  return parsed === null ? '' : parsed.join(',');
}

export function permissionsForStaff(staff) {
  const role = normalizeRole(staff?.role);
  const granted = new Set(ROLE_PERMISSIONS[role] || []);
  const overrides = parseObject(staff?.permissions);

  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    const key = LEGACY_PERMISSION_ALIASES[rawKey] || rawKey;
    if (rawValue === true) granted.add(key);
    if (rawValue === false) granted.delete(key);
  }

  return granted;
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.authKind === 'bot' || user.role === 'BOT') return true;
  const permissions = permissionsForStaff(user);
  return permissions.has('*') || permissions.has(permission);
}

export function safeStaff(staff) {
  if (!staff) return null;
  const allowedOptions = parseAllowedOptions(staff.allowedOptions);
  return {
    discordId: staff.discordId,
    username: staff.username,
    avatar: staff.avatar || null,
    role: normalizeRole(staff.role),
    permissions: Object.fromEntries([...permissionsForStaff(staff)].filter((p) => p !== '*').map((p) => [p, true])),
    allowedOptions: allowedOptions || [],
    allOptions: allowedOptions === null,
    addedAt: staff.addedAt,
    updatedAt: staff.updatedAt,
  };
}

export function ticketScopeForUser(user) {
  if (!user || user.authKind === 'bot' || hasPermission(user, '*')) return {};
  const allowed = parseAllowedOptions(user.allowedOptions);
  return allowed === null ? {} : { optionId: { in: allowed } };
}

/** Merge scope bằng AND để không phá các filter OR hiện có. */
export function mergeWhereWithTicketScope(where = {}, user) {
  const scope = ticketScopeForUser(user);
  if (Object.keys(scope).length === 0) return where;
  if (!where || Object.keys(where).length === 0) return scope;
  return { AND: [where, scope] };
}

export function canViewInternal(user) {
  return hasPermission(user, 'ticket.viewInternal') || hasPermission(user, 'ticket.exportInternal');
}

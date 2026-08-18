import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPermission,
  mergeWhereWithTicketScope,
  parseAllowedOptions,
  permissionsForStaff,
  safeStaff,
  ticketScopeForUser,
} from '../src/api/security/policyCore.js';

const viewer = { discordId: '1', username: 'viewer', role: 'VIEWER', permissions: '{}', allowedOptions: 'opt-a,opt-b' };
const mod = { discordId: '2', username: 'mod', role: 'MOD', permissions: '{}', allowedOptions: 'opt-a,opt-b' };
const senior = { discordId: '3', username: 'senior', role: 'SENIOR', permissions: '{}', allowedOptions: '' };
const admin = { discordId: '4', username: 'admin', role: 'ADMIN', permissions: '{}', allowedOptions: 'opt-a' };

test('VIEWER chỉ đọc, không thể reply/claim/close', () => {
  assert.equal(hasPermission(viewer, 'ticket.view'), true);
  assert.equal(hasPermission(viewer, 'ticket.reply'), false);
  assert.equal(hasPermission(viewer, 'ticket.claim'), false);
  assert.equal(hasPermission(viewer, 'ticket.close'), false);
});

test('MOD và SENIOR có đúng ranh giới quyền nhạy cảm', () => {
  assert.equal(hasPermission(mod, 'ticket.reply'), true);
  assert.equal(hasPermission(mod, 'ticket.bulk'), false);
  assert.equal(hasPermission(mod, 'ticket.sendToChannel'), false);
  assert.equal(hasPermission(senior, 'ticket.bulk'), true);
  assert.equal(hasPermission(senior, 'ticket.exportInternal'), true);
});

test('ADMIN không bị giới hạn option và có wildcard permission', () => {
  assert.equal(hasPermission(admin, 'config.manage'), true);
  assert.deepEqual(ticketScopeForUser(admin), {});
});

test('permission override hỗ trợ alias cũ và revoke quyền mặc định', () => {
  const staff = { ...mod, permissions: JSON.stringify({ canReply: false, canBulk: true }) };
  const permissions = permissionsForStaff(staff);
  assert.equal(permissions.has('ticket.reply'), false);
  assert.equal(permissions.has('ticket.bulk'), true);
});

test('allowedOptions được chuẩn hóa, loại trùng và * nghĩa là tất cả', () => {
  assert.deepEqual(parseAllowedOptions(' a, b,a , '), ['a', 'b']);
  assert.equal(parseAllowedOptions('*'), null);
  assert.equal(parseAllowedOptions(''), null);
  assert.deepEqual(ticketScopeForUser(mod), { optionId: { in: ['opt-a', 'opt-b'] } });
});

test('scope luôn merge bằng AND, không làm rộng điều kiện OR nghiệp vụ', () => {
  const where = { OR: [{ status: 'open' }, { priority: 'urgent' }] };
  assert.deepEqual(mergeWhereWithTicketScope(where, mod), {
    AND: [where, { optionId: { in: ['opt-a', 'opt-b'] } }],
  });
});

test('safeStaff không làm lộ field nội bộ và biểu diễn phạm vi rõ ràng', () => {
  const dto = safeStaff({ ...mod, totpSecret: 'never-leak', password: 'never-leak' });
  assert.deepEqual(dto.allowedOptions, ['opt-a', 'opt-b']);
  assert.equal(dto.allOptions, false);
  assert.equal(Object.hasOwn(dto, 'totpSecret'), false);
  assert.equal(Object.hasOwn(dto, 'password'), false);
});

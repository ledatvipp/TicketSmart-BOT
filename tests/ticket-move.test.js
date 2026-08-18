import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleMoveTargets,
  optionSupportsMoveCluster,
  staffCanAccessMoveOption,
  summarizeTicketMoves,
} from '../src/tickets/ticketMovePolicy.js';
import { hasPermission } from '../src/api/security/policyCore.js';

test('move target bỏ mục hiện tại, mục tắt và mục sai cluster', () => {
  const options = [
    { id: 'a', name: 'Tài Khoản', isActive: true, sortOrder: 1, clusterKeys: '*' },
    { id: 'b', name: 'BoxMine', isActive: true, sortOrder: 3, clusterKeys: 'boxmine,survival' },
    { id: 'c', name: 'BoxPvP', isActive: true, sortOrder: 2, clusterKeys: 'boxpvp' },
    { id: 'd', name: 'Tắt', isActive: false, sortOrder: 0, clusterKeys: '*' },
  ];
  assert.equal(optionSupportsMoveCluster(options[1], 'survival'), true);
  assert.equal(optionSupportsMoveCluster(options[2], 'survival'), false);
  assert.deepEqual(eligibleMoveTargets(options, 'a', 'survival').map((item) => item.id), ['b']);
});

test('staff scope được tính đúng khi đồng bộ permission sau move', () => {
  assert.equal(staffCanAccessMoveOption({ allOptions: true }, 'b'), true);
  assert.equal(staffCanAccessMoveOption({ allowedOptions: [] }, 'b'), true);
  assert.equal(staffCanAccessMoveOption({ allowedOptions: ['a', 'b'] }, 'b'), true);
  assert.equal(staffCanAccessMoveOption({ allowedOptions: ['a'] }, 'b'), false);
});

test('MOD và SENIOR có quyền ticket.move, VIEWER không có', () => {
  assert.equal(hasPermission({ role: 'VIEWER' }, 'ticket.move'), false);
  assert.equal(hasPermission({ role: 'MOD' }, 'ticket.move'), true);
  assert.equal(hasPermission({ role: 'SENIOR' }, 'ticket.move'), true);
});

test('routing analytics nhóm đúng transition, destination và staff', () => {
  const rows = [
    { ticketId: 't1', fromOptionId: 'a', fromOptionName: 'Tài Khoản', toOptionId: 'b', toOptionName: 'BoxMine', movedById: 'u1', movedByName: 'Mod A', source: 'discord' },
    { ticketId: 't2', fromOptionId: 'a', fromOptionName: 'Tài Khoản', toOptionId: 'b', toOptionName: 'BoxMine', movedById: 'u1', movedByName: 'Mod A', source: 'discord' },
    { ticketId: 't1', fromOptionId: 'b', fromOptionName: 'BoxMine', toOptionId: 'c', toOptionName: 'BoxPvP', movedById: 'u2', movedByName: 'Mod B', source: 'discord' },
  ];
  const result = summarizeTicketMoves(rows);
  assert.equal(result.totalMoves, 3);
  assert.equal(result.movedTickets, 2);
  assert.equal(result.averageMovesPerMovedTicket, 1.5);
  assert.equal(result.repeatedMoveTickets, 1);
  assert.equal(result.maxMovesOnSingleTicket, 2);
  assert.deepEqual(result.byDestination.map((row) => [row.optionName, row.count]), [['BoxMine', 2], ['BoxPvP', 1]]);
  assert.equal(result.topTransitions[0].count, 2);
  assert.equal(result.topMovers[0].username, 'Mod A');
});

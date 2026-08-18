import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionPlan, normalizeArticleActions } from '../src/actions/actionRegistry.js';

test('action registry chỉ chấp nhận action an toàn', () => {
  const actions = normalizeArticleActions([
    { type: 'link', label: 'Trang chính', url: 'https://is7mc.net' },
    { type: 'link', label: 'Nguy hiểm', url: 'javascript:alert(1)' },
    { type: 'console_command', command: 'op user' },
    { type: 'ticket', label: 'Tạo ticket' },
  ]);
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((x) => x.type), ['link', 'ticket']);
});

test('action plan tạo ticket và escalation có owner binding', () => {
  const plan = buildActionPlan({
    intent: { action: 'CREATE_TICKET', buttonLabel: 'Tạo ticket' },
    option: { id: 'opt1' },
    article: null,
    config: { smartEscalationRoleId: '123456789012345678' },
    guildId: '223456789012345678',
    userId: '323456789012345678',
    detectionId: 'det1',
  });
  assert.equal(plan[0].type, 'ticket');
  assert.match(plan[0].customId, /323456789012345678/);
  assert.ok(plan.some((x) => x.type === 'escalate'));
});

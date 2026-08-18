import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateKnowledgeEvidence } from '../src/intelligence/evidenceQuality.js';
import { fallbackTicketTriage, mergeTicketTags, shouldRaisePriority } from '../src/intelligence/ticketTriage.js';

function article(overrides = {}) {
  return {
    id: overrides.id || 'a1',
    title: 'Hướng dẫn claim đất Survival',
    summary: 'Dùng lệnh claim theo hướng dẫn của server.',
    category: 'survival-guide',
    score: 0.9,
    qualityScore: 0.95,
    helpfulCount: 10,
    unhelpfulCount: 0,
    status: 'PUBLISHED',
    confidenceFloor: 0.3,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('evidence gate cho phép nguồn Knowledge mạnh và mới', () => {
  const result = evaluateKnowledgeEvidence([article()], { minScore: 0.5, freshnessDays: 180 });
  assert.equal(result.sufficient, true);
  assert.ok(result.evidenceScore >= 0.75);
  assert.deepEqual(result.reasons, ['grounded']);
});

test('evidence gate chặn nguồn retrieval yếu dù bài có quality tốt', () => {
  const result = evaluateKnowledgeEvidence([article({ score: 0.18 })], { minScore: 0.5 });
  assert.equal(result.sufficient, false);
  assert.ok(result.reasons.includes('weak_top_source'));
});

test('evidence gate không dùng bài đã tới hạn review làm câu trả lời cuối', () => {
  const result = evaluateKnowledgeEvidence([article({
    reviewDueAt: new Date(Date.now() - 60_000).toISOString(),
  })], { minScore: 0.5 });
  assert.equal(result.sufficient, false);
  assert.ok(result.reasons.includes('review_overdue'));
});

test('evidence gate phát hiện hai nguồn gần điểm nhưng khác chủ đề', () => {
  const result = evaluateKnowledgeEvidence([
    article({ id: 'a1', score: 0.82, category: 'payment', title: 'Nạp tiền chưa nhận' }),
    article({ id: 'a2', score: 0.81, category: 'ban-appeal', title: 'Kháng án ban', summary: 'Quy trình kháng án.' }),
  ], { minScore: 0.5, minTopGap: 0.04 });
  assert.equal(result.ambiguousSources, true);
  assert.equal(result.sufficient, false);
});

test('ticket triage fallback đánh dấu vấn đề bảo mật cần staff và ưu tiên cao', () => {
  const triage = fallbackTicketTriage({
    content: 'Tài khoản của tôi có vẻ bị hack và mất quyền truy cập',
    intent: { key: 'ACCOUNT_SECURITY', label: 'Bảo mật tài khoản', confidence: 0.9, priority: 'high' },
    cluster: { key: 'survival' },
    evidence: { sufficient: false },
  });
  assert.equal(triage.needsHuman, true);
  assert.ok(['high', 'urgent'].includes(triage.priority));
  assert.ok(triage.tags.includes('sensitive'));
});

test('ticket triage chỉ nâng priority và merge tag không trùng', () => {
  assert.equal(shouldRaisePriority('normal', 'high'), true);
  assert.equal(shouldRaisePriority('urgent', 'high'), false);
  assert.equal(mergeTicketTags('bug,cluster-survival', ['bug', 'needs-evidence']), 'bug,cluster-survival,needs-evidence');
});

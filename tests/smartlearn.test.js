import test from 'node:test';
import assert from 'node:assert/strict';
import { riskForIntent, tokenSimilarity, shouldReopenRejected } from '../src/smartlearn/smartLearnService.js';

test('SmartLearn bắt buộc Admin cho nội dung nhạy cảm', () => {
  assert.equal(riskForIntent('TOPUP_NOT_RECEIVED'), 'ADMIN_REQUIRED');
  assert.equal(riskForIntent('BAN_APPEAL'), 'ADMIN_REQUIRED');
  assert.equal(riskForIntent('CLAIM_GUIDE'), 'NORMAL');
});

test('SmartLearn gộp câu hỏi đồng nghĩa gần nhau bằng token similarity', () => {
  const score = tokenSimilarity('đồ trong private server có bị xóa không', 'private server có xóa đồ không');
  assert.ok(score >= 0.6, `score quá thấp: ${score}`);
});

test('SmartLearn không gộp câu khác cụm nội dung', () => {
  const score = tokenSimilarity('cách nâng cấp đảo skyblock', 'làm sao claim đất survival');
  assert.ok(score < 0.5, `score quá cao: ${score}`);
});

import { candidateTypeFor, priorityScoreFor } from '../src/smartlearn/smartLearnService.js';

test('SmartLearn v2 gắn câu đồng nghĩa vào bài hiện có thay vì tạo bài rác', () => {
  assert.equal(candidateTypeFor({}, { score: 0.86, article: { id: 'a1' } }), 'ADD_ALIAS');
  assert.equal(candidateTypeFor({}, { score: 0.58, article: { id: 'a1' } }), 'VERIFY_EXISTING');
  assert.equal(candidateTypeFor({}, null), 'NEW_ARTICLE');
});

test('SmartLearn v2 ưu tiên revision nhạy cảm và câu bị đánh giá sai', () => {
  const normal = priorityScoreFor({ occurrenceCount: 1, riskLevel: 'NORMAL', sourceType: 'SMART_MESSAGE', candidateType: 'NEW_ARTICLE', matchScore: 0 });
  const revision = priorityScoreFor({ occurrenceCount: 4, riskLevel: 'ADMIN_REQUIRED', sourceType: 'NEGATIVE_FEEDBACK', candidateType: 'REVISE_ARTICLE', matchScore: 0.8 });
  assert.ok(revision > normal);
});


test('SmartLearn chỉ mở lại candidate bị từ chối khi có tín hiệu mới đủ mạnh', () => {
  const now = Date.UTC(2026, 7, 1);
  const recent = { reviewedAt: new Date(now - 2 * 60 * 60_000).toISOString() };
  const stale = { reviewedAt: new Date(now - 8 * 24 * 60 * 60_000).toISOString() };
  const repeated = { reviewedAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString() };
  assert.equal(shouldReopenRejected(recent, 10, now), false);
  assert.equal(shouldReopenRejected(stale, 2, now), true);
  assert.equal(shouldReopenRejected(repeated, 3, now), true);
});

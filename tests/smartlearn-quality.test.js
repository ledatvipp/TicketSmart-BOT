import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictScoreFor, learningScoreFor, sourceDiversityFor } from '../src/smartlearn/smartLearnService.js';

test('SmartLearn source diversity đếm người hỏi độc lập thay vì số message', () => {
  const diversity = sourceDiversityFor([
    { sourceUserId: 'u1', sourceMessageId: 'm1' },
    { sourceUserId: 'u1', sourceMessageId: 'm2' },
    { sourceUserId: 'u2', sourceMessageId: 'm3' },
  ]);
  assert.equal(diversity, 2);
});

test('SmartLearn learning score tăng với resolved ticket, diversity và evidence mạnh', () => {
  const weak = learningScoreFor({
    occurrenceCount: 1, sourceDiversity: 1, sourceConfidence: 0.4, evidenceScore: 0.2,
    sourceType: 'SMART_MESSAGE', proposedAnswer: '',
  });
  const strong = learningScoreFor({
    occurrenceCount: 4, sourceDiversity: 3, sourceConfidence: 0.95, evidenceScore: 0.92,
    sourceType: 'TICKET_RESOLUTION', proposedAnswer: 'Staff đã xác minh cách xử lý cụ thể và đầy đủ cho vấn đề này.',
  });
  assert.ok(strong > weak, `${strong} phải lớn hơn ${weak}`);
  assert.ok(strong >= 0.7);
});

test('SmartLearn conflict score cao khi nguồn đáng tin mâu thuẫn bài hiện có', () => {
  const score = conflictScoreFor({
    proposedAnswer: 'Không được giữ vật phẩm sau reset; toàn bộ inventory sẽ bị xóa.',
    existingAnswer: 'Người chơi sẽ giữ toàn bộ vật phẩm và inventory sau reset.',
    matchScore: 0.92,
    sourceType: 'TICKET_RESOLUTION',
  });
  assert.ok(score >= 0.55, `conflict score quá thấp: ${score}`);
});

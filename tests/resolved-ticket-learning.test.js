import test from 'node:test';
import assert from 'node:assert/strict';
import { extractResolvedTicketKnowledge, redactLearningText } from '../src/smartlearn/resolvedTicketLearning.js';

test('resolved-ticket learning chỉ học từ câu user + câu staff public đã xác minh', () => {
  const ticket = {
    id: 't1', status: 'closed', creatorId: 'user1', creatorName: 'Player', claimerId: 'staff1',
    channelId: '123', clusterKey: 'survival', type: 'Mất đồ', aiLastIntent: 'ITEM_LOSS_DUE_TO_LAG',
  };
  const messages = [
    { authorId: 'user1', isBot: false, isInternal: false, content: 'Tôi bị mất đồ sau khi server lag', timestamp: '2026-08-08T00:00:00Z' },
    { authorId: 'bot', isBot: true, isInternal: false, content: 'AI đoán thử', timestamp: '2026-08-08T00:01:00Z' },
    { authorId: 'staff1', isBot: false, isInternal: true, content: 'ghi chú bí mật', timestamp: '2026-08-08T00:02:00Z' },
    { authorId: 'staff1', isBot: false, isInternal: false, content: 'Staff kiểm tra log rồi restore đúng snapshot trước lúc lag.', timestamp: '2026-08-08T00:03:00Z' },
  ];
  const result = extractResolvedTicketKnowledge(ticket, messages, { staffIds: ['staff1'] });
  assert.ok(result);
  assert.equal(result.sourceType, 'TICKET_RESOLUTION');
  assert.match(result.question, /mất đồ/i);
  assert.match(result.proposedAnswer, /kiểm tra log/i);
  assert.doesNotMatch(result.proposedAnswer, /ghi chú bí mật/i);
  assert.doesNotMatch(result.proposedAnswer, /AI đoán thử/i);
});

test('resolved-ticket learning không học ticket không có câu trả lời staff thực chất', () => {
  const ticket = { id: 't1', status: 'closed', creatorId: 'u', claimerId: 's' };
  const result = extractResolvedTicketKnowledge(ticket, [
    { authorId: 'u', isBot: false, isInternal: false, content: 'Tại sao lỗi vậy?', timestamp: 1 },
    { authorId: 's', isBot: false, isInternal: false, content: 'ok', timestamp: 2 },
  ], { staffIds: ['s'] });
  assert.equal(result, null);
});

test('resolved-ticket learning redact credential và PII cơ bản trước khi vào queue', () => {
  const text = redactLearningText('email test@example.com ip 10.1.2.3 token: abc123 password=hunter2');
  assert.doesNotMatch(text, /test@example\.com|10\.1\.2\.3|abc123|hunter2/);
  assert.match(text, /\[EMAIL\]|\[IP\]|\[REDACTED\]/);
});

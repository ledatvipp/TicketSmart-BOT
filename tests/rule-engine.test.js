import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWithRules } from '../src/intelligence/ruleEngine.js';
import { normalizeText } from '../src/intelligence/text.js';
import { extractResponseText } from '../src/intelligence/openaiResponse.js';

test('normalize Vietnamese and common slang', () => {
  assert.equal(normalizeText('SV lagg, tôi mất INV!!!'), 'server lag toi mat inventory');
});

test('detect item loss caused by lag', () => {
  const result = classifyWithRules('Tôi chết lúc server lag và bay hết đồ');
  assert.equal(result.key, 'ITEM_LOSS_DUE_TO_LAG');
  assert.ok(result.confidence >= 0.72);
});

test('detect staff application', () => {
  const result = classifyWithRules('Server còn tuyển helper không, mình muốn ứng tuyển');
  assert.equal(result.key, 'STAFF_APPLICATION');
});

test('detect topup failure separately from topup guide', () => {
  const result = classifyWithRules('Tôi chuyển khoản rồi nhưng chưa nhận xu');
  assert.equal(result.key, 'TOPUP_NOT_RECEIVED');
});

test('unknown casual message has low confidence', () => {
  const result = classifyWithRules('xin chào mọi người');
  assert.ok(result.confidence < 0.48);
});

test('extract output text from raw Responses API payload', () => {
  const text = extractResponseText({
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{"intent":"BUG_REPORT"}' }],
    }],
  });
  assert.equal(text, '{"intent":"BUG_REPORT"}');
});

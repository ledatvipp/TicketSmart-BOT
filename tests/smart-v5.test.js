import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWithRules } from '../src/intelligence/ruleEngine.js';
import { normalizeText } from '../src/intelligence/text.js';
import { pendingChoicesFromResult, resolvePendingChoice } from '../src/intelligence/conversationEngine.js';
import { getCached, setCached, clearRuntimeCache } from '../src/intelligence/aiRuntime.js';
import { routeIntent } from '../src/intelligence/intentRouter.js';
import { INTENTS } from '../src/intelligence/intentCatalog.js';


test('v5 sửa typo, chữ kéo dài và từ viết tắt Minecraft', () => {
  assert.equal(normalizeText('mún bít cách cliam đất ntn'), 'muon biet cach claim dat nhu the nao');
  assert.equal(normalizeText('sever laaaag xong bay inv'), 'server lag xong bay inventory');
});

test('v5 phát hiện nhiều intent trong cùng tin nhắn', () => {
  const result = classifyWithRules('server lag và tôi nạp tiền chưa nhận', { maxIntents: 3 });
  const keys = result.intents.map((item) => item.key);
  assert.ok(keys.includes('SERVER_LAG'));
  assert.ok(keys.includes('TOPUP_NOT_RECEIVED'));
});

test('v5 hiểu phủ định và không gán nhầm mất đồ', () => {
  const result = classifyWithRules('tôi không mất đồ, chỉ thấy server lag', { maxIntents: 3 });
  assert.equal(result.key, 'SERVER_LAG');
  assert.ok(!result.intents.some((item) => item.key === 'ITEM_LOSS_DUE_TO_LAG'));
});

test('feedback đã duyệt có thể trở thành rule example động', () => {
  const result = classifyWithRules('cục đồ của tui bốc hơi sạch', {
    examples: [{ intentKey: 'ITEM_LOSS_DUE_TO_LAG', phrase: 'cục đồ của tui bốc hơi sạch', weight: 1 }],
  });
  assert.equal(result.key, 'ITEM_LOSS_DUE_TO_LAG');
  assert.ok(result.confidence >= 0.8);
});

test('conversation clarification hiểu số thứ tự và nhãn', () => {
  const source = {
    key: 'SERVER_LAG', confidence: 0.55,
    alternatives: [
      { key: 'ITEM_LOSS_DUE_TO_LAG', confidence: 0.52 },
      { key: 'TOPUP_NOT_RECEIVED', confidence: 0.5 },
    ],
  };
  const choices = pendingChoicesFromResult(source);
  assert.equal(resolvePendingChoice('2', choices)?.key, 'ITEM_LOSS_DUE_TO_LAG');
  assert.equal(resolvePendingChoice('nạp tiền', choices)?.key, 'TOPUP_NOT_RECEIVED');
});

test('AI runtime cache hết hạn an toàn', async () => {
  clearRuntimeCache('test-cache');
  setCached('test-cache', 'x', { ok: true }, 1000);
  assert.deepEqual(getCached('test-cache', 'x'), { ok: true });
  clearRuntimeCache('test-cache');
  assert.equal(getCached('test-cache', 'x'), null);
});

test('conversation clarification hiểu cách nói thứ tự tự nhiên', () => {
  const choices = [
    { key: 'SERVER_LAG', label: 'Server lag' },
    { key: 'ITEM_LOSS_DUE_TO_LAG', label: 'Mất vật phẩm' },
  ];
  assert.equal(resolvePendingChoice('cái thứ hai', choices)?.key, 'ITEM_LOSS_DUE_TO_LAG');
  assert.equal(resolvePendingChoice('đầu tiên', choices)?.key, 'SERVER_LAG');
});

test('conversation dùng intent trước cho câu hỏi nối tiếp rõ ràng', async () => {
  const result = await routeIntent('còn cái đó thì sao', {
    smartClarificationEnabled: true,
    smartAiEnabled: false,
  }, { lastIntentKey: 'CLAIM_GUIDE', pendingIntents: [], history: [] });
  assert.equal(result.key, 'CLAIM_GUIDE');
  assert.equal(result.source, 'conversation_rule');
  assert.equal(result.usedConversationContext, true);
});


test('mọi intent trong catalog có ít nhất một câu mẫu nhận diện được', () => {
  for (const intent of INTENTS) {
    const phrase = intent.phrases?.[0]?.[0];
    assert.ok(phrase, `${intent.key} thiếu câu mẫu`);
    const result = classifyWithRules(phrase, { maxIntents: 3 });
    assert.ok(result.intents.some((item) => item.key === intent.key), `${intent.key} bị nhận thành ${result.key}`);
  }
});

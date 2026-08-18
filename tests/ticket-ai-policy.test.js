import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isQuestionLike,
  safetyForIntent,
  ticketAiDecision,
} from '../src/tickets/ticketAssistantPolicy.js';

function baseMessage(content = 'cách claim đất thế nào?') {
  return {
    content,
    author: { id: 'user1', bot: false },
    webhookId: null,
  };
}

function baseTicket(overrides = {}) {
  return {
    id: 'ticket1', creatorId: 'user1', status: 'open', claimerId: null,
    aiPaused: false, aiReplyCount: 0, messageCount: 2, aiLastReplyAt: null,
    ...overrides,
  };
}

const config = {
  ticketAiEnabled: true,
  ticketAiMode: 'balanced',
  ticketAiOnlyCreator: true,
  ticketAiRequireQuestion: true,
  ticketAiPauseWhenClaimed: true,
  ticketAiMaxReplies: 3,
  ticketAiReplyCooldownSeconds: 45,
  ticketAiSensitiveEscalation: true,
};

test('ticket AI chỉ phản hồi câu hỏi rõ ràng ở balanced mode', () => {
  assert.equal(ticketAiDecision({ message: baseMessage('tôi vừa vào ticket'), ticket: baseTicket(), config }).allow, false);
  assert.equal(ticketAiDecision({ message: baseMessage('tôi cần cung cấp gì để hoàn đồ?'), ticket: baseTicket(), config }).allow, true);
  assert.equal(isQuestionLike('làm sao để claim đất'), true);
});

test('ticket AI nhường staff sau khi claim nhưng vẫn cho phép gọi trực tiếp', () => {
  const claimed = baseTicket({ claimerId: 'staff1' });
  assert.equal(ticketAiDecision({ message: baseMessage('cách làm cái này?'), ticket: claimed, config }).reason, 'claimed');
  const explicit = ticketAiDecision({ message: baseMessage('bot giúp tôi cách claim?'), ticket: claimed, config });
  assert.equal(explicit.allow, true);
  assert.equal(explicit.explicit, true);
});

test('ticket AI chặn spam theo cooldown và giới hạn phản hồi', () => {
  const cooldownTicket = baseTicket({ aiLastReplyAt: new Date().toISOString() });
  assert.equal(ticketAiDecision({ message: baseMessage(), ticket: cooldownTicket, config }).reason, 'cooldown');
  const capped = baseTicket({ aiReplyCount: 3 });
  assert.equal(ticketAiDecision({ message: baseMessage(), ticket: capped, config }).reason, 'max_replies');
});

test('intent nhạy cảm luôn yêu cầu staff khi policy bật', () => {
  assert.equal(safetyForIntent('TOPUP_NOT_RECEIVED', config).humanRequired, true);
  assert.equal(safetyForIntent('CLAIM_GUIDE', config).humanRequired, false);
});

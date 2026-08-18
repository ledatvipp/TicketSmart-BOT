import { normalizeText } from '../intelligence/text.js';

export const SENSITIVE_TICKET_INTENTS = new Set([
  'ITEM_LOSS_DUE_TO_LAG',
  'TOPUP_NOT_RECEIVED',
  'PURCHASE_DELIVERY_ERROR',
  'PLAYER_REPORT',
  'PUNISHMENT_APPEAL',
  'ACCOUNT_SECURITY',
]);

const QUESTION_HINTS = [
  '?', 'sao', 'tai sao', 'the nao', 'nhu the nao', 'lam sao', 'cach', 'o dau',
  'bao gio', 'may gio', 'bao lau', 'co duoc', 'giup', 'huong dan', 'khong duoc',
  'bi loi', 'loi gi', 'can gi', 'la gi',
];

const DIRECT_HELP_HINTS = [
  'bot', 'tro ly ai', 'goi ai', 'hoi ai', 'ai oi',
];

export function isQuestionLike(content = '') {
  const raw = String(content || '').trim();
  if (!raw) return false;
  if (raw.includes('?')) return true;
  const text = normalizeText(raw);
  return QUESTION_HINTS.some((hint) => text.includes(hint));
}

export function explicitlyRequestsAssistant(content = '', botMentioned = false) {
  if (botMentioned) return true;
  const text = normalizeText(content);
  return DIRECT_HELP_HINTS.some((hint) => text.includes(hint));
}

export function ticketAiDecision({ message, ticket, config = {}, botMentioned = false, now = Date.now() }) {
  if (!config.ticketAiEnabled || config.ticketAiMode === 'off') return { allow: false, reason: 'disabled' };
  if (!message?.content?.trim()) return { allow: false, reason: 'empty' };
  if (message.author?.bot || message.webhookId) return { allow: false, reason: 'bot' };
  if (!ticket || ticket.status === 'closed') return { allow: false, reason: 'closed' };
  if (ticket.aiPaused) return { allow: false, reason: 'paused' };
  if (config.ticketAiOnlyCreator !== false && message.author.id !== ticket.creatorId) {
    return { allow: false, reason: 'not_creator' };
  }

  const explicit = explicitlyRequestsAssistant(message.content, botMentioned);
  const question = isQuestionLike(message.content);
  const mode = String(config.ticketAiMode || 'balanced');

  if (config.ticketAiPauseWhenClaimed !== false && ticket.claimerId && !explicit) {
    return { allow: false, reason: 'claimed' };
  }

  const maxReplies = Math.max(0, Number(config.ticketAiMaxReplies) || 3);
  if (maxReplies > 0 && Number(ticket.aiReplyCount || 0) >= maxReplies && !explicit) {
    return { allow: false, reason: 'max_replies' };
  }

  const cooldownMs = Math.max(5, Number(config.ticketAiReplyCooldownSeconds) || 45) * 1000;
  const lastReplyAt = ticket.aiLastReplyAt ? new Date(ticket.aiLastReplyAt).getTime() : 0;
  if (lastReplyAt && now - lastReplyAt < cooldownMs && !explicit) {
    return { allow: false, reason: 'cooldown' };
  }

  if (mode === 'passive' && !explicit) return { allow: false, reason: 'passive' };
  if (config.ticketAiRequireQuestion !== false && !question && !explicit) {
    // Trong balanced mode, chỉ chủ động với tin đầu tiên có đủ mô tả vấn đề.
    const firstUsefulMessage = Number(ticket.messageCount || 0) <= 1 && String(message.content).trim().length >= 24;
    if (!(mode === 'active' && firstUsefulMessage)) return { allow: false, reason: 'not_question' };
  }

  return { allow: true, reason: explicit ? 'explicit' : question ? 'question' : 'first_message', explicit, question };
}

export function safetyForIntent(intentKey, config = {}) {
  const sensitive = SENSITIVE_TICKET_INTENTS.has(intentKey);
  return {
    sensitive,
    humanRequired: sensitive && config.ticketAiSensitiveEscalation !== false,
    canGiveFinalDecision: !sensitive,
    canGiveChecklist: true,
  };
}

export function compactChecklistForIntent(intentKey) {
  const map = {
    ITEM_LOSS_DUE_TO_LAG: ['Thời gian xảy ra', 'Tên vật phẩm bị mất', 'Ảnh/video nếu có'],
    TOPUP_NOT_RECEIVED: ['Tên Minecraft', 'Mã giao dịch', 'Thời gian và mệnh giá'],
    PURCHASE_DELIVERY_ERROR: ['Sản phẩm đã mua', 'Mã đơn/giao dịch', 'Thời gian mua'],
    PLAYER_REPORT: ['Tên người bị report', 'Thời gian', 'Ảnh/video bằng chứng'],
    PUNISHMENT_APPEAL: ['Tên Minecraft', 'Loại hình phạt', 'Lý do kháng án ngắn gọn'],
    ACCOUNT_SECURITY: ['Tên Minecraft', 'Thời điểm phát hiện', 'Không gửi mật khẩu/OTP'],
    BUG_REPORT: ['Cách tái hiện lỗi', 'Thời gian', 'Ảnh/video hoặc log'],
  };
  return map[intentKey] || ['Mô tả ngắn gọn', 'Thời gian xảy ra', 'Ảnh/video nếu có'];
}

export function workflowLabel(status) {
  return ({
    waiting_staff: 'Đang chờ Staff',
    waiting_user: 'Đang chờ bạn',
    ai_assisting: 'AI đang hỗ trợ',
    resolved: 'Đã xử lý',
  })[status] || 'Đang xử lý';
}

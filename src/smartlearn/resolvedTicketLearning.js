import { createOrMergeCandidate } from './smartLearnService.js';

function clean(value, max = 4000) {
  return String(value ?? '')
    .replace(/@everyone|@here/gi, '@ everyone')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export function redactLearningText(value, max = 4000) {
  return clean(value, max)
    // credentials / tokens explicitly written as key=value or key: value
    .replace(/\b(password|pass|mat\s*khau|mật\s*khẩu|otp|2fa|token|secret|api[_ -]?key)\b\s*[:=]\s*[^\s,;]+/gi, '$1: [REDACTED]')
    // common PII which should not become reusable knowledge
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/<@!?\d{15,22}>/g, '@user')
    .replace(/\b\d{16,19}\b/g, '[LONG_ID]')
    .trim()
    .slice(0, max);
}

function meaningfulStaffAnswer(value) {
  const text = redactLearningText(value, 4000);
  if (text.length < 8) return false;
  const compact = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return !['ok', 'oke', 'okay', 'done', 'xong', 'da xong', 'đã xong', 'da xu ly', 'đã xử lý', 'fixed'].includes(compact);
}

export function extractResolvedTicketKnowledge(ticket, messages = [], { staffIds = [] } = {}) {
  if (!ticket || ticket.status !== 'closed') return null;
  const staff = new Set((staffIds || []).filter(Boolean));
  if (ticket.claimerId) staff.add(ticket.claimerId);

  const publicMessages = (messages || [])
    .filter((row) => row && !row.isInternal)
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  const userMessages = publicMessages.filter((row) => row.authorId === ticket.creatorId && !row.isBot && clean(row.content, 2000).length >= 3);
  const staffMessages = publicMessages.filter((row) => !row.isBot && staff.has(row.authorId) && meaningfulStaffAnswer(row.content));
  if (!userMessages.length || !staffMessages.length) return null;

  const firstQuestion = redactLearningText(userMessages[0].content, 1000);
  const latestQuestion = userMessages.length > 1 ? redactLearningText(userMessages.at(-1).content, 800) : '';
  const question = [firstQuestion, latestQuestion && latestQuestion !== firstQuestion ? `Bổ sung: ${latestQuestion}` : '']
    .filter(Boolean).join('\n').slice(0, 1500);

  const answerRows = staffMessages.slice(-3).map((row) => redactLearningText(row.content, 1800)).filter(Boolean);
  const answer = [...new Set(answerRows)].join('\n\n').slice(0, 5000);
  if (question.length < 3 || answer.length < 16) return null;

  return {
    clusterKey: ticket.clusterKey || null,
    intentKey: ticket.aiLastIntent || null,
    question,
    proposedTitle: `${ticket.type || 'Ticket'} • ${question.replace(/\s+/g, ' ').slice(0, 110)}`,
    proposedAnswer: answer,
    sourceType: 'TICKET_RESOLUTION',
    sourceTicketId: ticket.id,
    sourceChannelId: ticket.channelId || null,
    sourceUserId: ticket.creatorId || null,
    sourceUserName: ticket.creatorName || null,
    sourceConfidence: 0.95,
    evidenceScore: 0.92,
    negativeSignal: false,
  };
}

export async function captureResolvedTicketLearning(prisma, ticketId, { guildId = process.env.GUILD_ID } = {}) {
  if (!prisma || !ticketId || !guildId) return { skipped: true, reason: 'missing_context' };
  const config = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
  if (!config?.smartLearnEnabled || config.smartLearnFromResolvedTickets === false) {
    return { skipped: true, reason: 'disabled' };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { where: { isInternal: false }, orderBy: { timestamp: 'desc' }, take: 500 } },
  });
  if (!ticket || ticket.status !== 'closed') return { skipped: true, reason: 'ticket_not_closed' };

  const possibleStaffIds = [...new Set(ticket.messages.filter((row) => !row.isBot && row.authorId !== ticket.creatorId).map((row) => row.authorId))];
  const staffRows = possibleStaffIds.length
    ? await prisma.staff.findMany({ where: { discordId: { in: possibleStaffIds } }, select: { discordId: true } })
    : [];
  const staffIds = staffRows.map((row) => row.discordId);
  if (ticket.claimerId) staffIds.push(ticket.claimerId);

  const payload = extractResolvedTicketKnowledge(ticket, ticket.messages, { staffIds });
  if (!payload) return { skipped: true, reason: 'no_verified_resolution' };
  return createOrMergeCandidate(prisma, { guildId, ...payload });
}

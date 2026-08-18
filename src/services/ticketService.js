import { prisma } from '../lib/db.js';
import { mergeWhereWithTicketScope } from '../api/security/policy.js';
import { cleanString, cleanStringArray, ValidationError } from '../api/security/validation.js';
import { captureResolvedTicketLearning } from '../smartlearn/resolvedTicketLearning.js';

export const TICKET_INCLUDE = Object.freeze({
  option: { select: { id: true, name: true, emoji: true, color: true } },
  _count: { select: { messages: true } },
});

export async function claimTicketRecord({ selector, actor, user }) {
  const existing = await prisma.ticket.findFirst({
    where: mergeWhereWithTicketScope(selector, user),
  });
  if (!existing) return { status: 'not_found' };
  if (existing.status !== 'open') return { status: 'invalid_state', currentStatus: existing.status };

  const now = new Date();
  const claimed = await prisma.ticket.updateMany({
    where: { id: existing.id, status: 'open', claimerId: null },
    data: {
      claimerId: actor.discordId,
      claimerName: actor.username,
      status: 'claimed',
      claimedAt: now,
      // firstResponseAt chỉ được set khi staff thực sự gửi message.
    },
  });
  if (claimed.count !== 1) return { status: 'conflict' };
  const ticket = await prisma.ticket.findUnique({ where: { id: existing.id }, include: TICKET_INCLUDE });
  return { status: 'ok', ticket };
}


export async function assignTicketRecord({ selector, actor, assignee, user }) {
  const existing = await prisma.ticket.findFirst({ where: mergeWhereWithTicketScope(selector, user) });
  if (!existing) return { status: 'not_found' };
  if (!['open', 'claimed'].includes(existing.status)) return { status: 'invalid_state', currentStatus: existing.status };
  const now = new Date();
  const updated = await prisma.ticket.updateMany({
    where: { id: existing.id, status: { in: ['open', 'claimed'] } },
    data: {
      claimerId: assignee.discordId,
      claimerName: assignee.username,
      status: 'claimed',
      claimedAt: existing.claimedAt || now,
      aiPaused: true,
    },
  });
  if (updated.count !== 1) return { status: 'conflict' };
  const ticket = await prisma.ticket.findUnique({ where: { id: existing.id }, include: TICKET_INCLUDE });
  return {
    status: 'ok', ticket,
    previous: { discordId: existing.claimerId, username: existing.claimerName },
    assignedBy: actor,
  };
}

export async function closeTicketRecord({ selector, actor, user, reason, closeType }) {
  const existing = await prisma.ticket.findFirst({
    where: mergeWhereWithTicketScope(selector, user),
  });
  if (!existing) return { status: 'not_found' };
  if (existing.status === 'closed') return { status: 'invalid_state', currentStatus: existing.status };

  const safeReason = reason === undefined || reason === null || reason === ''
    ? null
    : cleanString(reason, { max: 1800 });
  const safeCloseType = closeType
    ? cleanString(closeType, { max: 40 })
    : (safeReason ? 'custom' : 'silent');
  const now = new Date();
  const updated = await prisma.ticket.updateMany({
    where: { id: existing.id, status: { not: 'closed' } },
    data: {
      status: 'closed',
      workflowStatus: 'resolved',
      aiPaused: true,
      closedAt: now,
      closedBy: actor.discordId,
      closeReason: safeReason,
    },
  });
  if (updated.count !== 1) return { status: 'conflict' };
  const ticket = await prisma.ticket.findUnique({ where: { id: existing.id }, include: TICKET_INCLUDE });
  let learning = null;
  try {
    learning = await captureResolvedTicketLearning(prisma, existing.id);
  } catch (error) {
    console.warn('[SMARTLEARN RESOLVED TICKET]', existing.id, error.message);
  }
  return { status: 'ok', ticket, reason: safeReason, closeType: safeCloseType, learning };
}

export async function moveTicketRecord({
  selector, actor, user, targetOptionId, reason = null, source = 'api',
  fromCategoryId = null, toCategoryId = null,
}) {
  const existing = await prisma.ticket.findFirst({
    where: mergeWhereWithTicketScope(selector, user),
    include: { option: { select: { id: true, name: true, emoji: true, clusterKeys: true } } },
  });
  if (!existing) return { status: 'not_found' };
  if (!['open', 'claimed'].includes(existing.status)) return { status: 'invalid_state', currentStatus: existing.status };
  if (existing.optionId === targetOptionId) return { status: 'same_option', ticket: existing };

  const target = await prisma.option.findFirst({
    where: { id: targetOptionId, isActive: true },
    select: { id: true, name: true, emoji: true, clusterKeys: true, discordCategoryId: true },
  });
  if (!target) return { status: 'target_not_found' };

  const scopes = String(target.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
  if (existing.clusterKey && !scopes.includes('*') && !scopes.includes(existing.clusterKey)) {
    return { status: 'cluster_mismatch', clusterKey: existing.clusterKey, target };
  }

  const safeReason = reason ? cleanString(reason, { max: 500 }) : null;
  const safeSource = ['discord', 'dashboard', 'api'].includes(String(source)) ? String(source) : 'api';
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id: existing.id, optionId: existing.optionId, status: { in: ['open', 'claimed'] } },
        data: {
          optionId: target.id,
          moveCount: { increment: 1 },
          lastMovedAt: now,
          lastMovedBy: actor.discordId,
          // Force AI to re-triage against the new queue/category. Keep aiSummary as long-term memory.
          aiTriage: '{}',
          aiTriageConfidence: null,
          aiEvidenceScore: null,
          aiNeedsHuman: false,
          aiMissingInfo: '[]',
          aiLastTriageAt: null,
          aiLastIntent: null,
        },
      });
      if (changed.count !== 1) return null;

      const move = await tx.ticketMove.create({
        data: {
          ticketId: existing.id,
          fromOptionId: existing.optionId || null,
          fromOptionName: existing.option?.name || null,
          toOptionId: target.id,
          toOptionName: target.name,
          fromCategoryId: fromCategoryId || null,
          toCategoryId: toCategoryId || null,
          movedById: actor.discordId,
          movedByName: actor.username,
          reason: safeReason,
          source: safeSource,
          createdAt: now,
        },
      });
      const ticket = await tx.ticket.findUnique({ where: { id: existing.id }, include: TICKET_INCLUDE });
      return { ticket, move };
    });
    if (!result) return { status: 'conflict' };
    return { status: 'ok', ...result, previousOption: existing.option, targetOption: target };
  } catch (error) {
    // Concurrent moves can race on the optionId guard; surface as a retryable conflict.
    if (/locked|busy/i.test(String(error?.message || ''))) return { status: 'conflict' };
    throw error;
  }
}

export function splitDiscordMessage(content, { prefix = '', maxLength = 2000 } = {}) {
  const text = String(content || '');
  if (!text) return [];
  if (prefix.length >= maxLength) throw new ValidationError('Prefix Discord quá dài');
  const firstMax = maxLength - prefix.length;
  const chunks = [];
  let remaining = text;
  let limit = firstMax;
  while (remaining.length) {
    if (remaining.length <= limit) {
      chunks.push((chunks.length === 0 ? prefix : '') + remaining);
      break;
    }
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < Math.floor(limit * 0.5)) cut = remaining.lastIndexOf(' ', limit);
    if (cut < Math.floor(limit * 0.5)) cut = limit;
    const part = remaining.slice(0, cut).trimEnd();
    chunks.push((chunks.length === 0 ? prefix : '') + part);
    remaining = remaining.slice(cut).trimStart();
    limit = maxLength;
    if (chunks.length >= 10 && remaining.length) {
      throw new ValidationError('Nội dung reply quá dài; tối đa 20.000 ký tự');
    }
  }
  return chunks;
}

function markdownText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()#+.!|>~-])/g, '\\$1')
    .replace(/\r/g, '');
}

function markdownTableText(value) {
  return markdownText(value).replace(/\n/g, '<br>');
}

function safeAttachmentUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseAttachments(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function renderTicketMarkdown(ticket, { includeInternal = false } = {}) {
  const messages = (ticket.messages || []).filter((message) => includeInternal || !message.isInternal);
  const num = String(ticket.ticketNum).padStart(4, '0');
  const lines = [];
  const fmt = (date) => date ? new Date(date).toLocaleString('vi-VN') : '—';

  lines.push(`# 🎫 Ticket #${num}`, '');
  lines.push(`> **Trạng thái**: \`${markdownText(ticket.status)}\` · **Priority**: \`${markdownText(ticket.priority)}\``);
  if (ticket.tags) {
    const tags = cleanStringArray(ticket.tags, { maxItems: 30, maxLength: 40 });
    if (tags.length) lines.push(`> **Tags**: ${tags.map((tag) => `\`${markdownText(tag)}\``).join(', ')}`);
  }
  lines.push('', '## 📋 Thông tin', '', '| | |', '|---|---|');
  lines.push(`| **Loại** | ${markdownTableText(ticket.option ? `${ticket.option.emoji || ''} ${ticket.option.name}` : '—')} |`);
  lines.push(`| **Người tạo** | ${markdownTableText(ticket.creatorName)} (\`${markdownText(ticket.creatorId)}\`) |`);
  lines.push(`| **Staff** | ${markdownTableText(ticket.claimerName || '—')}${ticket.claimerId ? ` (\`${markdownText(ticket.claimerId)}\`)` : ''} |`);
  lines.push(`| **Channel** | \`${markdownText(ticket.channelId || '—')}\` |`);
  lines.push(`| **Mở lúc** | ${fmt(ticket.openedAt)} |`);
  if (ticket.claimedAt) lines.push(`| **Claim lúc** | ${fmt(ticket.claimedAt)} |`);
  if (ticket.firstResponseAt) lines.push(`| **First response** | ${fmt(ticket.firstResponseAt)} |`);
  if (ticket.closedAt) lines.push(`| **Đóng lúc** | ${fmt(ticket.closedAt)} |`);
  if (ticket.closedBy) lines.push(`| **Đóng bởi** | \`${markdownText(ticket.closedBy)}\` |`);
  if (ticket.closeReason) lines.push(`| **Lý do đóng** | ${markdownTableText(ticket.closeReason)} |`);
  lines.push(`| **Số tin nhắn** | ${Number(ticket.messageCount || messages.length || 0)} |`, '');

  if (ticket.formData && ticket.formData !== '{}') {
    try {
      const data = JSON.parse(ticket.formData);
      const entries = Array.isArray(data) ? data : Object.values(data || {});
      if (entries.length) {
        lines.push('## 📝 Thông tin user cung cấp', '');
        for (const field of entries.slice(0, 50)) {
          lines.push(`### ${markdownText(field?.label || 'Trường')}`, '', markdownText(field?.value || '_(trống)_'), '');
        }
      }
    } catch { /* ignore malformed legacy formData */ }
  }

  if (includeInternal && ticket.note) {
    lines.push('## 📝 Ghi chú nội bộ (staff only)', '');
    lines.push(String(ticket.note).split('\n').map((line) => `> ${markdownText(line)}`).join('\n'), '');
  }

  lines.push('---', '', `## 💬 Transcript (${messages.length} tin nhắn)`, '');
  for (const message of messages) {
    const flags = `${message.isBot ? ' `[BOT]`' : ''}${message.isInternal ? ' `[NOTE NỘI BỘ]`' : ''}`;
    lines.push(`### **${markdownText(message.authorName)}**${flags} · ${fmt(message.timestamp)}`, '');
    if (message.content) {
      lines.push(String(message.content).split('\n').map((line) => `> ${markdownText(line)}`).join('\n'), '');
    }
    for (const attachment of parseAttachments(message.attachments)) {
      const url = safeAttachmentUrl(attachment?.url || attachment?.image || attachment?.thumbnail);
      if (!url) continue;
      lines.push(`📎 [${markdownText(attachment?.name || attachment?.title || 'attachment')}](${url})`);
    }
    if (parseAttachments(message.attachments).length) lines.push('');
  }
  lines.push('---', '', `_Exported at ${new Date().toLocaleString('vi-VN')}_`);
  return lines.join('\n');
}

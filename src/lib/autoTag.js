// Auto-tag rules engine — match keywords trong content/formData → apply tag
import { prisma } from './db.js';

/**
 * Áp dụng auto-tag rules cho 1 ticket. Quét text từ formData + content nếu có.
 * Fire-and-forget — không bao giờ throw.
 */
export async function applyAutoTagRules(ticketId, formData = null, extraText = '') {
  try {
    const rules = await prisma.autoTagRule.findMany({ where: { enabled: true } });
    if (rules.length === 0) return;

    // Build text để match
    let text = extraText || '';
    if (formData && typeof formData === 'object') {
      for (const v of Object.values(formData)) {
        text += ' ' + (v?.value || '');
      }
    }
    text = text.toLowerCase();
    if (!text.trim()) return;

    const matchedTags = new Set();
    for (const rule of rules) {
      const keywords = (rule.keywords || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (keywords.length === 0) continue;

      const matched = rule.matchAll
        ? keywords.every((k) => text.includes(k))
        : keywords.some((k) => text.includes(k));

      if (matched) matchedTags.add(rule.tag);
    }

    if (matchedTags.size === 0) return;

    // Merge với tag hiện có
    const existing = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { tags: true } });
    const current = (existing?.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const merged = Array.from(new Set([...current, ...matchedTags]));

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { tags: merged.join(',') },
    });
  } catch (err) {
    console.error('[AUTO-TAG ERROR]', err.message);
  }
}

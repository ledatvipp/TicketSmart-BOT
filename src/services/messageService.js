import { prisma } from '../lib/db.js';

export const MessageActorType = Object.freeze({
  USER: 'user',
  STAFF: 'staff',
  BOT: 'bot',
  INTERNAL: 'internal',
  OTHER: 'other',
});

export function isPrismaUniqueViolation(error) {
  return error?.code === 'P2002';
}

function activityData(actorType, timestamp) {
  if (actorType === MessageActorType.USER) {
    return { workflowStatus: 'waiting_staff' };
  }
  if (actorType === MessageActorType.STAFF) {
    return { workflowStatus: 'waiting_user' };
  }
  return {};
}

async function applyTicketActivity(tx, { ticketId, timestamp, actorType, incrementCount }) {
  if (incrementCount) {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { messageCount: { increment: 1 } },
    });
  }

  // Internal notes are counted but must not change customer-facing SLA/activity state.
  if (actorType === MessageActorType.INTERNAL) return;

  await tx.ticket.updateMany({
    where: {
      id: ticketId,
      OR: [{ lastMessageAt: null }, { lastMessageAt: { lte: timestamp } }],
    },
    data: { lastMessageAt: timestamp, ...activityData(actorType, timestamp) },
  });

  if (actorType === MessageActorType.USER) {
    await tx.ticket.updateMany({
      where: {
        id: ticketId,
        OR: [{ lastUserMessageAt: null }, { lastUserMessageAt: { lt: timestamp } }],
      },
      data: { lastUserMessageAt: timestamp },
    });
  }

  if (actorType === MessageActorType.STAFF) {
    await tx.ticket.updateMany({
      where: {
        id: ticketId,
        OR: [{ lastStaffMessageAt: null }, { lastStaffMessageAt: { lt: timestamp } }],
      },
      data: { lastStaffMessageAt: timestamp },
    });
    // Historical sync or a race may deliver the true first staff reply after a newer one.
    await tx.ticket.updateMany({
      where: {
        id: ticketId,
        OR: [{ firstResponseAt: null }, { firstResponseAt: { gt: timestamp } }],
      },
      data: { firstResponseAt: timestamp },
    });
  }
}

/**
 * Persist one message together with all ticket aggregates.
 *
 * `canonicalizeDuplicate` is intended for dashboard replies. Discord's gateway
 * logger may win the race and first store the bot-authored representation of
 * the same Discord message. In that case we replace only the existing row from
 * the same ticket and re-apply staff activity without incrementing the count.
 */
export async function persistTicketMessage(data, {
  actorType = MessageActorType.OTHER,
  canonicalizeDuplicate = false,
} = {}) {
  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data });
      await applyTicketActivity(tx, {
        ticketId: data.ticketId,
        timestamp: data.timestamp,
        actorType,
        incrementCount: true,
      });
      return created;
    });
    return { message, inserted: true, canonicalized: false };
  } catch (error) {
    if (!isPrismaUniqueViolation(error) || !data.discordMessageId) throw error;
    if (!canonicalizeDuplicate) return { message: null, inserted: false, canonicalized: false };

    return prisma.$transaction(async (tx) => {
      const existing = await tx.message.findUnique({
        where: { discordMessageId: data.discordMessageId },
      });
      if (!existing) {
        // A concurrent transaction may have rolled back after the unique error.
        // Retry once through the normal create path outside this transaction.
        return { retry: true };
      }
      if (existing.ticketId !== data.ticketId) {
        const conflict = new Error('Discord message ID đã thuộc ticket khác');
        conflict.code = 'MESSAGE_TICKET_CONFLICT';
        throw conflict;
      }

      const updated = await tx.message.update({
        where: { id: existing.id },
        data: {
          authorId: data.authorId,
          authorName: data.authorName,
          authorAvatar: data.authorAvatar,
          isBot: data.isBot,
          isInternal: data.isInternal,
          content: data.content,
          attachments: data.attachments,
          timestamp: data.timestamp,
        },
      });
      await applyTicketActivity(tx, {
        ticketId: data.ticketId,
        timestamp: data.timestamp,
        actorType,
        incrementCount: false,
      });
      return { message: updated, inserted: false, canonicalized: true };
    }).then(async (result) => {
      if (!result?.retry) return result;
      // A very narrow retry path; if another writer wins again the normal
      // duplicate result is returned rather than over-counting.
      return persistTicketMessage(data, { actorType, canonicalizeDuplicate: false });
    });
  }
}

import { prisma } from '../../lib/db.js';

function safeString(value, max = 2000) {
  return String(value ?? '').slice(0, max);
}

export async function createDetection(req, res) {
  try {
    const {
      guildId, channelId, messageId, userId, content,
      intentKey, confidence, source, action,
      optionId, clusterKey = null, status = 'detected', latencyMs = 0, metadata = {},
    } = req.body;

    if (!guildId || !channelId || !userId || !intentKey || !source || !action) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu detection bắt buộc' });
    }

    const detection = await prisma.intentDetection.upsert({
      where: { messageId: messageId || '__missing__' },
      update: {
        intentKey: safeString(intentKey, 80),
        confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
        source: safeString(source, 32),
        action: safeString(action, 64),
        optionId: optionId || null,
        clusterKey: clusterKey ? safeString(clusterKey, 40) : null,
        status: safeString(status, 32),
        latencyMs: Math.max(0, Number.parseInt(latencyMs, 10) || 0),
        metadata: JSON.stringify(metadata || {}),
      },
      create: {
        guildId: safeString(guildId, 32),
        channelId: safeString(channelId, 32),
        messageId: messageId || null,
        userId: safeString(userId, 32),
        content: safeString(content, 2000),
        intentKey: safeString(intentKey, 80),
        confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
        source: safeString(source, 32),
        action: safeString(action, 64),
        optionId: optionId || null,
        clusterKey: clusterKey ? safeString(clusterKey, 40) : null,
        status: safeString(status, 32),
        latencyMs: Math.max(0, Number.parseInt(latencyMs, 10) || 0),
        metadata: JSON.stringify(metadata || {}),
      },
    });

    res.status(201).json({ success: true, data: detection });
  } catch (error) {
    console.error('[INTELLIGENCE DETECTION]', error);
    res.status(500).json({ success: false, message: 'Không lưu được intent detection' });
  }
}

export async function updateDetectionStatus(req, res) {
  try {
    const { status, optionId, clusterKey, metadata } = req.body;
    const data = {};
    if (status !== undefined) data.status = safeString(status, 32);
    if (optionId !== undefined) data.optionId = optionId || null;
    if (clusterKey !== undefined) data.clusterKey = clusterKey ? safeString(clusterKey, 40) : null;
    if (metadata !== undefined) data.metadata = JSON.stringify(metadata || {});

    const detection = await prisma.intentDetection.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, data: detection });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Không tìm thấy detection' });
  }
}

export async function submitFeedback(req, res) {
  try {
    const { detectionId, userId, helpful, correctedIntent, note } = req.body;
    if (!detectionId || !userId) {
      return res.status(400).json({ success: false, message: 'Thiếu detectionId/userId' });
    }

    const detection = await prisma.intentDetection.findUnique({ where: { id: detectionId } });
    if (!detection) return res.status(404).json({ success: false, message: 'Detection không tồn tại' });
    if (detection.userId !== userId) return res.status(403).json({ success: false, message: 'Không phải feedback của bạn' });

    const previous = await prisma.smartFeedback.findUnique({ where: { detectionId } });
    const normalizedHelpful = helpful === null || helpful === undefined ? null : Boolean(helpful);
    const feedback = await prisma.smartFeedback.upsert({
      where: { detectionId },
      update: {
        helpful: normalizedHelpful,
        correctedIntent: correctedIntent ? safeString(correctedIntent, 80) : null,
        note: note ? safeString(note, 500) : null,
      },
      create: {
        detectionId,
        userId,
        helpful: normalizedHelpful,
        correctedIntent: correctedIntent ? safeString(correctedIntent, 80) : null,
        note: note ? safeString(note, 500) : null,
      },
    });

    try {
      const metadata = JSON.parse(detection.metadata || '{}');
      const articleId = Array.isArray(metadata.knowledgeArticleIds) ? metadata.knowledgeArticleIds[0] : null;
      if (articleId && previous?.helpful !== normalizedHelpful) {
        if (previous?.helpful === true) {
          await prisma.knowledgeArticle.updateMany({ where: { id: articleId, helpfulCount: { gt: 0 } }, data: { helpfulCount: { decrement: 1 } } });
        } else if (previous?.helpful === false) {
          await prisma.knowledgeArticle.updateMany({ where: { id: articleId, unhelpfulCount: { gt: 0 } }, data: { unhelpfulCount: { decrement: 1 } } });
        }
        if (normalizedHelpful === true) {
          await prisma.knowledgeArticle.update({ where: { id: articleId }, data: { helpfulCount: { increment: 1 } } }).catch(() => {});
        } else if (normalizedHelpful === false) {
          await prisma.knowledgeArticle.update({ where: { id: articleId }, data: { unhelpfulCount: { increment: 1 } } }).catch(() => {});
        }
        const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } }).catch(() => null);
        if (article) {
          const totalVotes = article.helpfulCount + article.unhelpfulCount;
          const qualityScore = totalVotes ? article.helpfulCount / totalVotes : 1;
          const needsReview = article.unhelpfulCount >= 3 && qualityScore < 0.65;
          await prisma.knowledgeArticle.update({
            where: { id: article.id },
            data: {
              qualityScore,
              ...(needsReview ? { status: 'REVIEW_REQUIRED', reviewDueAt: new Date() } : {}),
            },
          }).catch(() => {});
        }
      }
    } catch { /* metadata cũ hoặc article đã xóa */ }

    res.json({ success: true, data: feedback });
  } catch (error) {
    console.error('[INTELLIGENCE FEEDBACK]', error);
    res.status(500).json({ success: false, message: 'Không lưu được feedback' });
  }
}

export async function searchFaqsForBot(req, res) {
  try {
    const terms = String(req.query.q || '')
      .split('|')
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 8);

    const where = { enabled: true };
    if (terms.length) {
      where.OR = terms.flatMap((term) => [
        { title: { contains: term } },
        { keywords: { contains: term } },
        { content: { contains: term } },
        { category: { contains: term } },
      ]);
    }

    const faqs = await prisma.faq.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { views: 'desc' }],
      take: 5,
    });

    res.json({ success: true, data: faqs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Không tìm được FAQ' });
  }
}


export async function getDetectionForBot(req, res) {
  try {
    const detection = await prisma.intentDetection.findUnique({ where: { id: req.params.id } });
    if (!detection) return res.status(404).json({ success: false, message: 'Detection không tồn tại' });
    res.json({ success: true, data: { ...detection, metadata: safeParse(detection.metadata) } });
  } catch {
    res.status(404).json({ success: false, message: 'Detection không tồn tại' });
  }
}

export async function createActionExecution(req, res) {
  try {
    const { detectionId, actionName, userId, guildId, channelId, clusterKey = null, status = 'completed', input = {}, result = {}, error = null, latencyMs = 0 } = req.body;
    if (!actionName || !userId) return res.status(400).json({ success: false, message: 'Thiếu actionName/userId' });
    const item = await prisma.actionExecution.create({
      data: {
        detectionId: detectionId || null,
        actionName: safeString(actionName, 80),
        userId: safeString(userId, 32),
        guildId: guildId ? safeString(guildId, 32) : null,
        channelId: channelId ? safeString(channelId, 32) : null,
        clusterKey: clusterKey ? safeString(clusterKey, 40) : null,
        status: safeString(status, 32),
        input: JSON.stringify(input || {}),
        result: JSON.stringify(result || {}),
        error: error ? safeString(error, 1000) : null,
        latencyMs: Math.max(0, Number.parseInt(latencyMs, 10) || 0),
      },
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('[ACTION EXECUTION]', error);
    res.status(500).json({ success: false, message: 'Không lưu được action execution' });
  }
}



export async function approvedTrainingExamplesForBot(req, res) {
  try {
    const feedback = await prisma.smartFeedback.findMany({
      where: {
        approvedForTraining: true,
        OR: [{ correctedIntent: { not: null } }, { helpful: true }],
      },
      include: { detection: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const seen = new Set();
    const examples = [];
    for (const item of feedback) {
      const intentKey = item.correctedIntent || item.detection?.intentKey;
      const phrase = safeString(item.detection?.content, 500).trim();
      if (!intentKey || !phrase) continue;
      const key = `${intentKey}:${phrase.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      examples.push({ intentKey: safeString(intentKey, 80), phrase, weight: item.correctedIntent ? 1 : 0.9 });
    }
    res.json({ success: true, data: examples.slice(0, 600) });
  } catch (error) {
    console.error('[TRAINING EXAMPLES]', error);
    res.status(500).json({ success: false, message: 'Không tải được ví dụ đã duyệt' });
  }
}

export async function getConversationForBot(req, res) {
  try {
    const guildId = safeString(req.query.guildId, 32);
    const channelId = safeString(req.query.channelId, 32);
    const userId = safeString(req.query.userId, 32);
    const limit = Math.min(12, Math.max(1, Number.parseInt(req.query.limit, 10) || 6));
    if (!guildId || !channelId || !userId) {
      return res.status(400).json({ success: false, message: 'Thiếu guildId/channelId/userId' });
    }

    const conversation = await prisma.smartConversation.findUnique({
      where: { guildId_channelId_userId: { guildId, channelId, userId } },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: limit } },
    });
    if (!conversation) return res.json({ success: true, data: null });
    if (conversation.expiresAt <= new Date()) {
      await prisma.smartConversation.delete({ where: { id: conversation.id } }).catch(() => {});
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: {
      ...conversation,
      context: safeParse(conversation.context),
      pendingIntents: safeParseArray(conversation.pendingIntents),
      messages: conversation.messages.reverse().map((item) => ({ ...item, metadata: safeParse(item.metadata) })),
    } });
  } catch (error) {
    console.error('[SMART CONVERSATION GET]', error);
    res.status(500).json({ success: false, message: 'Không tải được ngữ cảnh hội thoại' });
  }
}

export async function upsertConversationForBot(req, res) {
  try {
    const {
      guildId, channelId, userId, status = 'active', context = {}, pendingIntents = [],
      lastIntentKey = null, lastDetectionId = null, clusterKey = null, ttlMinutes = 15, maxMessages = 6,
      messages = [],
    } = req.body;
    if (!guildId || !channelId || !userId) {
      return res.status(400).json({ success: false, message: 'Thiếu guildId/channelId/userId' });
    }
    const normalizedTtl = Math.min(1440, Math.max(2, Number.parseInt(ttlMinutes, 10) || 15));
    const normalizedMax = Math.min(12, Math.max(2, Number.parseInt(maxMessages, 10) || 6));
    const expiresAt = new Date(Date.now() + normalizedTtl * 60_000);
    const safeMessages = (Array.isArray(messages) ? messages : []).slice(-4).map((item) => ({
      role: ['user', 'assistant', 'system'].includes(item?.role) ? item.role : 'user',
      content: safeString(item?.content, 2000),
      intentKey: item?.intentKey ? safeString(item.intentKey, 80) : null,
      metadata: JSON.stringify(item?.metadata || {}),
    })).filter((item) => item.content);

    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.smartConversation.upsert({
        where: { guildId_channelId_userId: {
          guildId: safeString(guildId, 32), channelId: safeString(channelId, 32), userId: safeString(userId, 32),
        } },
        update: {
          status: safeString(status, 32), context: JSON.stringify(context || {}),
          pendingIntents: JSON.stringify(Array.isArray(pendingIntents) ? pendingIntents.slice(0, 5) : []),
          lastIntentKey: lastIntentKey ? safeString(lastIntentKey, 80) : null,
          lastDetectionId: lastDetectionId || null,
          clusterKey: clusterKey ? safeString(clusterKey, 40) : null,
          expiresAt,
          turnCount: { increment: safeMessages.some((item) => item.role === 'user') ? 1 : 0 },
        },
        create: {
          guildId: safeString(guildId, 32), channelId: safeString(channelId, 32), userId: safeString(userId, 32),
          status: safeString(status, 32), context: JSON.stringify(context || {}),
          pendingIntents: JSON.stringify(Array.isArray(pendingIntents) ? pendingIntents.slice(0, 5) : []),
          lastIntentKey: lastIntentKey ? safeString(lastIntentKey, 80) : null,
          lastDetectionId: lastDetectionId || null, clusterKey: clusterKey ? safeString(clusterKey, 40) : null, expiresAt,
          turnCount: safeMessages.some((item) => item.role === 'user') ? 1 : 0,
        },
      });

      for (const item of safeMessages) {
        await tx.smartConversationMessage.create({ data: { conversationId: conversation.id, ...item } });
      }
      const stale = await tx.smartConversationMessage.findMany({
        where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' },
        skip: normalizedMax, select: { id: true },
      });
      if (stale.length) {
        await tx.smartConversationMessage.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
      }
      const kept = await tx.smartConversationMessage.findMany({
        where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' }, take: normalizedMax,
      });
      return { ...conversation, messages: kept };
    });

    res.json({ success: true, data: {
      ...result,
      context: safeParse(result.context),
      pendingIntents: safeParseArray(result.pendingIntents),
      messages: result.messages.map((item) => ({ ...item, metadata: safeParse(item.metadata) })),
    } });
  } catch (error) {
    console.error('[SMART CONVERSATION UPSERT]', error);
    res.status(500).json({ success: false, message: 'Không lưu được ngữ cảnh hội thoại' });
  }
}

export async function clearConversationForBot(req, res) {
  try {
    const { guildId, channelId, userId } = req.body;
    if (!guildId || !channelId || !userId) {
      return res.status(400).json({ success: false, message: 'Thiếu guildId/channelId/userId' });
    }
    await prisma.smartConversation.deleteMany({ where: {
      guildId: safeString(guildId, 32), channelId: safeString(channelId, 32), userId: safeString(userId, 32),
    } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Không xóa được ngữ cảnh hội thoại' });
  }
}

export async function listConversations(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const where = req.query.status ? { status: String(req.query.status) } : {};
    const [total, items] = await Promise.all([
      prisma.smartConversation.count({ where }),
      prisma.smartConversation.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
    ]);
    res.json({ success: true, data: { total, items: items.map((item) => ({
      ...item, context: safeParse(item.context), pendingIntents: safeParseArray(item.pendingIntents),
    })) } });
  } catch {
    res.status(500).json({ success: false, message: 'Không tải được hội thoại' });
  }
}

export async function intelligenceOverview(req, res) {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [detections, feedback, helpful, actions, failedActions, knowledge, activeConversations, awaitingClarification] = await Promise.all([
      prisma.intentDetection.count({ where: { createdAt: { gte: since } } }),
      prisma.smartFeedback.count({ where: { createdAt: { gte: since } } }),
      prisma.smartFeedback.count({ where: { createdAt: { gte: since }, helpful: true } }),
      prisma.actionExecution.count({ where: { createdAt: { gte: since } } }),
      prisma.actionExecution.count({ where: { createdAt: { gte: since }, status: 'failed' } }),
      prisma.knowledgeArticle.count({ where: { enabled: true } }),
      prisma.smartConversation.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.smartConversation.count({ where: { status: 'awaiting_clarification', expiresAt: { gt: new Date() } } }),
    ]);
    const [byIntent, bySource, byAction] = await Promise.all([
      prisma.intentDetection.groupBy({ by: ['intentKey'], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { intentKey: 'desc' } }, take: 10 }),
      prisma.intentDetection.groupBy({ by: ['source'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.actionExecution.groupBy({ by: ['actionName'], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { actionName: 'desc' } }, take: 10 }),
    ]);
    res.json({ success: true, data: {
      periodDays: 30, detections, feedback, helpfulRate: feedback ? helpful / feedback : null,
      actions, failedActions, knowledge, activeConversations, awaitingClarification,
      byIntent: byIntent.map((x) => ({ key: x.intentKey, count: x._count._all })),
      bySource: bySource.map((x) => ({ key: x.source, count: x._count._all })),
      byAction: byAction.map((x) => ({ key: x.actionName, count: x._count._all })),
    } });
  } catch (error) {
    console.error('[INTELLIGENCE OVERVIEW]', error);
    res.status(500).json({ success: false, message: 'Không tải được thống kê AI' });
  }
}

export async function listDetections(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const where = {};
    if (req.query.intent) where.intentKey = String(req.query.intent);
    if (req.query.source) where.source = String(req.query.source);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.clusterKey) where.clusterKey = String(req.query.clusterKey);
    const [total, items] = await Promise.all([
      prisma.intentDetection.count({ where }),
      prisma.intentDetection.findMany({ where, include: { feedback: true }, orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
    ]);
    res.json({ success: true, data: { total, items: items.map((item) => ({ ...item, metadata: safeParse(item.metadata) })) } });
  } catch {
    res.status(500).json({ success: false, message: 'Không tải được detection' });
  }
}

export async function listActionExecutions(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const where = {};
    if (req.query.action) where.actionName = String(req.query.action);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.clusterKey) where.clusterKey = String(req.query.clusterKey);
    const [total, items] = await Promise.all([
      prisma.actionExecution.count({ where }),
      prisma.actionExecution.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
    ]);
    res.json({ success: true, data: { total, items: items.map((item) => ({ ...item, input: safeParse(item.input), result: safeParse(item.result) })) } });
  } catch {
    res.status(500).json({ success: false, message: 'Không tải được action logs' });
  }
}

export async function reviewFeedback(req, res) {
  try {
    const { correctedIntent, note, approvedForTraining } = req.body;
    const feedback = await prisma.smartFeedback.update({
      where: { id: req.params.id },
      data: {
        ...(correctedIntent !== undefined ? { correctedIntent: correctedIntent ? safeString(correctedIntent, 80) : null } : {}),
        ...(note !== undefined ? { note: note ? safeString(note, 500) : null } : {}),
        ...(approvedForTraining !== undefined ? { approvedForTraining: Boolean(approvedForTraining) } : {}),
      },
    });
    res.json({ success: true, data: feedback });
  } catch {
    res.status(404).json({ success: false, message: 'Feedback không tồn tại' });
  }
}

function safeParse(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function safeParseArray(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

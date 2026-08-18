// ========================
// API Utility
// Gọi Backend API qua axios, tự attach X-Bot-Secret header, cache config
// ========================

import axios from 'axios';
import logger from './logger.js';

const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    ...(process.env.BOT_API_SECRET ? { 'X-Bot-Secret': process.env.BOT_API_SECRET } : {}),
  },
});

// ========================
// Cache Config
// ========================
let configCache = null;
let configLastFetch = 0;
const CONFIG_TTL = 5 * 60 * 1000;

export async function loadConfig() {
  try {
    const response = await apiClient.get('/api/config');
    configCache = response.data;
    configLastFetch = Date.now();
    return configCache;
  } catch (error) {
    logger.error('Lỗi tải config:', error.message);
    throw error;
  }
}

export async function getConfig() {
  const now = Date.now();
  if (configCache && now - configLastFetch < CONFIG_TTL) return configCache;
  try {
    return await loadConfig();
  } catch (error) {
    if (configCache) {
      logger.warn('Đang dùng config cache cũ do lỗi API');
      return configCache;
    }
    throw error;
  }
}

export function clearConfigCache() {
  configCache = null;
  configLastFetch = 0;
}

// ========================
// Options
// ========================
export async function getOptions() {
  try {
    const response = await apiClient.get('/api/options');
    const allOptions = response.data.data || [];
    return allOptions.filter((opt) => opt.isActive);
  } catch (error) {
    logger.error('Lỗi lấy options:', error.message);
    throw error;
  }
}


// ========================
// Clusters
// ========================
let clusterCache = [];
let clusterFetchedAt = 0;
export async function getClusters({ active = true, force = false } = {}) {
  const now = Date.now();
  if (!force && clusterCache.length && now - clusterFetchedAt < 5 * 60_000) return clusterCache;
  try {
    const response = await apiClient.get('/api/clusters', { params: { active } });
    clusterCache = response.data.data || [];
    clusterFetchedAt = now;
    return clusterCache;
  } catch (error) {
    logger.warn('Không tải được danh sách cluster:', error.message);
    return clusterCache;
  }
}

// ========================
// Staff
// ========================
export async function getStaff() {
  try {
    const response = await apiClient.get('/api/staff');
    return response.data.data || [];
  } catch (error) {
    logger.error('Lỗi lấy danh sách staff:', error.message);
    return [];
  }
}


// ========================
// Tickets
// ========================

/** Tạo ticket. POST /api/tickets */
export async function createTicket(ticketData) {
  try {
    const response = await apiClient.post('/api/tickets', ticketData);
    logger.ticket('TẠO', response.data.data?.ticketNum, `bởi ${ticketData.creatorName}`);
    return response.data;
  } catch (error) {
    logger.error('Lỗi tạo ticket:', error.message);
    throw error;
  }
}

/** Cập nhật channelId. PATCH /api/tickets/:id/channel */
export async function updateTicketChannel(ticketId, channelId) {
  try {
    const response = await apiClient.patch(`/api/tickets/${ticketId}/channel`, { channelId });
    return response.data.data;
  } catch (error) {
    logger.error('Lỗi cập nhật channelId:', error.message);
    throw error;
  }
}


/** Hủy record ticket đang ở trạng thái creating khi Discord tạo channel thất bại. */
export async function cancelTicketCreation(ticketId, reason = '') {
  try {
    await apiClient.delete(`/api/tickets/${ticketId}/creation`, { data: { reason } });
  } catch (error) {
    logger.warn('Lỗi rollback ticket creation:', error.message);
  }
}

/** Lấy ticket theo channelId. GET /api/tickets/by-channel/:channelId */
export async function getTicketByChannel(channelId) {
  try {
    const response = await apiClient.get(`/api/tickets/by-channel/${channelId}`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    logger.error('Lỗi getTicketByChannel:', error.message);
    throw error;
  }
}

/** Recent ticket messages normalized into user/staff/assistant roles for AI context. */
export async function getTicketAiContext(channelId, limit = 8) {
  try {
    const response = await apiClient.get(`/api/tickets/by-channel/${channelId}/ai-context`, {
      params: { limit: Math.max(2, Math.min(20, Number(limit) || 8)) },
    });
    return response.data.data || { history: [] };
  } catch (error) {
    logger.warn('Không tải được ticket AI context:', error.message);
    return { history: [] };
  }
}

/** Claim. PATCH /api/tickets/by-channel/:channelId/claim */
export async function claimTicket(channelId, claimerId, claimerName) {
  try {
    const response = await apiClient.patch(`/api/tickets/by-channel/${channelId}/claim`, {}, {
      headers: { 'X-Bot-Actor': JSON.stringify({ discordId: claimerId, username: claimerName }) },
    });
    return response.data;
  } catch (error) {
    logger.error('Lỗi claim:', error.message);
    throw error;
  }
}

/** Close. PATCH /api/tickets/by-channel/:channelId/close */
export async function closeTicket(channelId, closedById, closedByName, payload = {}) {
  try {
    const response = await apiClient.patch(`/api/tickets/by-channel/${channelId}/close`, payload, {
      headers: { 'X-Bot-Actor': JSON.stringify({ discordId: closedById || 'bot', username: closedByName || 'Discord Bot' }) },
    });
    return response.data;
  } catch (error) {
    logger.error('Lỗi close:', error.message);
    throw error;
  }
}


/** Cập nhật trạng thái workflow/panel/AI của ticket theo channelId. */
export async function updateTicketWorkflow(channelId, payload = {}, actor = null) {
  try {
    const headers = actor ? { 'X-Bot-Actor': JSON.stringify(actor) } : undefined;
    const response = await apiClient.patch(`/api/tickets/by-channel/${channelId}/workflow`, payload, { headers });
    return response.data.data;
  } catch (error) {
    logger.warn('Lỗi cập nhật ticket workflow:', error.message);
    return null;
  }
}

/** Cập nhật priority qua endpoint workflow an toàn cho bot. */
export async function updateTicketPriorityByChannel(channelId, priority, actor = null) {
  return updateTicketWorkflow(channelId, { priority }, actor);
}

/** Chuyển ticket sang option/category khác và lưu routing history. */
export async function moveTicketByChannel(channelId, targetOptionId, actor, metadata = {}) {
  try {
    const headers = actor ? { 'X-Bot-Actor': JSON.stringify(actor) } : undefined;
    const response = await apiClient.patch(`/api/tickets/by-channel/${channelId}/move`, {
      targetOptionId,
      reason: metadata.reason || undefined,
      fromCategoryId: metadata.fromCategoryId || undefined,
      toCategoryId: metadata.toCategoryId || undefined,
    }, { headers });
    return response.data.data;
  } catch (error) {
    logger.error('Lỗi move ticket:', error.response?.data?.message || error.message);
    throw error;
  }
}

// ========================
// Messages
// ========================

/**
 * Append 1 message vào ticket. POST /api/messages
 * Idempotent qua discordMessageId.
 */
export async function appendMessage(channelId, msg) {
  try {
    await apiClient.post('/api/messages', { channelId, ...msg });
  } catch (error) {
    // 404 = channel không phải ticket → bỏ qua êm
    if (error.response?.status === 404) return;
    logger.warn('Lỗi appendMessage:', error.message);
  }
}

/** Bulk append (khi close lấy 100 message lần cuối) */
export async function appendMessagesBulk(channelId, messages) {
  try {
    await apiClient.post('/api/messages', { channelId, messages });
  } catch (error) {
    if (error.response?.status === 404) return;
    logger.warn('Lỗi appendMessagesBulk:', error.message);
  }
}


// ========================
// Smart Assistant / Intelligence
// ========================



let trainingExamplesCache = [];
let trainingExamplesFetchedAt = 0;
export async function getApprovedTrainingExamples() {
  const now = Date.now();
  if (now - trainingExamplesFetchedAt < 5 * 60_000) return trainingExamplesCache;
  try {
    const response = await apiClient.get('/api/intelligence/training-examples/bot');
    trainingExamplesCache = Array.isArray(response.data.data) ? response.data.data : [];
    trainingExamplesFetchedAt = now;
    return trainingExamplesCache;
  } catch (error) {
    logger.warn('Không tải được training examples:', error.message);
    return trainingExamplesCache;
  }
}

export async function getSmartConversation({ guildId, channelId, userId, limit = 6 }) {
  try {
    const response = await apiClient.get('/api/intelligence/conversations/context', {
      params: { guildId, channelId, userId, limit },
    });
    return response.data.data || null;
  } catch (error) {
    logger.warn('Không tải được hội thoại Smart Assistant:', error.message);
    return null;
  }
}

export async function saveSmartConversation(payload) {
  try {
    const response = await apiClient.post('/api/intelligence/conversations/context', payload);
    return response.data.data || null;
  } catch (error) {
    logger.warn('Không lưu được hội thoại Smart Assistant:', error.message);
    return null;
  }
}

export async function clearSmartConversation(payload) {
  try {
    await apiClient.delete('/api/intelligence/conversations/context', { data: payload });
    return true;
  } catch (error) {
    logger.warn('Không xóa được hội thoại Smart Assistant:', error.message);
    return false;
  }
}

export async function logIntentDetection(payload) {
  try {
    const response = await apiClient.post('/api/intelligence/detections', payload);
    return response.data.data;
  } catch (error) {
    logger.warn('Không lưu được intent detection:', error.message);
    return null;
  }
}

export async function updateIntentDetection(id, payload) {
  if (!id) return null;
  try {
    const response = await apiClient.patch(`/api/intelligence/detections/${id}`, payload);
    return response.data.data;
  } catch (error) {
    logger.warn('Không cập nhật được intent detection:', error.message);
    return null;
  }
}

export async function sendSmartFeedback(payload) {
  try {
    const response = await apiClient.post('/api/intelligence/feedback', payload);
    return response.data.data;
  } catch (error) {
    logger.warn('Không lưu được smart feedback:', error.message);
    return null;
  }
}

export async function searchSmartFaqs(terms = []) {
  try {
    const q = (Array.isArray(terms) ? terms : [terms]).filter(Boolean).join('|');
    const response = await apiClient.get('/api/intelligence/faqs', { params: { q } });
    return response.data.data || [];
  } catch (error) {
    logger.warn('Không tải được FAQ cho Smart Assistant:', error.message);
    return [];
  }
}


export async function searchKnowledgeBase(query, { limit = 3, threshold = 0.3, embeddings = true, clusterKey = null } = {}) {
  try {
    const response = await apiClient.get('/api/knowledge/bot/search', {
      params: { q: query, limit, threshold, embeddings, clusterKey },
    });
    return response.data.data || { results: [], embeddingUsed: false };
  } catch (error) {
    logger.warn('Không tìm được Knowledge Base:', error.message);
    return { results: [], embeddingUsed: false, embeddingError: error.message };
  }
}

export async function getIntentDetection(id) {
  if (!id || id === 'none') return null;
  try {
    const response = await apiClient.get(`/api/intelligence/detections/${id}/bot`);
    return response.data.data;
  } catch (error) {
    logger.warn('Không tải được intent detection:', error.message);
    return null;
  }
}

export async function logActionExecution(payload) {
  try {
    const response = await apiClient.post('/api/intelligence/actions', payload);
    return response.data.data;
  } catch (error) {
    logger.warn('Không lưu được action execution:', error.message);
    return null;
  }
}


// ========================
// SmartLearn / Human Knowledge Review
// ========================
export async function createSmartLearnCandidate(payload) {
  try {
    const response = await apiClient.post('/api/smartlearn/candidates/bot', payload);
    return response.data.data || null;
  } catch (error) {
    logger.warn('Không tạo được SmartLearn candidate:', error.message);
    return null;
  }
}

export async function getSmartLearnCandidate(id) {
  if (!id) return null;
  try {
    const response = await apiClient.get(`/api/smartlearn/candidates/${id}/bot`);
    return response.data.data || null;
  } catch (error) {
    logger.warn('Không tải được SmartLearn candidate:', error.message);
    return null;
  }
}

export async function saveSmartLearnDeliveryRefs(id, refs = []) {
  try {
    const response = await apiClient.patch(`/api/smartlearn/candidates/${id}/delivery/bot`, { refs });
    return response.data.data || null;
  } catch (error) {
    logger.warn('Không lưu được SmartLearn delivery refs:', error.message);
    return null;
  }
}

export async function reviewSmartLearnCandidate(id, payload) {
  try {
    const { reviewerId, reviewerName, isAdmin, ...review } = payload || {};
    const response = await apiClient.post(`/api/smartlearn/candidates/${id}/review/bot`, review, {
      headers: {
        'X-Bot-Actor': JSON.stringify({
          discordId: reviewerId,
          username: reviewerName || reviewerId,
          isAdmin: Boolean(isAdmin),
        }),
      },
    });
    return response.data.data || null;
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    logger.warn('Không review được SmartLearn candidate:', message);
    throw new Error(message);
  }
}

export default apiClient;

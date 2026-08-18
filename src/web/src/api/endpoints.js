// Tập trung tất cả API calls — UI chỉ import từ đây
import client from './client';

export const TicketsAPI = {
  list: (params) => client.get('/api/tickets', { params }).then((r) => r.data.data),
  get: (id) => client.get(`/api/tickets/${id}`).then((r) => r.data.data),
  close: (id, data = {}) => client.patch(`/api/tickets/${id}/close`, data).then((r) => r.data.data),
  reply: (id, content) => client.post(`/api/tickets/${id}/reply`, { content }).then((r) => r.data),
  claim: (id) => client.patch(`/api/tickets/${id}/claim`, {}).then((r) => r.data.data),
  setPriority: (id, priority) => client.patch(`/api/tickets/${id}/priority`, { priority }).then((r) => r.data.data),
  setNote: (id, note) => client.patch(`/api/tickets/${id}/note`, { note }).then((r) => r.data.data),
  setTags: (id, tags) => client.patch(`/api/tickets/${id}/tags`, { tags }).then((r) => r.data.data),
  updateWorkflow: (id, data) => client.patch(`/api/tickets/${id}/workflow`, data).then((r) => r.data.data),
  moves: (id) => client.get(`/api/tickets/${id}/moves`).then((r) => r.data.data),
  bulk: (ids, action, value) => client.post('/api/tickets/bulk', { ids, action, value }).then((r) => r.data.data),
  transcriptUrl: (id) => `/api/tickets/${encodeURIComponent(id)}/transcript.md`,
  downloadTranscript: async (id, includeInternal = false) => {
    const response = await client.get(`/api/tickets/${encodeURIComponent(id)}/transcript.md`, {
      params: { includeInternal: includeInternal ? 'true' : undefined }, responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ticket-${id}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },
};

export const CannedAPI = {
  list:   ()       => client.get('/api/canned').then((r) => r.data.data),
  create: (data)   => client.post('/api/canned', data).then((r) => r.data.data),
  update: (id, d)  => client.put(`/api/canned/${id}`, d).then((r) => r.data.data),
  remove: (id)     => client.delete(`/api/canned/${id}`).then((r) => r.data),
};

export const RatingsAPI = {
  list:    (params)    => client.get('/api/ratings', { params }).then((r) => r.data.data),
  byStaff: ()          => client.get('/api/ratings/by-staff').then((r) => r.data.data),
};

export const FaqAPI = {
  list:    (params)    => client.get('/api/faqs', { params }).then((r) => r.data.data),
  get:     (id)        => client.get(`/api/faqs/${id}`).then((r) => r.data.data),
  create:  (d)         => client.post('/api/faqs', d).then((r) => r.data.data),
  update:  (id, d)     => client.put(`/api/faqs/${id}`, d).then((r) => r.data.data),
  remove:  (id)        => client.delete(`/api/faqs/${id}`).then((r) => r.data),
  similar: (ticketId)  => client.get(`/api/faqs/similar/${ticketId}`).then((r) => r.data.data),
};

export const WebhooksAPI = {
  list: () => client.get('/api/webhooks').then((r) => r.data.data),
  create: (data) => client.post('/api/webhooks', data).then((r) => r.data.data),
  update: (id, data) => client.put(`/api/webhooks/${id}`, data).then((r) => r.data.data),
  remove: (id) => client.delete(`/api/webhooks/${id}`).then((r) => r.data),
  rotateSecret: (id) => client.post(`/api/webhooks/${id}/rotate-secret`).then((r) => r.data.data),
  deliveries: (id, params = {}) => client.get(`/api/webhooks/${id}/deliveries`, { params }).then((r) => r.data.data),
  replay: (deliveryId) => client.post(`/api/webhooks/deliveries/${deliveryId}/replay`).then((r) => r.data.data),
};

export const AutoTagAPI = {
  list:   ()    => client.get('/api/autotag').then((r) => r.data.data),
  create: (d)   => client.post('/api/autotag', d).then((r) => r.data.data),
  update: (i,d) => client.put(`/api/autotag/${i}`, d).then((r) => r.data.data),
  remove: (i)   => client.delete(`/api/autotag/${i}`).then((r) => r.data),
};

export const MessagesAPI = {
  list: (ticketId, includeInternal = false) => client.get('/api/messages', { params: { ticketId, limit: 2000, includeInternal } }).then((r) => r.data.data),
  addInternal: (ticketId, content) => client.post('/api/messages/internal', { ticketId, content }).then((r) => r.data.data),
};

export const OptionsAPI = {
  list: () => client.get('/api/options').then((r) => r.data.data),
  get: (id) => client.get(`/api/options/${id}`).then((r) => r.data.data),
  create: (data) => client.post('/api/options', data).then((r) => r.data.data),
  update: (id, data) => client.put(`/api/options/${id}`, data).then((r) => r.data.data),
  remove: (id) => client.delete(`/api/options/${id}`).then((r) => r.data),
  toggle: (id) => client.patch(`/api/options/${id}/toggle`).then((r) => r.data.data),
};


export const ClustersAPI = {
  list: (params = {}) => client.get('/api/clusters', { params }).then((r) => r.data.data),
  create: (data) => client.post('/api/clusters', data).then((r) => r.data.data),
  update: (id, data) => client.put(`/api/clusters/${id}`, data).then((r) => r.data.data),
  remove: (id) => client.delete(`/api/clusters/${id}`).then((r) => r.data),
  toggle: (id) => client.patch(`/api/clusters/${id}/toggle`).then((r) => r.data.data),
};

export const StaffAPI = {
  list: () => client.get('/api/staff').then((r) => r.data.data),
  add: (data) => client.post('/api/staff', data).then((r) => r.data.data),
  remove: (discordId) => client.delete(`/api/staff/${discordId}`).then((r) => r.data),
  leaderboard: () => client.get('/api/staff/leaderboard').then((r) => r.data.data),
  updateAccess: (discordId, data) => client.patch(`/api/staff/${discordId}/role`, data).then((r) => r.data.data),
};

export const ConfigAPI = {
  get: () => client.get('/api/config').then((r) => r.data.data),
  update: (data) => client.put('/api/config', data).then((r) => r.data.data),
  aiProvider: () => client.get('/api/config/ai-provider').then((r) => r.data.data),
  setOpenRouterKey: (apiKey) => client.put('/api/config/ai-provider/key', { apiKey }).then((r) => r.data.data),
  deleteOpenRouterKey: () => client.delete('/api/config/ai-provider/key').then((r) => r.data.data),
  testOpenRouter: (data = {}) => client.post('/api/config/ai-provider/test', data).then((r) => r.data.data),
  playgroundOpenRouter: (data = {}) => client.post('/api/config/ai-provider/playground', data).then((r) => r.data.data),
  publishSetup: (data) => client.post('/api/config/setup-message', data).then((r) => r.data.data),
  sendAnnouncement: (data) => client.post('/api/config/announcement', data).then((r) => r.data.data),
  publicConfig: () => client.get('/api/config/public').then((r) => r.data),
};

export const StatsAPI = {
  overview:      ()       => client.get('/api/stats/overview').then((r) => r.data.data),
  chart:         (days=7) => client.get('/api/stats/chart', { params: { days } }).then((r) => r.data.data),
  byOption:      ()       => client.get('/api/stats/by-option').then((r) => r.data.data),
  heatmap:       (days=30)=> client.get('/api/stats/heatmap', { params: { days } }).then((r) => r.data.data),
  topRequesters: (limit=10)=> client.get('/api/stats/top-requesters', { params: { limit } }).then((r) => r.data.data),
  distribution: ()        => client.get('/api/stats/distribution').then((r) => r.data.data),
  tagCloud:     ()        => client.get('/api/stats/tag-cloud').then((r) => r.data.data),
  moves:        (days=30) => client.get('/api/stats/moves', { params: { days } }).then((r) => r.data.data),
  downloadMoveCsv: (days=30) => client.get('/api/stats/moves/export.csv', { params: { days }, responseType: 'blob' }),
  downloadCsv:  (params = {}) => client.get('/api/stats/export.csv', { params, responseType: 'blob' }),
};

export const BannersAPI = {
  list: () => client.get('/api/banners').then((r) => r.data.data),
  create: (data) => client.post('/api/banners', data).then((r) => r.data.data),
  remove: (id) => client.delete(`/api/banners/${id}`).then((r) => r.data),
};

export const AuditAPI = {
  list: (params = {}) => client.get('/api/audit', { params }).then((r) => r.data.data),
};

export const AuthAPI = {
  loginWithCode: (code, state) => client.post('/api/auth/discord', { code, state }, { skipAuthRefresh: true, skipAccessToken: true }).then((r) => r.data.data),
  loginWithPassword: (username, password) => client.post('/api/auth/local', { username, password }, { skipAuthRefresh: true, skipAccessToken: true }).then((r) => r.data.data),
  me: () => client.get('/api/auth/me').then((r) => r.data.data),
  refresh: () => client.post('/api/auth/refresh', {}, { skipAuthRefresh: true, skipAccessToken: true }).then((r) => r.data.data),
  logout: () => client.post('/api/auth/logout', {}, { skipAuthRefresh: true }).then((r) => r.data),
  logoutAll: () => client.post('/api/auth/logout-all').then((r) => r.data),
};

export const KnowledgeAPI = {
  overview: () => client.get('/api/knowledge/overview').then((r) => r.data.data),
  list: (params = {}) => client.get('/api/knowledge', { params }).then((r) => r.data.data),
  get: (id) => client.get(`/api/knowledge/${id}`).then((r) => r.data.data),
  create: (data) => client.post('/api/knowledge', data).then((r) => r.data.data),
  update: (id, data) => client.put(`/api/knowledge/${id}`, data).then((r) => r.data.data),
  archive: (id) => client.post(`/api/knowledge/${id}/archive`).then((r) => r.data.data),
  restore: (id, revisionId) => client.post(`/api/knowledge/${id}/restore/${revisionId}`).then((r) => r.data.data),
  addAlias: (id, data) => client.post(`/api/knowledge/${id}/aliases`, data).then((r) => r.data.data),
  removeAlias: (id, aliasId) => client.delete(`/api/knowledge/${id}/aliases/${aliasId}`).then((r) => r.data),
  remove: (id) => client.delete(`/api/knowledge/${id}`).then((r) => r.data),
  search: (q, params = {}) => client.get('/api/knowledge/search', { params: { q, ...params } }).then((r) => r.data.data),
  reindexAll: () => client.post('/api/knowledge/reindex/all').then((r) => r.data.data),
  reindex: (id) => client.post(`/api/knowledge/reindex/${id}`).then((r) => r.data.data),
  importFaqs: () => client.post('/api/knowledge/import/faqs').then((r) => r.data.data),
};

export const IntelligenceAPI = {
  overview: () => client.get('/api/intelligence/overview').then((r) => r.data.data),
  detections: (params = {}) => client.get('/api/intelligence/detections', { params }).then((r) => r.data.data),
  actions: (params = {}) => client.get('/api/intelligence/actions', { params }).then((r) => r.data.data),
  conversations: (params = {}) => client.get('/api/intelligence/conversations', { params }).then((r) => r.data.data),
  reviewFeedback: (id, data) => client.patch(`/api/intelligence/feedback/${id}`, data).then((r) => r.data.data),
};


export const SmartLearnAPI = {
  overview: () => client.get('/api/smartlearn/overview').then((r) => r.data.data),
  list: (params = {}) => client.get('/api/smartlearn/candidates', { params }).then((r) => r.data.data),
  get: (id) => client.get(`/api/smartlearn/candidates/${id}`).then((r) => r.data.data),
  review: (id, data) => client.post(`/api/smartlearn/candidates/${id}/review`, data).then((r) => r.data.data),
};

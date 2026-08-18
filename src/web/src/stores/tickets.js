import { defineStore } from 'pinia';
import { TicketsAPI } from '../api/endpoints';
import { on } from '../socket';

const DEFAULT_FILTERS = {
  status: '', type: '', priority: '', search: '', tag: '',
  creatorId: '', claimerId: '', optionId: '', clusterKey: '',
  mineOnly: false, staleHours: '',
  sortBy: 'openedAt', sortDir: 'desc',
};

/**
 * Parse smart search syntax:
 *   "user:123456789"     → creatorId
 *   "staff:123456789"    → claimerId
 *   "tag:refund"         → tag
 *   "status:open"        → status
 *   "priority:urgent"    → priority
 *   "option:Bug"         → search by option name (fallback search)
 *   "is:mine"            → mineOnly
 *   "is:stale"           → staleHours=24
 *   "John payment lỗi"   → search (full-text)
 *
 * Trả về { search, ...filters } để merge vào store.filters
 */
export function parseSmartSearch(input) {
  const out = { search: '' };
  if (!input || !input.trim()) return out;

  const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const remaining = [];

  for (const raw of tokens) {
    const token = raw.replace(/^"|"$/g, '');
    const m = token.match(/^(user|staff|tag|status|priority|cluster|is):(.+)$/i);
    if (!m) {
      remaining.push(token);
      continue;
    }
    const [, key, value] = m;
    const k = key.toLowerCase();
    const v = value.trim();
    if (k === 'user')     out.creatorId = v;
    else if (k === 'staff') out.claimerId = v;
    else if (k === 'tag')   out.tag = v;
    else if (k === 'status' && ['open', 'claimed', 'closed'].includes(v.toLowerCase())) out.status = v.toLowerCase();
    else if (k === 'priority' && ['normal', 'high', 'urgent'].includes(v.toLowerCase())) out.priority = v.toLowerCase();
    else if (k === 'cluster') out.clusterKey = v.toLowerCase();
    else if (k === 'is') {
      if (v === 'mine') out.mineOnly = true;
      else if (v === 'stale') out.staleHours = '24';
    } else remaining.push(token);
  }

  out.search = remaining.join(' ').trim();
  return out;
}

export const useTickets = defineStore('tickets', {
  state: () => ({
    items: [],
    pagination: { total: 0, page: 1, limit: 25, totalPages: 1 },
    filters: { ...DEFAULT_FILTERS },
    selected: new Set(),
    loading: false,
    realtimeBound: false,
  }),

  getters: {
    selectedIds: (s) => Array.from(s.selected),
    hasSelection: (s) => s.selected.size > 0,
    allOnPageSelected: (s) => s.items.length > 0 && s.items.every((t) => s.selected.has(t.id)),
  },

  actions: {
    async fetch() {
      this.loading = true;
      try {
        const data = await TicketsAPI.list({
          page: this.pagination.page,
          limit: this.pagination.limit,
          ...this.filters,
        });
        this.items = data.tickets;
        this.pagination = data.pagination;
      } finally {
        this.loading = false;
      }
    },

    setFilter(key, value) {
      this.filters[key] = value;
      this.pagination.page = 1;
      this.fetch();
    },

    /** Smart search: parse input rồi apply nhiều filter cùng lúc */
    applySmartSearch(input) {
      const parsed = parseSmartSearch(input);
      // Reset các filter smart trước, giữ sort + page
      this.filters = {
        ...DEFAULT_FILTERS,
        sortBy: this.filters.sortBy,
        sortDir: this.filters.sortDir,
        ...parsed,
      };
      this.pagination.page = 1;
      this.fetch();
    },

    setFilters(partial) {
      Object.assign(this.filters, partial);
      this.pagination.page = 1;
      this.fetch();
    },

    resetFilters() {
      this.filters = { ...DEFAULT_FILTERS };
      this.pagination.page = 1;
      this.selected.clear();
      this.fetch();
    },

    setPage(p) {
      this.pagination.page = p;
      this.fetch();
    },

    setSort(col) {
      if (this.filters.sortBy === col) {
        this.filters.sortDir = this.filters.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.filters.sortBy = col;
        this.filters.sortDir = 'desc';
      }
      this.fetch();
    },

    toggleSelect(id) {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    },
    selectAllOnPage() {
      if (this.allOnPageSelected) {
        for (const t of this.items) this.selected.delete(t.id);
      } else {
        for (const t of this.items) this.selected.add(t.id);
      }
    },
    clearSelection() { this.selected.clear(); },

    async bulkClose() {
      const ids = this.selectedIds;
      if (!ids.length) return;
      await TicketsAPI.bulk(ids, 'close');
      this.clearSelection();
      await this.fetch();
    },
    async bulkPriority(value) {
      const ids = this.selectedIds;
      if (!ids.length) return;
      await TicketsAPI.bulk(ids, 'priority', value);
      this.clearSelection();
      await this.fetch();
    },

    /** Sync filters từ query string (gọi onMounted) */
    syncFromUrl(query) {
      const f = { ...DEFAULT_FILTERS };
      for (const k of Object.keys(f)) {
        if (query[k] !== undefined) {
          if (k === 'mineOnly') f[k] = query[k] === 'true';
          else f[k] = query[k];
        }
      }
      this.filters = f;
      this.pagination.page = parseInt(query.page) || 1;
    },

    /** Serialize filters thành object để push lên URL */
    toQuery() {
      const q = {};
      for (const [k, v] of Object.entries(this.filters)) {
        if (v && v !== false && v !== '') q[k] = v;
      }
      if (this.pagination.page > 1) q.page = this.pagination.page;
      return q;
    },

    bindRealtime() {
      if (this.realtimeBound) return;
      this.realtimeBound = true;

      on('ticket:created', (t) => {
        if (this.pagination.page === 1 && this.matchesFilter(t)) {
          this.items = [t, ...this.items].slice(0, this.pagination.limit);
        }
        this.pagination.total++;
      });
      on('ticket:updated', (t) => {
        const idx = this.items.findIndex((x) => x.id === t.id);
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...t };
      });
      on('ticket:closed', (t) => {
        const idx = this.items.findIndex((x) => x.id === t.id);
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...t };
      });
      on('ticket:claimed', (t) => {
        const idx = this.items.findIndex((x) => x.id === t.id);
        if (idx >= 0) this.items[idx] = { ...this.items[idx], ...t };
      });
    },

    matchesFilter(t) {
      const f = this.filters;
      if (f.status && t.status !== f.status) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.clusterKey && t.clusterKey !== f.clusterKey) return false;
      return true;
    },
  },
});

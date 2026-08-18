<script setup>
import { onMounted, computed, ref, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTickets } from '../stores/tickets';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import { TicketsAPI, ClustersAPI } from '../api/endpoints';
import StButton from '../components/StButton.vue';

const store = useTickets();
const toast = useToast();
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const clusters = ref([]);
const canClaim = computed(() => auth.hasPermission('ticket.claim'));
const canClose = computed(() => auth.hasPermission('ticket.close'));
const canBulk = computed(() => auth.hasPermission('ticket.bulk'));

const STATUS_LABEL = { open: 'Mở', claimed: 'Xử lý', closed: 'Đóng' };
const STATUS_BADGE = { open: 'badge-green', claimed: 'badge-yellow', closed: 'badge-gray' };
const PRIORITY_BADGE = { urgent: 'badge-red', high: 'badge-orange', normal: 'badge-gray' };

const pad4 = (n) => String(n).padStart(4, '0');

// ─── URL Sync ───────────────────────────────────────────────────────────
onMounted(async () => {
  clusters.value = await ClustersAPI.list({ active: true }).catch(() => []);
  store.syncFromUrl(route.query);
  store.fetch();
  store.bindRealtime();
});

let urlSyncTimer = null;
watch(() => [store.filters, store.pagination.page], () => {
  clearTimeout(urlSyncTimer);
  urlSyncTimer = setTimeout(() => {
    router.replace({ query: store.toQuery() }).catch(() => {});
  }, 100);
}, { deep: true });

// ─── Smart search with prefix syntax ────────────────────────────────────
// VD: "is:mine status:open payment lỗi" → mineOnly + status=open + search="payment lỗi"
const searchInput = ref(store.filters.search);
const searchHelpOpen = ref(false);
let searchTimer = null;
watch(searchInput, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.applySmartSearch(v), 320);
});

// ─── Quick filter chips ─────────────────────────────────────────────────
const chips = computed(() => [
  { key: 'all',    label: 'Tất cả',     match: !activeChip.value },
  { key: 'mine',   label: 'Của tôi',    match: store.filters.mineOnly },
  { key: 'open',   label: 'Đang mở',    match: store.filters.status === 'open' && !store.filters.mineOnly },
  { key: 'urgent', label: 'Khẩn',       match: store.filters.priority === 'urgent' },
  { key: 'stale',  label: 'Cũ 24h+',    match: store.filters.staleHours === '24' },
]);

const activeChip = computed(() => {
  if (store.filters.mineOnly) return 'mine';
  if (store.filters.priority === 'urgent') return 'urgent';
  if (store.filters.staleHours === '24') return 'stale';
  if (store.filters.status === 'open') return 'open';
  return null;
});

function applyChip(key) {
  // Reset rồi apply
  store.filters = {
    status: '', type: '', priority: '', search: store.filters.search, tag: '',
    creatorId: '', claimerId: '', optionId: '', clusterKey: '',
    mineOnly: false, staleHours: '', sortBy: 'openedAt', sortDir: 'desc',
  };
  if (key === 'mine')   store.filters.mineOnly = true;
  if (key === 'open')   store.filters.status = 'open';
  if (key === 'urgent') store.filters.priority = 'urgent';
  if (key === 'stale')  store.filters.staleHours = '24';
  store.pagination.page = 1;
  store.fetch();
}

// ─── Sort ───────────────────────────────────────────────────────────────
function sortIcon(col) {
  if (store.filters.sortBy !== col) return '';
  return store.filters.sortDir === 'asc' ? ' ↑' : ' ↓';
}

// ─── Actions ────────────────────────────────────────────────────────────
async function closeTicket(t) {
  if (!canClose.value) return;
  if (!confirm(`Đóng ticket #${pad4(t.ticketNum)}?`)) return;
  try {
    await TicketsAPI.close(t.id);
    toast.success(`Đã đóng #${pad4(t.ticketNum)}`);
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi');
  }
}

async function quickClaim(t) {
  if (!canClaim.value) return;
  try {
    await TicketsAPI.claim(t.id);
    toast.success(`Đã claim #${pad4(t.ticketNum)}`);
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi');
  }
}

async function bulkClose() {
  if (!canBulk.value) return;
  if (!confirm(`Đóng ${store.selected.size} ticket?`)) return;
  try {
    await store.bulkClose();
    toast.success(`Đã đóng ${store.selected.size || 'tất cả'} ticket`);
  } catch {
    toast.error('Lỗi bulk close');
  }
}

async function bulkPriority(p) {
  if (!canBulk.value) return;
  try {
    await store.bulkPriority(p);
    toast.success(`Đã set priority: ${p}`);
  } catch {
    toast.error('Lỗi');
  }
}

// ─── Pagination ─────────────────────────────────────────────────────────
const pageList = computed(() => {
  const total = store.pagination.totalPages;
  if (total <= 1) return [];
  const cur = store.pagination.page;
  // Smart page window
  const pages = new Set([1, total, cur, cur - 1, cur + 1]);
  return Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
});

// ─── Keyboard shortcuts ─────────────────────────────────────────────────
function onKey(e) {
  // Bỏ qua khi đang focus input
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (e.key === '/') {
    e.preventDefault();
    document.querySelector('input[data-search]')?.focus();
  } else if (e.key === 'r' && !e.ctrlKey) {
    store.fetch();
  } else if (e.key === 'Escape') {
    store.clearSelection();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// ─── Helpers ────────────────────────────────────────────────────────────
function timeSince(date) {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function getTags(t) {
  return (t.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
}
</script>

<template>
  <div class="page-header tickets-header">
    <div>
      <p class="eyebrow">Ticket queue</p>
      <h1 class="page-title">Tickets</h1>
      <p class="page-sub">
        {{ store.pagination.total }} tickets · realtime
        <span class="muted text-xs shortcut-help">
          <kbd>/</kbd> tìm · <kbd>r</kbd> refresh · <kbd>esc</kbd> bỏ chọn
        </span>
      </p>
    </div>
    <div class="flex gap-2">
      <StButton variant="ghost" @click="store.resetFilters">
        <span class="material-symbols-outlined symbol-sm">restart_alt</span> Reset
      </StButton>
      <StButton variant="ghost" @click="store.fetch">
        <span class="material-symbols-outlined symbol-sm">refresh</span> Refresh
      </StButton>
    </div>
  </div>

  <!-- Quick filter chips -->
  <div class="queue-toolbar">
    <div class="quick-chips">
    <button
      v-for="c in chips" :key="c.key"
      :class="['chip', { active: c.match }]"
      @click="applyChip(c.key)"
    >{{ c.label }}</button>
    </div>
  </div>

  <div class="filters filter-panel" style="position: relative;">
    <input
      data-search v-model="searchInput"
      placeholder='Smart search: "is:mine status:open payment" hoặc Discord ID...'
      style="min-width: 340px;"
      @focus="searchHelpOpen = true"
      @blur="setTimeout(() => searchHelpOpen = false, 200)"
    />
    <Transition name="route">
      <div v-if="searchHelpOpen" style="position: absolute; top: 100%; left: 0; margin-top: 6px; padding: 10px 14px; background: var(--surface-container-low); border: 1px solid var(--outline-variant); border-radius: var(--r-md); font-size: 11px; line-height: 1.7; z-index: 10; box-shadow: var(--shadow-md); min-width: 360px;">
        <div class="muted text-xs" style="margin-bottom: 4px; font-weight: 600;">💡 Smart search syntax:</div>
        <div><code>user:123456789</code> → tìm theo Discord ID người tạo</div>
        <div><code>staff:123456789</code> → tìm theo staff</div>
        <div><code>tag:refund</code> → tag chứa</div>
        <div><code>status:open</code> | <code>priority:urgent</code></div>
        <div><code>is:mine</code> → ticket của tôi · <code>is:stale</code> → cũ 24h+</div>
        <div class="muted text-xs mt-2">Text thường → tìm trong tên/tag/note/form data/message content</div>
      </div>
    </Transition>
    <select v-model="store.filters.status" @change="store.setFilter('status', store.filters.status)">
      <option value="">Trạng thái</option>
      <option value="open">Mở</option>
      <option value="claimed">Xử lý</option>
      <option value="closed">Đóng</option>
    </select>
    <select v-model="store.filters.priority" @change="store.setFilter('priority', store.filters.priority)">
      <option value="">Priority</option>
      <option value="urgent">Urgent</option>
      <option value="high">High</option>
      <option value="normal">Normal</option>
    </select>
    <select v-model="store.filters.clusterKey" @change="store.setFilter('clusterKey', store.filters.clusterKey)">
      <option value="">Tất cả cụm</option>
      <option v-for="cluster in clusters" :key="cluster.key" :value="cluster.key">{{ cluster.emoji }} {{ cluster.name }}</option>
    </select>
    <input v-model="store.filters.tag" @input="store.setFilter('tag', store.filters.tag)" placeholder="Tag..." style="max-width: 130px;" />
  </div>

  <!-- Bulk action bar -->
  <Transition name="route">
    <div v-if="canBulk && store.hasSelection" class="card card-glass" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 14px; border-color: var(--brand);">
      <strong>{{ store.selected.size }} đã chọn</strong>
      <div class="flex-1"></div>
      <div class="flex gap-2">
        <StButton variant="ghost" size="sm" @click="bulkPriority('urgent')">🚨 Urgent</StButton>
        <StButton variant="ghost" size="sm" @click="bulkPriority('high')">🟠 High</StButton>
        <StButton variant="ghost" size="sm" @click="bulkPriority('normal')">⚪ Normal</StButton>
        <StButton variant="danger" size="sm" @click="bulkClose">🔒 Đóng tất cả</StButton>
        <StButton variant="ghost" size="sm" @click="store.clearSelection">✕ Bỏ chọn</StButton>
      </div>
    </div>
  </Transition>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th v-if="canBulk" style="width: 40px; padding-right: 0;">
            <input type="checkbox" :checked="store.allOnPageSelected" @change="store.selectAllOnPage" style="cursor: pointer; width: 16px; height: 16px;" />
          </th>
          <th @click="store.setSort('ticketNum')" style="cursor: pointer; user-select: none;">#{{ sortIcon('ticketNum') }}</th>
          <th>Cụm</th>
          <th>Loại</th>
          <th>Người tạo</th>
          <th>Staff</th>
          <th>Trạng thái</th>
          <th @click="store.setSort('priority')" style="cursor: pointer; user-select: none;">Priority{{ sortIcon('priority') }}</th>
          <th>Tags</th>
          <th @click="store.setSort('messageCount')" style="cursor: pointer; user-select: none; text-align: center;">Msgs{{ sortIcon('messageCount') }}</th>
          <th @click="store.setSort('lastMessageAt')" style="cursor: pointer; user-select: none;">Last activity{{ sortIcon('lastMessageAt') }}</th>
          <th @click="store.setSort('openedAt')" style="cursor: pointer; user-select: none;">Mở{{ sortIcon('openedAt') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="store.loading"><td colspan="13" class="empty">Đang tải...</td></tr>
        <tr v-else-if="!store.items.length"><td colspan="13" class="empty">Không có ticket nào</td></tr>
        <tr
          v-else v-for="t in store.items" :key="t.id"
          :class="{ 'row-selected': store.selected.has(t.id) }"
          :style="store.selected.has(t.id) ? { background: 'rgba(124, 92, 255, 0.06)' } : {}"
        >
          <td v-if="canBulk" style="padding-right: 0;" @click.stop>
            <input type="checkbox" :checked="store.selected.has(t.id)" @change="store.toggleSelect(t.id)" style="cursor: pointer; width: 16px; height: 16px;" />
          </td>
          <td><strong style="font-family: ui-monospace, monospace; color: var(--brand-2);">#{{ pad4(t.ticketNum) }}</strong></td>
          <td><span class="badge badge-gray">{{ clusters.find(c => c.key === t.clusterKey)?.emoji || '❔' }} {{ clusters.find(c => c.key === t.clusterKey)?.name || t.clusterKey || 'Chưa chọn' }}</span></td>
          <td>{{ t.option?.emoji || '◈' }} {{ t.option?.name || '—' }}</td>
          <td>{{ t.creatorName }}</td>
          <td>
            <span v-if="!t.claimerName" class="muted">—</span>
            <span v-else-if="t.claimerId === auth.user?.discordId" class="badge badge-brand">👤 Tôi</span>
            <span v-else>{{ t.claimerName }}</span>
          </td>
          <td><span :class="['badge', STATUS_BADGE[t.status]]">● {{ STATUS_LABEL[t.status] || t.status }}</span></td>
          <td><span :class="['badge', PRIORITY_BADGE[t.priority]]">{{ t.priority }}</span></td>
          <td>
            <span v-if="!getTags(t).length" class="muted text-xs">—</span>
            <span v-for="tag in getTags(t)" :key="tag" class="badge badge-gray" style="margin-right: 2px;">{{ tag }}</span>
          </td>
          <td style="text-align: center;"><span class="badge badge-gray">{{ t._count?.messages ?? t.messageCount ?? 0 }}</span></td>
          <td class="muted text-sm">{{ t.lastMessageAt ? timeSince(t.lastMessageAt) + ' trước' : '—' }}</td>
          <td class="muted text-sm">{{ timeSince(t.openedAt) }}</td>
          <td style="white-space: nowrap;">
            <RouterLink :to="`/tickets/${t.id}`">
              <StButton variant="ghost" size="sm">
                <span class="material-symbols-outlined symbol-sm">visibility</span>
              </StButton>
            </RouterLink>
            <StButton v-if="canClaim && t.status === 'open'" variant="ghost" size="sm" style="margin-left: 4px;" @click="quickClaim(t)" title="Claim">
              <span class="material-symbols-outlined symbol-sm">pan_tool</span>
            </StButton>
            <StButton v-if="canClose && t.status !== 'closed'" variant="danger" size="sm" style="margin-left: 4px;" @click="closeTicket(t)" title="Đóng">
              <span class="material-symbols-outlined symbol-sm">lock</span>
            </StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-if="store.pagination.totalPages > 1" class="flex gap-2" style="justify-content: center; margin-top: 20px; flex-wrap: wrap;">
    <StButton variant="ghost" size="sm" :disabled="store.pagination.page <= 1" @click="store.setPage(store.pagination.page - 1)">← Trước</StButton>
    <template v-for="(p, i) in pageList" :key="p">
      <span v-if="i > 0 && p - pageList[i-1] > 1" class="muted2" style="padding: 6px 4px;">...</span>
      <StButton
        :variant="p === store.pagination.page ? 'primary' : 'ghost'"
        size="sm"
        style="min-width: 36px;"
        @click="store.setPage(p)"
      >{{ p }}</StButton>
    </template>
    <StButton variant="ghost" size="sm" :disabled="store.pagination.page >= store.pagination.totalPages" @click="store.setPage(store.pagination.page + 1)">Sau →</StButton>
  </div>
</template>

<style scoped>
.tickets-header {
  padding: 26px;
  border: 1px solid var(--outline-variant);
  border-radius: 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary), transparent 86%), transparent 50%),
    var(--surface-container-low);
  box-shadow: var(--shadow-sm);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.shortcut-help {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.queue-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-panel {
  padding: 14px;
  border: 1px solid var(--outline-variant);
  border-radius: 14px;
  background: var(--surface-container-low);
  box-shadow: var(--shadow-sm);
}

kbd {
  background: var(--bg-3);
  border: 1px solid var(--line-2);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: ui-monospace, monospace;
}

@media (max-width: 640px) {
  .tickets-header {
    padding: 18px;
    border-radius: 14px;
  }

  .shortcut-help {
    display: flex;
    margin: 8px 0 0 !important;
  }
}
</style>

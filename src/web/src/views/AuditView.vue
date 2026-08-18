<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { AuditAPI } from '../api/endpoints';
import { on } from '../socket';
import StButton from '../components/StButton.vue';

const items = ref([]);
const total = ref(0);
const loading = ref(false);
const filter = ref({ action: '', actorId: '' });
const unbinds = [];

async function load() {
  loading.value = true;
  try {
    const result = await AuditAPI.list({ ...filter.value, limit: 100 });
    items.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  unbinds.push(on('audit:logged', (entry) => {
    items.value.unshift({ ...entry, metadata: entry.metadata || {} });
    if (items.value.length > 100) items.value.pop();
    total.value++;
  }));
});
onUnmounted(() => { for (const fn of unbinds) fn(); });

const ACTION_ICON = {
  'ticket.create': '🆕', 'ticket.claim': '✋', 'ticket.close': '🔒',
  'ticket.note': '📝', 'ticket.priority': '⚡',
  'option.create': '➕', 'option.update': '✏️', 'option.delete': '🗑️', 'option.toggle': '🔄',
  'staff.add': '👤+', 'staff.remove': '👤−',
  'config.update': '⚙️', 'auth.login': '🔑',
};
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Audit Log</h1>
      <p class="page-sub">{{ total }} hoạt động · realtime</p>
    </div>
    <StButton variant="ghost" @click="load">↻ Refresh</StButton>
  </div>

  <div class="filters">
    <select v-model="filter.action" @change="load">
      <option value="">Tất cả action</option>
      <option v-for="a in Object.keys(ACTION_ICON)" :key="a" :value="a">{{ ACTION_ICON[a] }} {{ a }}</option>
    </select>
    <input placeholder="Actor ID..." v-model="filter.actorId" @keyup.enter="load" />
  </div>

  <div class="card">
    <div v-if="loading" class="empty">Đang tải...</div>
    <div v-else-if="!items.length" class="empty">Không có log nào</div>
    <TransitionGroup v-else name="toast" tag="div">
      <div v-for="e in items" :key="e.id" class="audit-entry">
        <div class="audit-dot"></div>
        <div class="flex-1">
          <div>
            <span style="margin-right: 8px; font-size: 14px;">{{ ACTION_ICON[e.action] || '•' }}</span>
            <strong>{{ e.actorName }}</strong>
            <span class="muted"> · </span>
            <span>{{ e.action }}</span>
            <RouterLink v-if="e.ticketId" :to="`/tickets/${e.ticketId}`" style="color: var(--brand-2); font-size: 11px; margin-left: 10px;">→ ticket</RouterLink>
          </div>
          <div class="audit-meta">
            {{ new Date(e.createdAt).toLocaleString('vi-VN') }}
            <span v-if="e.metadata && Object.keys(e.metadata).length" style="margin-left: 8px;">
              · {{ JSON.stringify(e.metadata) }}
            </span>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

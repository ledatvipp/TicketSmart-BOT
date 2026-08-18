<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { TicketsAPI, OptionsAPI, StaffAPI, CannedAPI, FaqAPI } from '../api/endpoints';
import { useAuth } from '../stores/auth';

const router = useRouter();
const auth = useAuth();
const open = ref(false);
const query = ref('');
const items = ref([]);
const cursor = ref(0);
const inputEl = ref(null);
const loading = ref(false);

const DEFAULT_CMDS = [
  { icon: '📊', label: 'Dashboard', to: '/dashboard', permission: 'analytics.view' },
  { icon: '🎫', label: 'Tickets', to: '/tickets', permission: 'ticket.view' },
  { icon: '🗂️', label: 'Options', to: '/options', permission: 'ticket.view' },
  { icon: '👮', label: 'Staff', to: '/staff', admin: true },
  { icon: '💬', label: 'Canned', to: '/canned', permission: 'canned.view' },
  { icon: '📝', label: 'Audit Log', to: '/audit', permission: 'audit.view' },
  { icon: '📈', label: 'Analytics', to: '/analytics', permission: 'analytics.view' },
  { icon: '❓', label: 'FAQ', to: '/faqs', permission: 'faq.view' },
  { icon: '🏷️', label: 'Auto-tag rules', to: '/autotag', admin: true },
  { icon: '🔌', label: 'Webhooks', to: '/webhooks', admin: true },
  { icon: '⚙️', label: 'Cấu hình', to: '/config', admin: true },
];
const permittedCommands = computed(() => DEFAULT_CMDS.filter((item) => (
  item.admin ? auth.isAdmin : !item.permission || auth.hasPermission(item.permission)
)));

async function runSearch(q) {
  if (!q || q.length < 2) {
    items.value = permittedCommands.value;
    cursor.value = 0;
    return;
  }
  loading.value = true;
  try {
    const [tickets, options, staff, canned, faqs] = await Promise.all([
      auth.hasPermission('ticket.view') ? TicketsAPI.list({ search: q, limit: 5 }).then((d) => d.tickets || []).catch(() => []) : [],
      auth.hasPermission('ticket.view') ? OptionsAPI.list().then((arr) => arr.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 5)).catch(() => []) : [],
      auth.isAdmin ? StaffAPI.list().then((arr) => arr.filter((s) => s.username.toLowerCase().includes(q.toLowerCase())).slice(0, 5)).catch(() => []) : [],
      auth.hasPermission('canned.view') ? CannedAPI.list().then((arr) => arr.filter((c) => c.shortcut.includes(q) || c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 5)).catch(() => []) : [],
      auth.hasPermission('faq.view') ? FaqAPI.list({ search: q, all: 'true' }).then((arr) => arr.slice(0, 3)).catch(() => []) : [],
    ]);

    const results = [];
    for (const t of tickets) {
      results.push({
        icon: '🎫',
        label: `#${String(t.ticketNum).padStart(4, '0')} — ${t.creatorName}`,
        hint: t.option?.name || t.type,
        to: `/tickets/${t.id}`,
      });
    }
    for (const o of options) results.push({ icon: o.emoji || '🗂️', label: o.name, hint: 'Option', to: '/options' });
    for (const s of staff) results.push({ icon: '👤', label: s.username, hint: s.role, to: '/staff' });
    for (const c of canned) results.push({ icon: '💬', label: `/${c.shortcut} — ${c.title}`, hint: 'Canned', to: '/canned' });
    for (const f of faqs) results.push({ icon: '❓', label: f.title, hint: 'FAQ', to: '/faqs' });

    // Default cmds matching too
    const dq = q.toLowerCase();
    const matchedDefault = permittedCommands.value.filter((c) => c.label.toLowerCase().includes(dq));
    items.value = [...matchedDefault, ...results];
    cursor.value = 0;
  } finally {
    loading.value = false;
  }
}

let searchTimer = null;
watch(query, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(v), 200);
});

function openPalette() {
  open.value = true;
  query.value = '';
  items.value = permittedCommands.value;
  cursor.value = 0;
  nextTick(() => inputEl.value?.focus());
}

function closePalette() { open.value = false; }

function pick(item) {
  if (item.to) router.push(item.to);
  if (item.action) item.action();
  closePalette();
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (open.value) closePalette(); else openPalette();
    return;
  }
  if (!open.value) return;
  if (e.key === 'Escape') return closePalette();
  if (e.key === 'ArrowDown') { e.preventDefault(); cursor.value = Math.min(cursor.value + 1, items.value.length - 1); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); cursor.value = Math.max(cursor.value - 1, 0); }
  if (e.key === 'Enter')     { e.preventDefault(); if (items.value[cursor.value]) pick(items.value[cursor.value]); }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="modal-backdrop" @click.self="closePalette" style="align-items: flex-start; padding-top: 15vh;">
        <div class="modal-panel size-md" style="padding: 0; overflow: hidden;">
          <div style="padding: 8px 14px; border-bottom: 1px solid var(--line-1); display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px;">🔍</span>
            <input
              ref="inputEl"
              v-model="query"
              placeholder="Tìm ticket, option, staff, canned, FAQ..."
              style="flex: 1; background: transparent; border: 0; padding: 8px 0; font-size: 14px;"
            />
            <kbd style="background: var(--bg-3); padding: 2px 6px; border-radius: 4px; font-size: 10px;">ESC</kbd>
          </div>
          <div style="max-height: 50vh; overflow-y: auto; padding: 6px;">
            <div v-if="loading" class="empty">Đang tìm...</div>
            <div v-else-if="!items.length" class="empty">Không có kết quả</div>
            <div
              v-for="(it, i) in items" :key="i"
              @click="pick(it)"
              @mouseenter="cursor = i"
              :style="{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                background: cursor === i ? 'var(--bg-2)' : 'transparent',
              }"
            >
              <span style="font-size: 16px;">{{ it.icon }}</span>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; font-size: 13px;">{{ it.label }}</div>
                <div v-if="it.hint" class="muted text-xs">{{ it.hint }}</div>
              </div>
              <kbd v-if="cursor === i" style="background: var(--bg-3); padding: 2px 6px; border-radius: 4px; font-size: 10px;">↵</kbd>
            </div>
          </div>
          <div style="padding: 8px 14px; border-top: 1px solid var(--line-1); display: flex; justify-content: space-between; font-size: 11px;" class="muted">
            <span><kbd>↑↓</kbd> điều hướng · <kbd>↵</kbd> chọn</span>
            <span>Ctrl+K mở/đóng</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

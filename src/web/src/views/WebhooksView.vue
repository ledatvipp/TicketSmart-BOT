<script setup>
import { ref, onMounted } from 'vue';
import { WebhooksAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';

const items = ref([]);
const editing = ref(null);
const saving = ref(false);
const revealedSecret = ref('');
const deliveriesFor = ref(null);
const deliveries = ref([]);
const loadingDeliveries = ref(false);
const toast = useToast();

const EVENT_LIST = [
  'ticket.create', 'ticket.claim', 'ticket.close', 'ticket.reopen',
  'ticket.priority', 'ticket.tags', 'ticket.reply', 'ticket.rating',
  'config.update', 'option.create', 'option.update',
];

async function load() {
  try { items.value = await WebhooksAPI.list(); }
  catch (error) { toast.error(error.response?.data?.message || 'Không tải được webhooks'); }
}
onMounted(load);

function openCreate() {
  editing.value = { id: null, name: '', url: '', secret: '', eventsArr: ['*'], enabled: true };
}
function openEdit(item) {
  editing.value = {
    id: item.id,
    name: item.name,
    url: item.url,
    secret: '',
    eventsArr: (item.events || '*').split(',').map((value) => value.trim()).filter(Boolean),
    enabled: item.enabled,
  };
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      name: editing.value.name,
      url: editing.value.url,
      events: editing.value.eventsArr?.length ? editing.value.eventsArr.join(',') : '*',
      enabled: editing.value.enabled,
    };
    if (editing.value.secret) payload.secret = editing.value.secret;
    const result = editing.value.id
      ? await WebhooksAPI.update(editing.value.id, payload)
      : await WebhooksAPI.create(payload);
    if (result.secret) revealedSecret.value = result.secret;
    toast.success('Đã lưu webhook');
    editing.value = null;
    await load();
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không lưu được webhook');
  } finally {
    saving.value = false;
  }
}

async function remove(item) {
  if (!confirm(`Xóa webhook "${item.name}" và toàn bộ lịch sử delivery?`)) return;
  try {
    await WebhooksAPI.remove(item.id);
    toast.success('Đã xóa webhook');
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Không xóa được webhook'); }
}

function toggleEvent(event) {
  if (!editing.value.eventsArr) editing.value.eventsArr = [];
  if (event === '*') {
    editing.value.eventsArr = editing.value.eventsArr.includes('*') ? [] : ['*'];
    return;
  }
  editing.value.eventsArr = editing.value.eventsArr.filter((item) => item !== '*');
  const index = editing.value.eventsArr.indexOf(event);
  if (index >= 0) editing.value.eventsArr.splice(index, 1);
  else editing.value.eventsArr.push(event);
}

async function rotate(item) {
  if (!confirm(`Tạo secret mới cho webhook "${item.name}"? Secret cũ sẽ hết hiệu lực ngay.`)) return;
  try {
    const result = await WebhooksAPI.rotateSecret(item.id);
    revealedSecret.value = result.secret || '';
    toast.success('Đã xoay secret');
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Không xoay được secret'); }
}

async function showDeliveries(item) {
  deliveriesFor.value = item;
  deliveries.value = [];
  loadingDeliveries.value = true;
  try { deliveries.value = await WebhooksAPI.deliveries(item.id, { limit: 50 }); }
  catch (error) { toast.error(error.response?.data?.message || 'Không tải được delivery'); }
  finally { loadingDeliveries.value = false; }
}

async function replay(delivery) {
  try {
    await WebhooksAPI.replay(delivery.id);
    toast.success('Đã đưa delivery vào hàng đợi lại');
    if (deliveriesFor.value) await showDeliveries(deliveriesFor.value);
  } catch (error) { toast.error(error.response?.data?.message || 'Không replay được delivery'); }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Đã copy');
  } catch { toast.error('Trình duyệt không cho phép copy tự động'); }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('vi-VN') : '—';
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Webhooks</h1>
      <p class="page-sub">HTTPS outbox có HMAC, retry/backoff và lịch sử giao nhận</p>
    </div>
    <StButton variant="primary" @click="openCreate">+ Thêm webhook</StButton>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>Tên</th><th>URL</th><th>Events</th><th>Delivery</th><th>Active</th><th></th></tr></thead>
      <tbody>
        <tr v-if="!items.length"><td colspan="6" class="empty">Chưa có webhook</td></tr>
        <tr v-for="item in items" :key="item.id">
          <td><strong>{{ item.name }}</strong><div class="muted text-xs">Secret: {{ item.hasSecret ? item.secretPreview : 'không dùng' }}</div></td>
          <td><code class="url-code">{{ item.url }}</code></td>
          <td><span class="muted text-xs">{{ item.events || '*' }}</span></td>
          <td><button class="link-button" type="button" @click="showDeliveries(item)">{{ item.deliveryCount || 0 }} bản ghi</button></td>
          <td><span :class="['badge', item.enabled ? 'badge-green' : 'badge-gray']">{{ item.enabled ? 'On' : 'Off' }}</span></td>
          <td class="actions-cell">
            <StButton variant="ghost" size="sm" @click="showDeliveries(item)">Lịch sử</StButton>
            <StButton variant="ghost" size="sm" @click="rotate(item)">Rotate</StButton>
            <StButton variant="ghost" size="sm" @click="openEdit(item)">Sửa</StButton>
            <StButton variant="danger" size="sm" @click="remove(item)">Xóa</StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Modal v-if="editing" :model-value="true" size="lg" @close="editing = null">
    <template #title>{{ editing.id ? '✏️ Sửa webhook' : '➕ Thêm webhook' }}</template>
    <div class="form-row"><label>Tên</label><input v-model="editing.name" maxlength="120" placeholder="n8n production" /></div>
    <div class="form-row">
      <label>URL HTTPS công khai</label>
      <input v-model="editing.url" maxlength="2048" placeholder="https://hooks.example.com/ticket" />
      <div class="muted text-xs">Không chấp nhận HTTP, localhost, IP private, redirect hoặc cổng khác 443.</div>
    </div>
    <div class="form-row">
      <label>{{ editing.id ? 'Secret mới (để trống để giữ nguyên)' : 'Secret HMAC (để trống để tự tạo)' }}</label>
      <input v-model="editing.secret" type="password" autocomplete="new-password" maxlength="256" />
      <div class="muted text-xs">Server chỉ hiển thị secret đúng một lần khi tạo hoặc rotate.</div>
    </div>
    <div class="form-row">
      <label>Events</label>
      <div class="event-grid">
        <button type="button" :class="['btn', 'btn-sm', editing.eventsArr?.includes('*') ? 'btn-primary' : 'btn-ghost']" @click="toggleEvent('*')">*</button>
        <button
          v-for="event in EVENT_LIST" :key="event" type="button"
          :class="['btn', 'btn-sm', editing.eventsArr?.includes(event) ? 'btn-primary' : 'btn-ghost']"
          @click="toggleEvent(event)"
        >{{ event }}</button>
      </div>
    </div>
    <Switch v-model="editing.enabled">Bật webhook</Switch>
    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">Hủy</StButton>
      <StButton variant="primary" :disabled="saving" @click="save">{{ saving ? 'Đang lưu...' : 'Lưu' }}</StButton>
    </template>
  </Modal>

  <Modal v-if="revealedSecret" :model-value="true" :close-on-backdrop="false" size="lg" @close="revealedSecret = ''">
    <template #title>🔐 Lưu secret ngay</template>
    <p>Secret này sẽ không được API trả lại lần nữa. Hãy lưu vào secret manager của bên nhận webhook.</p>
    <div class="secret-box"><code>{{ revealedSecret }}</code></div>
    <template #actions="{ close }">
      <StButton variant="ghost" @click="copy(revealedSecret)">Copy</StButton>
      <StButton variant="primary" @click="close">Tôi đã lưu</StButton>
    </template>
  </Modal>

  <Modal v-if="deliveriesFor" :model-value="true" size="xl" @close="deliveriesFor = null">
    <template #title>Delivery — {{ deliveriesFor.name }}</template>
    <div v-if="loadingDeliveries" class="empty">Đang tải...</div>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>Thời gian</th><th>Event</th><th>Status</th><th>HTTP</th><th>Lần thử</th><th>Lỗi</th><th></th></tr></thead>
        <tbody>
          <tr v-if="!deliveries.length"><td colspan="7" class="empty">Chưa có delivery</td></tr>
          <tr v-for="delivery in deliveries" :key="delivery.id">
            <td class="text-xs">{{ formatDate(delivery.createdAt) }}</td>
            <td><code>{{ delivery.event }}</code></td>
            <td><span :class="['badge', delivery.status === 'delivered' ? 'badge-green' : delivery.status === 'dead' ? 'badge-red' : 'badge-gray']">{{ delivery.status }}</span></td>
            <td>{{ delivery.responseStatus || '—' }}</td>
            <td>{{ delivery.attempts }}</td>
            <td class="error-cell" :title="delivery.lastError || ''">{{ delivery.lastError || '—' }}</td>
            <td><StButton v-if="delivery.status !== 'processing'" variant="ghost" size="sm" @click="replay(delivery)">Replay</StButton></td>
          </tr>
        </tbody>
      </table>
    </div>
  </Modal>
</template>

<style scoped>
.url-code { display: block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.actions-cell { white-space: nowrap; display: flex; gap: 4px; }
.link-button { border: 0; background: transparent; color: var(--brand); cursor: pointer; padding: 0; }
.event-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.secret-box { padding: 12px; border: 1px solid var(--line-1); border-radius: 8px; overflow-wrap: anywhere; background: var(--bg-3); }
.error-cell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

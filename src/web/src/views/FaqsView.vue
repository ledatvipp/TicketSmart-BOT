<script setup>
import { ref, onMounted } from 'vue';
import { FaqAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';

const items = ref([]);
const editing = ref(null);
const search = ref('');
const toast = useToast();
const auth = useAuth();

async function load() {
  items.value = await FaqAPI.list({ all: 'true', search: search.value || undefined });
}
onMounted(load);

function openCreate() {
  editing.value = { id: null, title: '', keywords: '', content: '', category: '', enabled: true, sortOrder: 0 };
}
function openEdit(it) { editing.value = { ...it }; }

async function save() {
  try {
    if (editing.value.id) await FaqAPI.update(editing.value.id, editing.value);
    else await FaqAPI.create(editing.value);
    toast.success('Đã lưu');
    editing.value = null;
    await load();
  } catch (e) { toast.error(e.response?.data?.message || 'Lỗi'); }
}

async function remove(it) {
  if (!confirm(`Xóa FAQ "${it.title}"?`)) return;
  await FaqAPI.remove(it.id);
  toast.success('Đã xóa');
  await load();
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">FAQ</h1>
      <p class="page-sub">{{ items.length }} mục</p>
    </div>
    <StButton v-if="auth.isAdmin" variant="primary" @click="openCreate">+ Thêm FAQ</StButton>
  </div>

  <div class="filters">
    <input v-model="search" @input="load" placeholder="🔍 Tìm trong tiêu đề/keywords/content..." style="min-width: 320px;" />
  </div>

  <div class="grid-2" style="gap: 14px;">
    <div v-for="it in items" :key="it.id" class="card card-hover">
      <div class="flex" style="align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <h3 style="margin: 0;">{{ it.title }}</h3>
        <div class="flex gap-2">
          <span v-if="!it.enabled" class="badge badge-gray">Tắt</span>
          <span v-if="it.category" class="badge badge-brand">{{ it.category }}</span>
          <span class="badge badge-gray">{{ it.views }} 👁</span>
        </div>
      </div>
      <div class="muted text-sm" style="white-space: pre-wrap; max-height: 80px; overflow: hidden;">{{ it.content }}</div>
      <div class="muted text-xs mt-2">Keywords: <code>{{ it.keywords || '—' }}</code></div>
      <div class="flex gap-2 mt-3">
        <StButton variant="ghost" size="sm" @click="openEdit(it)">{{ auth.isAdmin ? 'Sửa' : 'Xem chi tiết' }}</StButton>
        <StButton v-if="auth.isAdmin" variant="danger" size="sm" @click="remove(it)">Xóa</StButton>
      </div>
    </div>
  </div>
  <div v-if="!items.length" class="empty">Chưa có FAQ nào</div>

  <Modal v-if="editing" :model-value="!!editing" size="lg" @close="editing = null">
    <template #title>{{ auth.isAdmin ? (editing.id ? '✏️ Sửa FAQ' : '➕ Thêm FAQ') : 'ℹ️ Chi tiết FAQ (Chỉ xem)' }}</template>
    <div class="form-row"><label>Tiêu đề</label><input v-model="editing.title" :disabled="!auth.isAdmin" /></div>
    <div class="grid-2">
      <div class="form-row"><label>Keywords (CSV)</label><input v-model="editing.keywords" placeholder="refund, money back" :disabled="!auth.isAdmin" /></div>
      <div class="form-row"><label>Category</label><input v-model="editing.category" :disabled="!auth.isAdmin" /></div>
    </div>
    <div class="form-row">
      <label>Nội dung (markdown)</label>
      <textarea v-model="editing.content" style="min-height: 200px; font-family: ui-monospace, monospace;" :disabled="!auth.isAdmin"></textarea>
    </div>
    <div class="flex gap-3">
      <Switch v-model="editing.enabled" :disabled="!auth.isAdmin">Bật</Switch>
      <div class="form-row" style="margin: 0;">
        <label>Sort</label>
        <input v-model.number="editing.sortOrder" type="number" style="width: 80px;" :disabled="!auth.isAdmin" />
      </div>
    </div>
    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">{{ auth.isAdmin ? 'Hủy' : 'Đóng' }}</StButton>
      <StButton v-if="auth.isAdmin" variant="primary" @click="save">Lưu</StButton>
    </template>
  </Modal>
</template>

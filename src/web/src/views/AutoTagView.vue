<script setup>
import { ref, onMounted } from 'vue';
import { AutoTagAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';

const items = ref([]);
const editing = ref(null);
const toast = useToast();

async function load() { items.value = await AutoTagAPI.list(); }
onMounted(load);

function openCreate() {
  editing.value = { id: null, name: '', keywords: '', tag: '', enabled: true, matchAll: false };
}
function openEdit(it) { editing.value = { ...it }; }

async function save() {
  try {
    if (editing.value.id) await AutoTagAPI.update(editing.value.id, editing.value);
    else await AutoTagAPI.create(editing.value);
    toast.success('Đã lưu');
    editing.value = null;
    await load();
  } catch (e) { toast.error(e.response?.data?.message || 'Lỗi'); }
}

async function remove(it) {
  if (!confirm(`Xóa rule "${it.name}"?`)) return;
  await AutoTagAPI.remove(it.id);
  await load();
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Auto-tag Rules</h1>
      <p class="page-sub">Tự động gán tag theo keyword khi ticket được tạo</p>
    </div>
    <StButton variant="primary" @click="openCreate">+ Thêm rule</StButton>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>Tên</th><th>Keywords</th><th>→ Tag</th><th>Match</th><th>Active</th><th></th></tr></thead>
      <tbody>
        <tr v-if="!items.length"><td colspan="6" class="empty">Chưa có rule</td></tr>
        <tr v-for="it in items" :key="it.id">
          <td><strong>{{ it.name }}</strong></td>
          <td><code class="text-xs">{{ it.keywords }}</code></td>
          <td><span class="badge badge-brand">{{ it.tag }}</span></td>
          <td><span class="badge badge-gray">{{ it.matchAll ? 'AND' : 'OR' }}</span></td>
          <td><Switch :model-value="it.enabled" @update:model-value="(v) => { AutoTagAPI.update(it.id, { enabled: v }).then(load); }" /></td>
          <td style="white-space: nowrap;">
            <StButton variant="ghost" size="sm" @click="openEdit(it)">Sửa</StButton>
            <StButton variant="danger" size="sm" @click="remove(it)" style="margin-left: 4px;">Xóa</StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Modal v-if="editing" :model-value="!!editing" size="md" @close="editing = null">
    <template #title>{{ editing.id ? '✏️ Sửa rule' : '➕ Thêm rule' }}</template>
    <div class="form-row"><label>Tên rule</label><input v-model="editing.name" placeholder="Refund detection" /></div>
    <div class="form-row">
      <label>Keywords (CSV) — match case-insensitive</label>
      <input v-model="editing.keywords" placeholder="refund, money back, refunding" />
    </div>
    <div class="form-row"><label>→ Tag áp dụng</label><input v-model="editing.tag" placeholder="refund" /></div>
    <Switch v-model="editing.matchAll">Match ALL keywords (AND) — mặc định OR</Switch>
    <div style="margin-top: 10px;"><Switch v-model="editing.enabled">Bật rule</Switch></div>
    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">Hủy</StButton>
      <StButton variant="primary" @click="save">Lưu</StButton>
    </template>
  </Modal>
</template>

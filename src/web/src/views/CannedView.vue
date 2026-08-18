<script setup>
import { ref, onMounted } from 'vue';
import { CannedAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';

const items = ref([]);
const editing = ref(null);
const toast = useToast();
const auth = useAuth();

async function load() { items.value = await CannedAPI.list(); }
onMounted(load);

function openCreate() {
  editing.value = { id: null, shortcut: '', title: '', content: '', category: '', sortOrder: 0 };
}
function openEdit(c) { editing.value = { ...c }; }

async function save() {
  try {
    if (editing.value.id) {
      await CannedAPI.update(editing.value.id, editing.value);
      toast.success('Đã cập nhật');
    } else {
      await CannedAPI.create(editing.value);
      toast.success('Đã tạo canned');
    }
    editing.value = null;
    await load();
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi lưu');
  }
}

async function remove(c) {
  if (!confirm(`Xóa canned "${c.title}"?`)) return;
  try {
    await CannedAPI.remove(c.id);
    toast.success('Đã xóa');
    await load();
  } catch { toast.error('Lỗi'); }
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Canned Responses</h1>
      <p class="page-sub">{{ items.length }} template trả lời nhanh · staff dùng khi reply từ web</p>
    </div>
    <StButton v-if="auth.isAdmin" variant="primary" @click="openCreate">+ Thêm canned</StButton>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Shortcut</th>
          <th>Title</th>
          <th>Nội dung</th>
          <th>Category</th>
          <th>Sort</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!items.length"><td colspan="6" class="empty">Chưa có canned response nào</td></tr>
        <tr v-for="c in items" :key="c.id">
          <td><code style="color: var(--brand-2);">/{{ c.shortcut }}</code></td>
          <td><strong>{{ c.title }}</strong></td>
          <td class="muted text-sm" style="max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ c.content }}</td>
          <td><span v-if="c.category" class="badge badge-gray">{{ c.category }}</span><span v-else class="muted text-xs">—</span></td>
          <td class="muted text-sm">{{ c.sortOrder }}</td>
          <td style="white-space: nowrap;">
            <StButton variant="ghost" size="sm" @click="openEdit(c)">{{ auth.isAdmin ? 'Sửa' : 'Xem chi tiết' }}</StButton>
            <StButton v-if="auth.isAdmin" variant="danger" size="sm" style="margin-left: 4px;" @click="remove(c)">Xóa</StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Modal v-if="editing" :model-value="!!editing" size="md" @close="editing = null">
    <template #title>{{ auth.isAdmin ? (editing.id ? '✏️ Sửa canned' : '➕ Tạo canned mới') : 'ℹ️ Chi tiết canned (Chỉ xem)' }}</template>

    <div class="grid-2">
      <div class="form-row">
        <label>Shortcut</label>
        <input v-model="editing.shortcut" placeholder="thanks" :disabled="!auth.isAdmin" />
        <div class="muted text-xs">Hiện dạng /shortcut trong dropdown</div>
      </div>
      <div class="form-row">
        <label>Category</label>
        <input v-model="editing.category" placeholder="greeting, closing..." :disabled="!auth.isAdmin" />
      </div>
    </div>

    <div class="form-row">
      <label>Title (hiển thị)</label>
      <input v-model="editing.title" placeholder="Cảm ơn user" :disabled="!auth.isAdmin" />
    </div>

    <div class="form-row">
      <label>Nội dung</label>
      <textarea v-model="editing.content" style="min-height: 140px;" placeholder="Xin chào {user}, ticket #{ticketNum} của bạn..." :disabled="!auth.isAdmin"></textarea>
      <div class="muted text-xs">
        Biến: <code style="background: var(--bg-2); padding: 1px 5px; border-radius: 4px;">{user}</code>
        <code style="background: var(--bg-2); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">{ticketNum}</code>
        <code style="background: var(--bg-2); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">{staff}</code>
      </div>
    </div>

    <div class="form-row">
      <label>Thứ tự sort</label>
      <input v-model.number="editing.sortOrder" type="number" :disabled="!auth.isAdmin" />
    </div>

    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">{{ auth.isAdmin ? 'Hủy' : 'Đóng' }}</StButton>
      <StButton v-if="auth.isAdmin" variant="primary" @click="save">Lưu</StButton>
    </template>
  </Modal>
</template>

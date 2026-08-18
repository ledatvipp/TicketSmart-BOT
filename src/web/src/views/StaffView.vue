<script setup>
import { ref, onMounted } from 'vue';
import { StaffAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';

const staff = ref([]);
const adding = ref(false);
const form = ref({ discordId: '', username: '', role: 'MOD' });
const toast = useToast();
const auth = useAuth();

async function load() { staff.value = await StaffAPI.list(); }
onMounted(load);

async function add() {
  if (!form.value.discordId || !form.value.username) {
    toast.error('Cần discordId + username');
    return;
  }
  try {
    await StaffAPI.add(form.value);
    toast.success('Đã thêm staff');
    adding.value = false;
    form.value = { discordId: '', username: '', role: 'MOD' };
    await load();
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi');
  }
}

async function remove(s) {
  if (s.discordId === auth.user?.discordId) {
    toast.error('Không thể xóa chính mình');
    return;
  }
  if (!confirm(`Xóa ${s.username}?`)) return;
  try {
    await StaffAPI.remove(s.discordId);
    toast.success('Đã xóa');
    await load();
  } catch {
    toast.error('Lỗi');
  }
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Staff</h1>
      <p class="page-sub">{{ staff.length }} người có quyền truy cập dashboard</p>
    </div>
    <StButton v-if="auth.isAdmin" variant="primary" @click="adding = true">+ Thêm staff</StButton>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>Discord ID</th><th>Username</th><th>Role</th><th>Ngày thêm</th><th></th></tr></thead>
      <tbody>
        <tr v-if="!staff.length"><td colspan="5" class="empty">Chưa có staff nào</td></tr>
        <tr v-for="s in staff" :key="s.discordId">
          <td><code class="muted text-xs">{{ s.discordId }}</code></td>
          <td>
            <div class="flex gap-2" style="align-items: center;">
              <img v-if="s.avatar" :src="s.avatar" style="width: 32px; height: 32px; border-radius: 50%;" />
              <div v-else style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-3); display: grid; place-items: center; font-weight: 700;">{{ s.username[0].toUpperCase() }}</div>
              <strong>{{ s.username }}</strong>
            </div>
          </td>
          <td><span :class="['badge', s.role === 'ADMIN' ? 'badge-brand' : 'badge-gray']">{{ s.role }}</span></td>
          <td class="muted text-sm">{{ new Date(s.addedAt).toLocaleDateString('vi-VN') }}</td>
          <td>
            <StButton v-if="auth.isAdmin && s.discordId !== auth.user.discordId" variant="danger" size="sm" @click="remove(s)">Xóa</StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Modal v-model="adding" size="md">
    <template #title>👤 Thêm staff</template>
    <div class="form-row"><label>Discord ID</label><input v-model="form.discordId" placeholder="VD: 1234567890123456789" /></div>
    <div class="form-row"><label>Username</label><input v-model="form.username" /></div>
    <div class="form-row">
      <label>Role</label>
      <select v-model="form.role">
        <option value="MOD">MOD — Quản lý ticket</option>
        <option value="ADMIN">ADMIN — Toàn quyền</option>
      </select>
    </div>
    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">Hủy</StButton>
      <StButton variant="primary" @click="add">Thêm</StButton>
    </template>
  </Modal>
</template>

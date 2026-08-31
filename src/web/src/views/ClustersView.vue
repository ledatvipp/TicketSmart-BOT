<script setup>
import { computed, onMounted, ref } from 'vue';
import { ClustersAPI, OptionsAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';

const clusters = ref([]);
const ticketOptions = ref([]);
const editing = ref(null);
const saving = ref(false);
const toast = useToast();

const availableDefaultOptions = computed(() => {
  const clusterKey = String(editing.value?.key || '').trim().toLowerCase();
  if (!clusterKey) return ticketOptions.value;

  return ticketOptions.value.filter((option) => {
    const scopeKeys = String(option.clusterKeys || '*')
      .split(',')
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean);
    return scopeKeys.includes('*') || scopeKeys.includes(clusterKey);
  });
});

function defaultOptionLabel(cluster) {
  return ticketOptions.value.find((option) => String(option.id) === String(cluster.defaultOptionId))?.name
    || 'Tự chọn loại phù hợp';
}

async function load() {
  const [clusterRows, optionRows] = await Promise.all([ClustersAPI.list(), OptionsAPI.list()]);
  clusters.value = clusterRows;
  ticketOptions.value = optionRows.filter((option) => option.isActive);
}
onMounted(load);

function openCreate() {
  editing.value = {
    id: null, key: '', name: '', emoji: '🗺️', color: '#5865F2', aliases: '',
    description: '', discordCategoryId: '', defaultOptionId: '', supportChannelIds: '', staffRoleIds: '',
    sortOrder: clusters.value.length * 10 + 10, isActive: true,
  };
}

function openEdit(cluster) {
  editing.value = { ...cluster };
}

async function save() {
  if (saving.value || !editing.value?.name?.trim()) return;
  saving.value = true;
  try {
    if (editing.value.id) await ClustersAPI.update(editing.value.id, editing.value);
    else await ClustersAPI.create(editing.value);
    toast.success(editing.value.id ? 'Đã cập nhật cụm' : 'Đã tạo cụm');
    editing.value = null;
    await load();
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không lưu được cụm');
  } finally {
    saving.value = false;
  }
}

async function toggle(cluster) {
  try { await ClustersAPI.toggle(cluster.id); await load(); }
  catch (error) { toast.error(error.response?.data?.message || 'Không đổi được trạng thái'); }
}

async function remove(cluster) {
  if (!confirm(`Xóa cụm “${cluster.name}”? Ticket đang mở sẽ được bảo vệ.`)) return;
  try { await ClustersAPI.remove(cluster.id); toast.success('Đã xóa cụm'); await load(); }
  catch (error) { toast.error(error.response?.data?.message || 'Không xóa được cụm'); }
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Cụm máy chủ</h1>
      <p class="page-sub">AI, ticket và Knowledge Base dùng đúng ngữ cảnh từng cụm</p>
    </div>
    <StButton variant="primary" @click="openCreate">
      <span class="material-symbols-outlined symbol-sm">add</span>
      Thêm cụm
    </StButton>
  </div>

  <div class="card" style="margin-bottom: 18px; padding: 16px;">
    <strong>🧠 Multi‑Cluster Router</strong>
    <p class="muted text-sm" style="margin: 6px 0 0;">
      Khi chưa biết cụm, bot sẽ hỏi bằng button. Khi đã biết, mọi câu trả lời, tài liệu và loại ticket đều được khóa theo cụm đó.
    </p>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 14px;">
    <article v-for="cluster in clusters" :key="cluster.id" class="card" :style="{ borderTop: `3px solid ${cluster.color}` }">
      <div class="flex" style="align-items: center; justify-content: space-between; gap: 12px;">
        <div class="flex" style="align-items: center; gap: 10px; min-width: 0;">
          <span style="font-size: 28px;">{{ cluster.emoji }}</span>
          <div style="min-width: 0;">
            <strong style="font-size: 16px;">{{ cluster.name }}</strong>
            <div class="muted text-xs">{{ cluster.key }}</div>
          </div>
        </div>
        <Switch :model-value="cluster.isActive" @update:model-value="toggle(cluster)" />
      </div>

      <p class="muted text-sm" style="min-height: 40px; margin: 14px 0;">{{ cluster.description || 'Chưa có mô tả.' }}</p>
      <div class="grid-2" style="gap: 8px; margin-bottom: 12px;">
        <div class="badge badge-gray">🎫 {{ cluster._count?.tickets || 0 }} tickets</div>
        <div class="badge badge-gray">📁 {{ cluster.discordCategoryId || 'Chưa gắn category' }}</div>
      </div>
      <div class="muted text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Loại ticket mặc định: {{ defaultOptionLabel(cluster) }}
      </div>
      <div class="muted text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Từ khóa: {{ cluster.aliases || cluster.name }}
      </div>
      <div class="flex gap-2" style="margin-top: 14px;">
        <StButton size="sm" variant="ghost" @click="openEdit(cluster)">Sửa</StButton>
        <StButton size="sm" variant="danger" @click="remove(cluster)">Xóa</StButton>
      </div>
    </article>
  </div>

  <Modal v-if="editing" :model-value="true" size="lg" @close="editing = null">
    <template #title>{{ editing.id ? 'Sửa cụm máy chủ' : 'Thêm cụm máy chủ' }}</template>

    <div class="grid-2">
      <div class="form-row"><label>Tên hiển thị</label><input v-model="editing.name" placeholder="Skyblock" /></div>
      <div class="form-row"><label>Key ổn định</label><input v-model="editing.key" placeholder="skyblock" :disabled="!!editing.id" /></div>
    </div>
    <div class="grid-2">
      <div class="form-row"><label>Emoji</label><input v-model="editing.emoji" /></div>
      <div class="form-row"><label>Màu embed</label><input v-model="editing.color" type="color" /></div>
    </div>
    <div class="form-row"><label>Mô tả</label><textarea v-model="editing.description" style="min-height: 90px;"></textarea></div>
    <div class="form-row">
      <label>Từ khóa nhận diện, cách nhau bằng dấu phẩy</label>
      <input v-model="editing.aliases" placeholder="skyblock, sky block, đảo sky, island" />
    </div>
    <div class="grid-2">
      <div class="form-row"><label>Discord Category ID</label><input v-model="editing.discordCategoryId" /></div>
      <div class="form-row"><label>Thứ tự</label><input v-model.number="editing.sortOrder" type="number" /></div>
    </div>
    <div class="form-row">
      <label>Loại ticket mặc định</label>
      <select v-model="editing.defaultOptionId">
        <option value="">Tự chọn loại phù hợp</option>
        <option v-for="option in availableDefaultOptions" :key="option.id" :value="option.id">{{ option.emoji || '🎫' }} {{ option.name }}</option>
      </select>
      <div class="muted text-xs" style="margin-top: 6px;">Chỉ hiện loại ticket hỗ trợ cụm này. Để trống để bot tự chọn loại phù hợp an toàn.</div>
    </div>
    <div class="form-row"><label>Support Channel IDs</label><input v-model="editing.supportChannelIds" placeholder="ID1,ID2" /></div>
    <div class="form-row"><label>Staff Role IDs</label><input v-model="editing.staffRoleIds" placeholder="ID1,ID2" /></div>
    <Switch v-model="editing.isActive">Đang hoạt động</Switch>

    <template #actions>
      <StButton variant="ghost" @click="editing = null">Hủy</StButton>
      <StButton variant="primary" :disabled="saving" @click="save">{{ saving ? 'Đang lưu...' : 'Lưu cụm' }}</StButton>
    </template>
  </Modal>
</template>

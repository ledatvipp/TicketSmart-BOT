<script setup>
import { ref, onMounted, computed } from 'vue';
import { OptionsAPI, ConfigAPI, ClustersAPI } from '../api/endpoints';
import { useAuth } from '../stores/auth';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';
import Tabs from '../components/Tabs.vue';
import DiscordEmbedPreview from '../components/DiscordEmbedPreview.vue';
import FormFieldBuilder from '../components/FormFieldBuilder.vue';

const options = ref([]);
const clusters = ref([]);
const globalCfg = ref(null);
const editing = ref(null);
const editTab = ref('basic');
const toast = useToast();
const auth = useAuth();
const saving = ref(false);

const EDIT_TABS = [
  { value: 'basic',   label: 'Thông tin',   icon: 'info' },
  { value: 'welcome', label: 'Welcome',     icon: 'waving_hand' },
  { value: 'embed',   label: 'Custom Embed', icon: 'palette' },
  { value: 'form',    label: 'Form Fields', icon: 'list_alt' },
  { value: 'auto',    label: 'Auto-actions', icon: 'smart_toy' },
  { value: 'access',  label: 'Access',      icon: 'lock' },
];

async function load() {
  const [opts, cfg, clusterRows] = await Promise.all([OptionsAPI.list(), ConfigAPI.get(), ClustersAPI.list({ active: true })]);
  options.value = opts;
  globalCfg.value = cfg;
  clusters.value = clusterRows;
}
onMounted(load);

function openCreate() {
  editing.value = {
    id: null,
    name: '', emoji: '🗺️', description: '', color: '#5865F2',
    discordCategoryId: '', welcomeMessage: '', autoMessages: '[]',
    isActive: true, customEmbedEnabled: false,
    ticketTitle: '', ticketDesc: '', ticketGuidance: '', ticketFooter: '', ticketColor: '#5865F2',
    formFields: [],
    inheritFormFromId: null,
    autoCloseHours: null, autoEscalateMinutes: null, slaResponseMinutes: null,
    allowedStaffRoles: '', maxOpenPerUser: 0, pingStaff: '',
    pingRoles: '', pingUsers: '', clusterKeys: '*',
  };
  editTab.value = 'basic';
}

function openEdit(o) {
  let fields = [];
  try { fields = JSON.parse(o.formFields || '[]'); } catch {}
  
  let rolesVal = '';
  let usersVal = '';
  if (o.pingStaff) {
    if (o.pingStaff.includes('roles:') || o.pingStaff.includes('users:')) {
      const matchesRoles = o.pingStaff.match(/roles:([^|]*)/i);
      const matchesUsers = o.pingStaff.match(/users:([^|]*)/i);
      if (matchesRoles) rolesVal = matchesRoles[1];
      if (matchesUsers) usersVal = matchesUsers[1];
    } else {
      // Nếu là chuỗi cũ thì cho hết vào Roles làm mặc định
      rolesVal = o.pingStaff;
    }
  }

  editing.value = {
    pingStaff: '',
    ...o,
    pingRoles: rolesVal,
    pingUsers: usersVal,
    formFields: Array.isArray(fields) ? fields : [],
    inheritFormFromId: o.inheritFormFromId || null,
    clusterKeys: o.clusterKeys || '*'
  };
  editTab.value = 'basic';
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = { ...editing.value };
    payload.formFields = Array.isArray(payload.formFields) ? payload.formFields : [];
    
    // Gộp pingRoles và pingUsers thành chuỗi dạng roles:xxx|users:yyy
    if (payload.pingRoles || payload.pingUsers) {
      payload.pingStaff = `roles:${payload.pingRoles || ''}|users:${payload.pingUsers || ''}`;
    } else {
      payload.pingStaff = '';
    }
    delete payload.pingRoles;
    delete payload.pingUsers;

    if (editing.value.id) {
      await OptionsAPI.update(editing.value.id, payload);
      toast.success('Đã cập nhật');
    } else {
      await OptionsAPI.create(payload);
      toast.success('Đã tạo option');
    }
    editing.value = null;
    await load();
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi');
  } finally {
    saving.value = false;
  }
}

async function toggle(o) {
  try { await OptionsAPI.toggle(o.id); await load(); }
  catch { toast.error('Lỗi'); }
}

async function remove(o) {
  if (!confirm(`Xóa option "${o.name}"?`)) return;
  try { await OptionsAPI.remove(o.id); toast.success('Đã xóa'); await load(); }
  catch { toast.error('Lỗi'); }
}

function optionClusterKeys() {
  const value = String(editing.value?.clusterKeys || '*');
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function toggleOptionCluster(key) {
  const current = new Set(optionClusterKeys());
  if (key === '*') {
    editing.value.clusterKeys = '*';
    return;
  }
  current.delete('*');
  if (current.has(key)) current.delete(key);
  else current.add(key);
  editing.value.clusterKeys = current.size ? [...current].join(',') : '*';
}

const previewEmbed = computed(() => {
  if (!editing.value || !globalCfg.value) return null;
  const e = editing.value, g = globalCfg.value;
  const useCustom = e.customEmbedEnabled;
  return {
    title:       useCustom ? (e.ticketTitle    || g.ticketTitle)    : g.ticketTitle,
    description: useCustom ? (e.ticketDesc     || g.ticketDesc)     : g.ticketDesc,
    color:       useCustom ? (e.ticketColor    || g.ticketColor)    : g.ticketColor,
    footer:      useCustom ? (e.ticketFooter   || g.ticketFooter)   : g.ticketFooter,
    guidance:    useCustom ? (e.ticketGuidance || g.ticketGuidance) : g.ticketGuidance,
  };
});

function previewFields() {
  if (!editing.value || !globalCfg.value) return [];
  const g = globalCfg.value;
  const f = [];
  if (g.ticketShowType)    f.push({ name: '📋 Loại Ticket', value: `${editing.value.emoji} ${editing.value.name || '...'}`, inline: true });
  if (g.ticketShowCreator) f.push({ name: '👤 Người Tạo',   value: '@Bạn', inline: true });
  if (g.ticketShowTime)    f.push({ name: '📅 Thời Gian',    value: new Date().toLocaleString('vi-VN'), inline: true });
  if (g.ticketShowGuide && previewEmbed.value?.guidance) {
    f.push({ name: '📌 Hướng Dẫn', value: previewEmbed.value.guidance, inline: false });
  }
  
  // Resolve fields for preview (handling inheritance)
  let resolvedFields = [];
  if (editing.value.inheritFormFromId) {
    const parent = options.value.find(o => o.id === editing.value.inheritFormFromId);
    if (parent) {
      try {
        resolvedFields = JSON.parse(parent.formFields || '[]');
      } catch {}
    }
  } else {
    resolvedFields = editing.value.formFields || [];
  }

  if (resolvedFields.length) {
    // Flatten fields for display in preview (simple text representation)
    const displayList = [];
    function flatten(list) {
      for (const x of list) {
        if (!x.label) continue;
        if (x.type === 'select') {
          displayList.push(`**${x.label}**: _(chọn từ dropdown)_`);
          // Just show the first option's subfields as preview example
          if (x.options?.[0]?.fields?.length) {
            flatten(x.options[0].fields);
          }
        } else {
          displayList.push(`**${x.label}**: _${x.placeholder || 'nhập thông tin...'}_`);
        }
      }
    }
    flatten(resolvedFields);
    
    const text = displayList.slice(0, 6).join('\n');
    if (text) f.push({ name: '📝 Thông Tin User Cung Cấp', value: text, inline: false });
  }
  return f;
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Options</h1>
      <p class="page-sub">{{ options.length }} loại ticket · user chọn từ select menu</p>
    </div>
    <StButton v-if="auth.isAdmin" variant="primary" @click="openCreate">
      <span class="material-symbols-outlined symbol-sm" style="vertical-align: middle; margin-right: 4px;">add</span>
      Thêm option
    </StButton>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Tên</th><th>Emoji</th><th>Tickets</th><th>Form</th><th>Auto</th><th>Active</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!options.length"><td colspan="7" class="empty">Chưa có option nào</td></tr>
        <tr v-for="o in options" :key="o.id">
          <td>
            <strong>{{ o.name }}</strong>
            <div class="muted text-xs">{{ o.description || '—' }}</div>
          </td>
          <td style="font-size: 22px;">{{ o.emoji }}</td>
          <td><span class="badge badge-gray">{{ o._count?.tickets ?? 0 }}</span></td>
          <td>
            <span v-if="o.formFields && o.formFields !== '[]'" class="badge badge-brand" style="color: var(--on-surface-variant); padding: 3px 8px;">
              <span class="material-symbols-outlined symbol-sm">list_alt</span>
            </span>
            <span v-else class="muted text-xs">—</span>
          </td>
          <td>
            <span v-if="o.autoCloseHours || o.autoEscalateMinutes" class="badge badge-yellow" style="color: var(--on-surface-variant); padding: 3px 8px;">
              <span class="material-symbols-outlined symbol-sm">smart_toy</span>
            </span>
            <span v-else class="muted text-xs">—</span>
          </td>
          <td><Switch :model-value="o.isActive" :disabled="!auth.isAdmin" @update:model-value="auth.isAdmin ? toggle(o) : null" /></td>
          <td style="white-space: nowrap;">
            <StButton v-if="auth.isAdmin" variant="ghost" size="sm" @click="openEdit(o)">Sửa</StButton>
            <StButton v-else variant="ghost" size="sm" @click="openEdit(o)">Xem chi tiết</StButton>
            <StButton v-if="auth.isAdmin" variant="danger" size="sm" @click="remove(o)" style="margin-left: 6px;">Xóa</StButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <Modal v-if="editing" :model-value="!!editing" size="xl" @close="editing = null">
    <template #title>
      <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 6px;">{{ editing.id ? 'edit_note' : 'add_box' }}</span>
      {{ auth.isAdmin ? (editing.id ? 'Sửa option' : 'Tạo option mới') : 'Chi tiết Option (Chỉ xem)' }}
    </template>

    <Tabs v-model="editTab" :tabs="EDIT_TABS" />

    <div style="display: grid; grid-template-columns: 1fr 420px; gap: 20px;">
      <div>
        <!-- Basic -->
        <template v-if="editTab === 'basic'">
          <div class="form-row"><label>Tên</label><input v-model="editing.name" :disabled="!auth.isAdmin" /></div>
          <div class="grid-2">
            <div class="form-row"><label>Emoji</label><input v-model="editing.emoji" :disabled="!auth.isAdmin" /></div>
            <div class="form-row"><label>Màu chủ đạo</label><input v-model="editing.color" type="color" :disabled="!auth.isAdmin" /></div>
          </div>
          <div class="form-row"><label>Mô tả</label><input v-model="editing.description" :disabled="!auth.isAdmin" /></div>
          <div class="form-row">
            <label>Áp dụng cho cụm</label>
            <div class="flex gap-2" style="flex-wrap: wrap;">
              <button type="button" class="btn btn-sm" :class="optionClusterKeys().includes('*') ? 'btn-primary' : 'btn-ghost'" :disabled="!auth.isAdmin" @click="toggleOptionCluster('*')">🌐 Tất cả</button>
              <button v-for="cluster in clusters" :key="cluster.key" type="button" class="btn btn-sm" :class="optionClusterKeys().includes(cluster.key) ? 'btn-primary' : 'btn-ghost'" :disabled="!auth.isAdmin" @click="toggleOptionCluster(cluster.key)">
                {{ cluster.emoji }} {{ cluster.name }}
              </button>
            </div>
            <div class="muted text-xs" style="margin-top: 6px;">AI chỉ đề xuất loại ticket này trong các cụm đã chọn.</div>
          </div>
          <div class="form-row"><label>Discord Category ID (tùy chọn)</label><input v-model="editing.discordCategoryId" :disabled="!auth.isAdmin" /></div>
          <Switch v-model="editing.isActive" :disabled="!auth.isAdmin">Active</Switch>
        </template>

        <!-- Welcome -->
        <template v-if="editTab === 'welcome'">
          <div class="form-row">
            <label>Welcome message</label>
            <textarea v-model="editing.welcomeMessage" :disabled="!auth.isAdmin" style="min-height: 140px;"></textarea>
            <div class="muted text-xs">Gửi vào channel ngay sau khi tạo ticket</div>
          </div>
        </template>

        <!-- Custom embed -->
        <template v-if="editTab === 'embed'">
          <Switch v-model="editing.customEmbedEnabled" :disabled="!auth.isAdmin">
            <div>
              <div style="font-weight: 600;">Dùng embed riêng cho option này</div>
              <div class="muted text-xs">Override global config khi tạo ticket loại này</div>
            </div>
          </Switch>
          <div :style="{ opacity: editing.customEmbedEnabled ? 1 : 0.4, pointerEvents: editing.customEmbedEnabled && auth.isAdmin ? 'auto' : 'none', marginTop: '14px' }">
            <div class="grid-2">
              <div class="form-row"><label>Title</label><input v-model="editing.ticketTitle" :disabled="!auth.isAdmin" /></div>
              <div class="form-row"><label>Màu</label><input v-model="editing.ticketColor" type="color" :disabled="!auth.isAdmin" /></div>
            </div>
            <div class="form-row"><label>Description</label><textarea v-model="editing.ticketDesc" :disabled="!auth.isAdmin"></textarea></div>
            <div class="form-row"><label>Guidance</label><textarea v-model="editing.ticketGuidance" :disabled="!auth.isAdmin"></textarea></div>
            <div class="form-row"><label>Footer</label><input v-model="editing.ticketFooter" :disabled="!auth.isAdmin" /></div>
          </div>
        </template>

        <!-- Form -->
        <template v-if="editTab === 'form'">
          <div class="form-row" style="margin-bottom: 16px;">
            <label>Kế thừa biểu mẫu (Form fields inheritance)</label>
            <select v-model="editing.inheritFormFromId" :disabled="!auth.isAdmin" style="width: 100%; font-size: 13px; padding: 8px; border-radius: 6px; background: var(--surface-container-high); border: 1px solid var(--outline-variant); color: var(--on-surface);">
              <option :value="null">❌ Không kế thừa (Tự cấu hình biểu mẫu riêng)</option>
              <option v-for="o in options.filter(x => x.id !== editing.id)" :key="o.id" :value="o.id">
                🔗 Kế thừa từ: {{ o.name }}
              </option>
            </select>
            <div class="muted text-xs" style="margin-top: 4px;">Nếu chọn kế thừa, biểu mẫu này sẽ sử dụng toàn bộ cấu hình trường thông tin từ option được chọn.</div>
          </div>

          <div v-if="editing.inheritFormFromId" class="card" style="padding: 16px; background: rgba(88, 101, 242, 0.05); border: 1px solid rgba(88, 101, 242, 0.2); border-radius: 8px; text-align: center; margin-bottom: 16px;">
            <span class="material-symbols-outlined" style="font-size: 32px; color: #5865F2; margin-bottom: 8px; display: block; text-align: center;">link</span>
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--on-surface);">
              Đang kế thừa biểu mẫu từ "{{ options.find(x => x.id === editing.inheritFormFromId)?.name }}"
            </div>
            <div class="muted text-xs">Biểu mẫu tự cấu hình của option này đã bị tạm ẩn và không sử dụng. Hãy sửa biểu mẫu ở option nguồn để áp dụng thay đổi.</div>
          </div>
          
          <template v-else>
            <p class="muted text-sm" style="margin-bottom: 12px;">
              Định nghĩa form user phải điền khi chọn option này.
            </p>
            <FormFieldBuilder v-model="editing.formFields" :disabled="!auth.isAdmin" />
          </template>
        </template>

        <!-- Auto -->
        <template v-if="editTab === 'auto'">
          <div class="form-row">
            <label>⏰ Auto-close sau (giờ) — để trống dùng global default</label>
            <input v-model.number="editing.autoCloseHours" type="number" min="0" :disabled="!auth.isAdmin" placeholder="VD: 48" />
            <div class="muted text-xs">0 = tắt. Ticket inactive đủ giờ này sẽ tự đóng.</div>
          </div>
          <div class="form-row">
            <label>🚨 Auto-escalate sau (phút) khi chưa claim</label>
            <input v-model.number="editing.autoEscalateMinutes" type="number" min="0" :disabled="!auth.isAdmin" placeholder="VD: 15" />
            <div class="muted text-xs">Tự đổi priority sang urgent + ping staff role.</div>
          </div>
          <div class="form-row">
            <label>⚡ SLA target first response (phút)</label>
            <input v-model.number="editing.slaResponseMinutes" type="number" min="0" :disabled="!auth.isAdmin" placeholder="VD: 30" />
            <div class="muted text-xs">Vượt thời gian này mà chưa có staff reply → breach + alert.</div>
          </div>
          <div class="form-row">
            <label>👥 Max tickets mở cùng lúc / user (0 = không giới hạn)</label>
            <input v-model.number="editing.maxOpenPerUser" type="number" min="0" :disabled="!auth.isAdmin" />
          </div>
        </template>

        <!-- Access -->
        <template v-if="editTab === 'access'">
          <div class="form-row">
            <label>🛡️ Staff role IDs được phép xem option này (CSV)</label>
            <input v-model="editing.allowedStaffRoles" :disabled="!auth.isAdmin" placeholder="123,456 (để trống = mọi staff)" />
            <div class="muted text-xs">Chỉ staff có role trong danh sách mới thấy ticket loại này trên dashboard.</div>
          </div>
          <div class="form-row" style="margin-top: 14px;">
            <label>👥 Ping Roles khi tạo ticket (CSV/mentions)</label>
            <input v-model="editing.pingRoles" :disabled="!auth.isAdmin" placeholder="role_id1, role_id2 (ngăn cách bằng dấu phẩy)" />
            <div class="muted text-xs">Nhập danh sách ID role Discord để ping khi ticket mới được tạo.</div>
          </div>
          <div class="form-row" style="margin-top: 14px;">
            <label>👤 Ping Staff cụ thể khi tạo ticket (CSV/mentions)</label>
            <input v-model="editing.pingUsers" :disabled="!auth.isAdmin" placeholder="user_id1, user_id2 (ngăn cách bằng dấu phẩy)" />
            <div class="muted text-xs">Nhập danh sách ID người dùng Discord (staff) cụ thể để ping khi ticket mới được tạo.</div>
          </div>
        </template>
      </div>

      <!-- LIVE PREVIEW -->
      <div style="position: sticky; top: 0;">
        <div class="card card-glass" style="padding: 16px;">
          <div class="flex" style="align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h4 style="margin: 0; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; color: var(--on-surface-variant);">
              <span class="material-symbols-outlined symbol-sm">visibility</span>
              Preview
            </h4>
            <span v-if="editing.customEmbedEnabled" class="badge badge-brand">Custom</span>
          </div>
          <DiscordEmbedPreview
            v-if="previewEmbed"
            :title="previewEmbed.title"
            :description="previewEmbed.description"
            :color="previewEmbed.color"
            :footer="previewEmbed.footer"
            :fields="previewFields()"
            :vars="{ ticketNum: '0042', user: '@Bạn', optionName: editing.name || '' }"
            content="@Bạn"
            :buttons="[{ label: '✅ Claim', style: 'success' }, { label: '🔒 Close', style: 'danger' }]"
          />
        </div>
      </div>
    </div>

    <template #actions="{ close }">
      <StButton variant="ghost" @click="close">{{ auth.isAdmin ? 'Hủy' : 'Đóng' }}</StButton>
      <StButton v-if="auth.isAdmin" variant="primary" :disabled="saving" @click="save">
        <span class="material-symbols-outlined symbol-sm" style="vertical-align: middle; margin-right: 4px;">{{ saving ? 'progress_activity' : 'save' }}</span>
        {{ saving ? 'Đang lưu...' : 'Lưu' }}
      </StButton>
    </template>
  </Modal>
</template>

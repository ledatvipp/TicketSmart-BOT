<script setup>
import { onMounted, ref } from 'vue';
import { IntelligenceAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import StButton from '../components/StButton.vue';
import Tabs from '../components/Tabs.vue';

const auth = useAuth();
const toast = useToast();
const overview = ref(null);
const detections = ref([]);
const detectionTotal = ref(0);
const actions = ref([]);
const actionTotal = ref(0);
const conversations = ref([]);
const conversationTotal = ref(0);
const tab = ref('detections');
const loading = ref(false);
const TABS = [
  { value: 'detections', label: 'Intent Logs', icon: 'psychology' },
  { value: 'actions', label: 'Action Logs', icon: 'bolt' },
  { value: 'conversations', label: 'Hội thoại', icon: 'forum' },
];

function fmt(date) { return new Date(date).toLocaleString('vi-VN'); }
function pct(value) { return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`; }
function json(value) { try { return JSON.stringify(value, null, 2); } catch { return '{}'; } }

async function load() {
  loading.value = true;
  try {
    const [o, d, a, c] = await Promise.all([
      IntelligenceAPI.overview(),
      IntelligenceAPI.detections({ limit: 50 }),
      IntelligenceAPI.actions({ limit: 50 }),
      IntelligenceAPI.conversations({ limit: 50 }),
    ]);
    overview.value = o;
    detections.value = d.items || [];
    detectionTotal.value = d.total || 0;
    actions.value = a.items || [];
    actionTotal.value = a.total || 0;
    conversations.value = c.items || [];
    conversationTotal.value = c.total || 0;
  } catch (error) { toast.error(error.response?.data?.message || 'Không tải được AI Overview'); }
  finally { loading.value = false; }
}
onMounted(load);

async function approveFeedback(item) {
  if (!item.feedback?.id) return;
  await IntelligenceAPI.reviewFeedback(item.feedback.id, { approvedForTraining: !item.feedback.approvedForTraining });
  toast.success('Đã cập nhật trạng thái duyệt');
  await load();
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">AI & Action Overview</h1>
      <p class="page-sub">Theo dõi intent, độ chính xác, phản hồi và thao tác do bot thực hiện</p>
    </div>
    <StButton variant="ghost" :loading="loading" @click="load">Làm mới</StButton>
  </div>

  <div v-if="overview" class="grid-4" style="margin-bottom: 18px;">
    <div class="card"><div class="muted text-xs">DETECTIONS / 30 NGÀY</div><div class="stat-value">{{ overview.detections }}</div></div>
    <div class="card"><div class="muted text-xs">HELPFUL RATE</div><div class="stat-value">{{ pct(overview.helpfulRate) }}</div></div>
    <div class="card"><div class="muted text-xs">ACTIONS</div><div class="stat-value">{{ overview.actions }}</div><div class="muted text-xs">{{ overview.failedActions }} thất bại</div></div>
    <div class="card"><div class="muted text-xs">KNOWLEDGE ACTIVE</div><div class="stat-value">{{ overview.knowledge }}</div></div>
    <div class="card"><div class="muted text-xs">HỘI THOẠI ĐANG NHỚ</div><div class="stat-value">{{ overview.activeConversations || 0 }}</div></div>
    <div class="card"><div class="muted text-xs">ĐANG CHỜ XÁC NHẬN</div><div class="stat-value">{{ overview.awaitingClarification || 0 }}</div></div>
  </div>

  <div v-if="overview" class="grid-3" style="margin-bottom: 18px; align-items: start;">
    <div class="card">
      <h3 style="margin-top: 0;">Top intent</h3>
      <div v-for="x in overview.byIntent" :key="x.key" class="flex" style="justify-content: space-between; margin: 7px 0;"><code>{{ x.key }}</code><span class="badge badge-brand">{{ x.count }}</span></div>
    </div>
    <div class="card">
      <h3 style="margin-top: 0;">Nguồn phân loại</h3>
      <div v-for="x in overview.bySource" :key="x.key" class="flex" style="justify-content: space-between; margin: 7px 0;"><span>{{ x.key }}</span><span class="badge badge-gray">{{ x.count }}</span></div>
    </div>
    <div class="card">
      <h3 style="margin-top: 0;">Top action</h3>
      <div v-for="x in overview.byAction" :key="x.key" class="flex" style="justify-content: space-between; margin: 7px 0;"><code>{{ x.key }}</code><span class="badge badge-green">{{ x.count }}</span></div>
    </div>
  </div>

  <Tabs v-model="tab" :tabs="TABS" />

  <div v-if="tab === 'detections'" class="card" style="padding: 0; overflow: auto; margin-top: 14px;">
    <table class="data-table">
      <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Intent</th><th>Nguồn</th><th>Confidence</th><th>Trạng thái</th><th>Knowledge</th><th>Feedback</th></tr></thead>
      <tbody>
        <tr v-for="item in detections" :key="item.id">
          <td class="text-xs">{{ fmt(item.createdAt) }}</td>
          <td><code>{{ item.userId }}</code></td>
          <td><strong>{{ item.intentKey }}</strong><div class="muted text-xs" style="max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ item.content }}</div></td>
          <td><span class="badge badge-gray">{{ item.source }}</span></td>
          <td>{{ pct(item.confidence) }}</td>
          <td><span class="badge badge-brand">{{ item.status }}</span></td>
          <td class="text-xs">{{ item.metadata?.knowledgeArticleIds?.length || 0 }} bài</td>
          <td>
            <span v-if="!item.feedback" class="muted">—</span>
            <div v-else class="flex gap-2" style="align-items: center;">
              <span>{{ item.feedback.helpful === true ? '👍' : item.feedback.helpful === false ? '👎' : '❔' }}</span>
              <StButton v-if="auth.isAdmin" variant="ghost" size="sm" @click="approveFeedback(item)">{{ item.feedback.approvedForTraining ? 'Đã duyệt' : 'Duyệt học' }}</StButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!detections.length" class="empty">Chưa có detection nào</div>
    <div class="muted text-xs" style="padding: 12px;">Hiển thị {{ detections.length }}/{{ detectionTotal }}</div>
  </div>

  <div v-if="tab === 'actions'" class="card" style="padding: 0; overflow: auto; margin-top: 14px;">
    <table class="data-table">
      <thead><tr><th>Thời gian</th><th>Action</th><th>User</th><th>Trạng thái</th><th>Latency</th><th>Kết quả</th></tr></thead>
      <tbody>
        <tr v-for="item in actions" :key="item.id">
          <td class="text-xs">{{ fmt(item.createdAt) }}</td>
          <td><strong>{{ item.actionName }}</strong></td>
          <td><code>{{ item.userId }}</code></td>
          <td><span :class="['badge', item.status === 'failed' ? 'badge-red' : item.status === 'started' ? 'badge-gray' : 'badge-green']">{{ item.status }}</span></td>
          <td>{{ item.latencyMs }}ms</td>
          <td><details><summary class="muted text-xs">Xem JSON</summary><pre style="max-width: 420px; white-space: pre-wrap;">{{ json(item.error ? { error: item.error, result: item.result } : item.result) }}</pre></details></td>
        </tr>
      </tbody>
    </table>
    <div v-if="!actions.length" class="empty">Chưa có action execution</div>
    <div class="muted text-xs" style="padding: 12px;">Hiển thị {{ actions.length }}/{{ actionTotal }}</div>
  </div>

  <div v-if="tab === 'conversations'" class="card" style="padding: 0; overflow: auto; margin-top: 14px;">
    <table class="data-table">
      <thead><tr><th>Cập nhật</th><th>User</th><th>Trạng thái</th><th>Intent cuối</th><th>Số lượt</th><th>Hết hạn</th><th>Đang chờ</th></tr></thead>
      <tbody>
        <tr v-for="item in conversations" :key="item.id">
          <td class="text-xs">{{ fmt(item.updatedAt) }}</td>
          <td><code>{{ item.userId }}</code><div class="muted text-xs">#{{ item.channelId }}</div></td>
          <td><span :class="['badge', item.status === 'awaiting_clarification' ? 'badge-brand' : 'badge-green']">{{ item.status }}</span></td>
          <td><strong>{{ item.lastIntentKey || '—' }}</strong></td>
          <td>{{ item.turnCount }}</td>
          <td class="text-xs">{{ fmt(item.expiresAt) }}</td>
          <td class="text-xs">{{ item.pendingIntents?.map(x => x.label || x.key).join(', ') || '—' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!conversations.length" class="empty">Chưa có hội thoại đang lưu</div>
    <div class="muted text-xs" style="padding: 12px;">Hiển thị {{ conversations.length }}/{{ conversationTotal }}</div>
  </div>
</template>

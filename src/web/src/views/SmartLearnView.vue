<script setup>
import { computed, onMounted, ref } from 'vue';
import { SmartLearnAPI, ClustersAPI, ConfigAPI, KnowledgeAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import { useAuth } from '../stores/auth';

const toast = useToast();
const auth = useAuth();
const overview = ref(null);
const clusters = ref([]);
const knowledgeOptions = ref([]);
const items = ref([]);
const total = ref(0);
const loading = ref(false);
const busy = ref(false);
const status = ref('PENDING');
const clusterKey = ref('all');
const typeFilter = ref('all');
const sortMode = ref('priority');
const search = ref('');
const selected = ref(null);
const reviewMode = ref(null);
const reviewForm = ref({ title: '', answer: '', keywords: '', reason: '', targetArticleId: '' });
const settingsOpen = ref(false);
const settings = ref(null);
const savingSettings = ref(false);

const candidateTypes = [
  { value: 'all', label: 'Mọi loại' },
  { value: 'NEW_ARTICLE', label: 'Kiến thức mới' },
  { value: 'ADD_ALIAS', label: 'Thêm câu tương tự' },
  { value: 'VERIFY_EXISTING', label: 'Xác minh bài cũ' },
  { value: 'REVISE_ARTICLE', label: 'Sửa kiến thức' },
];

const statuses = [
  { value: 'PENDING', label: 'Chờ duyệt', icon: 'pending_actions' },
  { value: 'NEEDS_ADMIN', label: 'Cần Admin', icon: 'admin_panel_settings' },
  { value: 'CONFLICTED', label: 'Tranh luận', icon: 'warning' },
  { value: 'PUBLISHING', label: 'Đang xuất bản', icon: 'sync' },
  { value: 'APPROVED', label: 'Đã duyệt', icon: 'verified' },
  { value: 'REJECTED', label: 'Từ chối', icon: 'block' },
  { value: 'all', label: 'Tất cả', icon: 'dataset' },
];

const clusterMap = computed(() => new Map(clusters.value.map((item) => [item.key, item])));
function clusterOf(item) { return clusterMap.value.get(item.clusterKey) || null; }
function fmt(date) { return date ? new Date(date).toLocaleString('vi-VN') : '—'; }
function examples(item) {
  return Array.isArray(item.sourceExamples) ? item.sourceExamples : [];
}
function statusClass(value) {
  return ({ PENDING: 'pending', NEEDS_ADMIN: 'admin', CONFLICTED: 'conflict', PUBLISHING: 'publishing', APPROVED: 'approved', REJECTED: 'rejected' })[value] || '';
}
function statusLabel(value) {
  return statuses.find((item) => item.value === value)?.label || value;
}
function typeLabel(value) { return candidateTypes.find((item) => item.value === value)?.label || value || 'Kiến thức mới'; }
function targetTitle(item) { return item.targetArticle?.title || 'Chưa có bài gợi ý'; }

async function load() {
  loading.value = true;
  try {
    const [o, list] = await Promise.all([
      SmartLearnAPI.overview(),
      SmartLearnAPI.list({
        status: status.value,
        clusterKey: clusterKey.value,
        type: typeFilter.value,
        search: search.value || undefined,
        sort: sortMode.value,
        limit: 100,
      }),
    ]);
    overview.value = o;
    items.value = list.items || [];
    total.value = list.total || 0;
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không tải được SmartLearn');
  } finally { loading.value = false; }
}

onMounted(async () => {
  const [clusterRows, config, knowledge] = await Promise.all([
    ClustersAPI.list({ active: true }).catch(() => []),
    ConfigAPI.get().catch(() => null),
    KnowledgeAPI.list({ all: 'true', limit: 100 }).catch(() => ({ items: [] })),
  ]);
  clusters.value = clusterRows;
  settings.value = config;
  knowledgeOptions.value = knowledge.items || [];
  await load();
});

async function saveSettings() {
  if (!settings.value) return;
  savingSettings.value = true;
  try {
    settings.value = await ConfigAPI.update(settings.value);
    toast.success('Đã lưu cấu hình SmartLearn');
    settingsOpen.value = false;
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không lưu được cấu hình');
  } finally { savingSettings.value = false; }
}

function openCandidate(item) {
  selected.value = item;
  reviewMode.value = null;
}

function openReview(mode) {
  reviewMode.value = mode;
  reviewForm.value = {
    title: selected.value?.proposedTitle || selected.value?.question || '',
    answer: selected.value?.proposedAnswer || '',
    keywords: selected.value?.proposedKeywords || '',
    reason: '',
    targetArticleId: selected.value?.targetArticleId || '',
  };
}

async function submitReview(action) {
  if (!selected.value) return;
  busy.value = true;
  try {
    const payload = { action };
    if (action === 'REJECT') payload.reason = reviewForm.value.reason;
    if (action === 'ALTERNATIVE') Object.assign(payload, reviewForm.value);
    if (action === 'LINK_EXISTING') payload.targetArticleId = reviewForm.value.targetArticleId;
    const result = await SmartLearnAPI.review(selected.value.id, payload);
    toast.success(result.published ? 'Đã xuất bản Knowledge Article' : 'Đã ghi nhận review');
    selected.value = result.candidate;
    reviewMode.value = null;
    await load();
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không xử lý được review');
  } finally { busy.value = false; }
}
</script>

<template>
  <div class="smartlearn-page">
    <section class="sl-hero">
      <div>
        <div class="sl-eyebrow"><span class="material-symbols-outlined">school</span> HUMAN VERIFIED KNOWLEDGE</div>
        <h1>SmartLearn Control Center</h1>
        <p>Biến câu hỏi thật của người chơi thành kiến thức đã được staff xác minh — không cần phụ thuộc AI Provider.</p>
      </div>
      <div class="sl-hero-actions">
        <StButton v-if="auth.isAdmin" variant="ghost" @click="settingsOpen = true">Cấu hình</StButton>
        <StButton variant="ghost" :loading="loading" @click="load">Làm mới</StButton>
        <RouterLink to="/knowledge" class="btn btn-primary">Mở Knowledge Base</RouterLink>
      </div>
    </section>

    <section v-if="overview" class="sl-metrics">
      <article class="sl-metric accent-orange">
        <span class="material-symbols-outlined">pending_actions</span>
        <div><small>CHỜ XÁC MINH</small><strong>{{ overview.pending }}</strong><em>Cần reviewer xử lý</em></div>
      </article>
      <article class="sl-metric accent-green">
        <span class="material-symbols-outlined">verified</span>
        <div><small>ĐÃ XUẤT BẢN</small><strong>{{ overview.approved }}</strong><em>Knowledge đã kiểm duyệt</em></div>
      </article>
      <article class="sl-metric accent-purple">
        <span class="material-symbols-outlined">hub</span>
        <div><small>CÂU HỎI ĐÃ GỘP</small><strong>{{ overview.totalOccurrences }}</strong><em>Giảm spam hàng đợi</em></div>
      </article>
      <article class="sl-metric accent-blue">
        <span class="material-symbols-outlined">auto_stories</span>
        <div><small>KNOWLEDGE ACTIVE</small><strong>{{ overview.activeArticles }}</strong><em>Sẵn sàng trả lời miễn phí</em></div>
      </article>
      <article class="sl-metric accent-purple">
        <span class="material-symbols-outlined">model_training</span>
        <div><small>AVG LEARNING</small><strong>{{ Math.round((overview.avgLearningScore || 0) * 100) }}%</strong><em>{{ overview.strongCandidates || 0 }} candidate mạnh</em></div>
      </article>
      <article class="sl-metric accent-orange">
        <span class="material-symbols-outlined">crisis_alert</span>
        <div><small>CONFLICT ALERT</small><strong>{{ overview.highConflict || 0 }}</strong><em>Cần ưu tiên xác minh</em></div>
      </article>
    </section>

    <section class="sl-toolbar card">
      <div class="sl-tabs">
        <button v-for="tab in statuses" :key="tab.value" :class="['sl-tab', { active: status === tab.value }]" @click="status = tab.value; load()">
          <span class="material-symbols-outlined">{{ tab.icon }}</span>{{ tab.label }}
        </button>
      </div>
      <div class="sl-filters">
        <div class="sl-search"><span class="material-symbols-outlined">search</span><input v-model="search" placeholder="Tìm câu hỏi, câu trả lời, người hỏi..." @keyup.enter="load" /></div>
        <select v-model="clusterKey" @change="load">
          <option value="all">🌐 Tất cả cụm</option>
          <option v-for="cluster in clusters" :key="cluster.key" :value="cluster.key">{{ cluster.emoji }} {{ cluster.name }}</option>
        </select>
        <select v-model="typeFilter" @change="load">
          <option v-for="row in candidateTypes" :key="row.value" :value="row.value">{{ row.label }}</option>
        </select>
        <select v-model="sortMode" @change="load">
          <option value="priority">Ưu tiên review</option>
          <option value="learning">Learning score cao</option>
          <option value="conflict">Conflict cao</option>
          <option value="occurrences">Được hỏi nhiều</option>
          <option value="newest">Mới nhất</option>
        </select>
      </div>
    </section>

    <div v-if="loading" class="sl-empty">Đang tải hàng đợi...</div>
    <section v-else class="sl-queue">
      <article v-for="item in items" :key="item.id" class="sl-candidate" @click="openCandidate(item)">
        <div class="sl-candidate-head">
          <div class="sl-cluster" :style="{ '--cluster': clusterOf(item)?.color || '#5865f2' }">
            <span>{{ clusterOf(item)?.emoji || '🌐' }}</span>
            <div><strong>{{ clusterOf(item)?.name || 'Toàn hệ thống' }}</strong><small>{{ item.intentKey || 'UNKNOWN' }}</small></div>
          </div>
          <span :class="['sl-status', statusClass(item.status)]">{{ statusLabel(item.status) }}</span>
        </div>
        <h3>{{ item.question }}</h3>
        <p>{{ item.proposedAnswer || 'Chưa có câu trả lời đề xuất — reviewer cần nhập câu trả lời khác.' }}</p>
        <div class="sl-candidate-type">
          <span>{{ typeLabel(item.candidateType) }}</span>
          <em v-if="item.targetArticle">→ {{ item.targetArticle.title }}</em>
          <strong>Priority {{ Math.round(item.priorityScore || 0) }}</strong>
        </div>
        <div class="sl-candidate-meta">
          <span><span class="material-symbols-outlined">repeat</span>{{ item.occurrenceCount }} lượt hỏi</span>
          <span><span class="material-symbols-outlined">thumb_up</span>{{ item.approvalCount }}</span>
          <span><span class="material-symbols-outlined">thumb_down</span>{{ item.rejectionCount }}</span>
          <span><span class="material-symbols-outlined">psychology</span>Learn {{ Math.round((item.learningScore || 0) * 100) }}%</span>
          <span><span class="material-symbols-outlined">diversity_3</span>{{ item.sourceDiversity || 1 }} nguồn</span>
          <span><span class="material-symbols-outlined">target</span>{{ Math.round((item.matchScore || 0) * 100) }}%</span>
          <span v-if="item.conflictScore"><span class="material-symbols-outlined">warning</span>Conflict {{ Math.round((item.conflictScore || 0) * 100) }}%</span>
          <span><span class="material-symbols-outlined">schedule</span>{{ fmt(item.updatedAt) }}</span>
        </div>
        <div class="sl-risk" v-if="item.riskLevel === 'ADMIN_REQUIRED'"><span class="material-symbols-outlined">lock</span>Bắt buộc Admin xác minh</div>
      </article>
      <div v-if="!items.length" class="sl-empty card">Không có candidate phù hợp bộ lọc hiện tại.</div>
    </section>
    <div class="muted text-xs" style="margin-top: 14px;">Hiển thị {{ items.length }}/{{ total }} candidate</div>

    <Modal v-if="selected" :model-value="true" size="xl" @close="selected = null">
      <template #title>📚 Review Knowledge Candidate</template>
      <div class="sl-review-layout">
        <div class="sl-review-main">
          <div class="sl-review-block">
            <span class="sl-label">CÂU HỎI</span>
            <h2>{{ selected.question }}</h2>
          </div>
          <div class="sl-review-block answer">
            <span class="sl-label">CÂU TRẢ LỜI ĐỀ XUẤT</span>
            <p>{{ selected.proposedAnswer || 'Chưa có câu trả lời đề xuất.' }}</p>
          </div>
          <div v-if="examples(selected).length > 1" class="sl-review-block">
            <span class="sl-label">CÂU TƯƠNG TỰ ĐÃ GỘP</span>
            <ul class="sl-example-list">
              <li v-for="(example, index) in examples(selected)" :key="index">
                <strong>{{ example.question }}</strong>
                <small v-if="example.proposedAnswer">Nguồn trả lời: {{ example.proposedAnswer }}</small>
                <small v-if="example.observedAnswer" class="sl-observed-bad">Câu trả lời bị đánh giá lỗi: {{ example.observedAnswer }}</small>
                <em>Confidence {{ Math.round((example.sourceConfidence || 0) * 100) }}% • Evidence {{ Math.round((example.evidenceScore || 0) * 100) }}%</em>
              </li>
            </ul>
          </div>
          <div v-if="selected.reviews?.length" class="sl-review-block">
            <span class="sl-label">LỊCH SỬ REVIEW</span>
            <div v-for="review in selected.reviews" :key="review.id" class="sl-review-entry">
              <strong>{{ review.reviewerName }}</strong><span>{{ review.action }}</span><small>{{ review.reason || review.answer || fmt(review.updatedAt) }}</small>
            </div>
          </div>
        </div>
        <aside class="sl-review-side">
          <div class="sl-side-card">
            <span class="sl-label">PHÂN LOẠI</span>
            <div class="sl-kv"><span>Cụm</span><strong>{{ clusterOf(selected)?.emoji }} {{ clusterOf(selected)?.name || 'Global' }}</strong></div>
            <div class="sl-kv"><span>Intent</span><strong>{{ selected.intentKey || 'UNKNOWN' }}</strong></div>
            <div class="sl-kv"><span>Flow</span><strong>{{ typeLabel(selected.candidateType) }}</strong></div>
            <div class="sl-kv"><span>Bài gợi ý</span><strong>{{ targetTitle(selected) }}</strong></div>
            <div class="sl-kv"><span>Match score</span><strong>{{ Math.round((selected.matchScore || 0) * 100) }}%</strong></div>
            <div class="sl-kv"><span>Priority</span><strong>{{ Math.round(selected.priorityScore || 0) }}</strong></div>
            <div class="sl-kv"><span>Learning score</span><strong>{{ Math.round((selected.learningScore || 0) * 100) }}%</strong></div>
            <div class="sl-kv"><span>Evidence</span><strong>{{ Math.round((selected.evidenceScore || 0) * 100) }}%</strong></div>
            <div class="sl-kv"><span>Source diversity</span><strong>{{ selected.sourceDiversity || 1 }}</strong></div>
            <div class="sl-kv"><span>Conflict</span><strong>{{ Math.round((selected.conflictScore || 0) * 100) }}%</strong></div>
            <div class="sl-kv"><span>Negative signals</span><strong>{{ selected.negativeSignalCount || 0 }}</strong></div>
            <div class="sl-kv"><span>Trạng thái</span><strong>{{ statusLabel(selected.status) }}</strong></div>
            <div class="sl-kv"><span>Occurrences</span><strong>{{ selected.occurrenceCount }}</strong></div>
            <div class="sl-kv"><span>Nguồn</span><strong>{{ selected.sourceType }}</strong></div>
          </div>
          <div v-if="!['APPROVED','REJECTED','PUBLISHING'].includes(selected.status)" class="sl-review-actions">
            <StButton variant="primary" :loading="busy" @click="submitReview('APPROVE')">✅ Duyệt</StButton>
            <StButton variant="danger" @click="openReview('reject')">❌ Từ chối</StButton>
            <StButton variant="ghost" @click="openReview('alternative')">✍️ Câu trả lời khác</StButton>
            <StButton variant="ghost" @click="openReview('link')">🔗 Gộp vào kiến thức</StButton>
          </div>
          <div v-else class="sl-final-state" :class="statusClass(selected.status)">{{ statusLabel(selected.status) }}</div>
        </aside>
      </div>
    </Modal>



    <Modal v-if="settingsOpen && settings" :model-value="true" size="lg" @close="settingsOpen = false">
      <template #title>⚙️ Cấu hình SmartLearn</template>
      <div class="sl-settings-grid">
        <label class="sl-setting-toggle">
          <input v-model="settings.smartLearnEnabled" type="checkbox" />
          <span><strong>Bật SmartLearn</strong><small>Tạo candidate từ câu hỏi chưa có kiến thức xác minh</small></span>
        </label>
        <label class="sl-setting-toggle">
          <input v-model="settings.smartLearnCreateFromNegativeVote" type="checkbox" />
          <span><strong>Học từ phản hồi 👎</strong><small>Đưa câu trả lời bị đánh giá sai vào queue review</small></span>
        </label>
        <label class="sl-setting-toggle">
          <input v-model="settings.smartLearnNotifyUser" type="checkbox" />
          <span><strong>Thông báo người hỏi</strong><small>DM người chơi khi câu trả lời đã được staff duyệt</small></span>
        </label>
        <label class="sl-setting-toggle">
          <input v-model="settings.smartLearnFromResolvedTickets" type="checkbox" />
          <span><strong>Học từ ticket đã giải quyết</strong><small>Chỉ lấy câu hỏi public của member + câu trả lời public từ staff đã xác minh; tự redact credential/PII cơ bản.</small></span>
        </label>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <div class="form-row"><label>Review Channel ID</label><input v-model="settings.smartLearnReviewChannelId" placeholder="123456789012345678" /></div>
        <div class="form-row"><label>Delivery mode</label><select v-model="settings.smartLearnDeliveryMode"><option value="channel">Review channel</option><option value="dm">DM reviewer</option><option value="both">Channel + DM</option></select></div>
      </div>
      <div class="grid-2">
        <div class="form-row"><label>Reviewer Role IDs (CSV)</label><input v-model="settings.smartLearnReviewerRoleIds" placeholder="role1,role2" /></div>
        <div class="form-row"><label>Admin Role IDs (CSV)</label><input v-model="settings.smartLearnAdminRoleIds" placeholder="adminRole" /></div>
      </div>
      <div class="grid-3">
        <div class="form-row"><label>Staff votes</label><input v-model.number="settings.smartLearnStaffVotesRequired" type="number" min="1" max="10" /></div>
        <div class="form-row"><label>Admin votes</label><input v-model.number="settings.smartLearnAdminVotesRequired" type="number" min="1" max="5" /></div>
        <div class="form-row"><label>Max DM reviewers</label><input v-model.number="settings.smartLearnMaxDmReviewers" type="number" min="1" max="25" /></div>
      </div>
      <div class="grid-3">
        <div class="form-row"><label>Candidate confidence</label><input v-model.number="settings.smartLearnCandidateConfidence" type="number" min="0.5" max="0.99" step="0.01" /></div>
        <div class="form-row"><label>Duplicate threshold</label><input v-model.number="settings.smartLearnDuplicateThreshold" type="number" min="0.55" max="0.99" step="0.01" /></div>
        <div class="form-row"><label>Max candidate / giờ</label><input v-model.number="settings.smartLearnMaxCandidatesPerHour" type="number" min="1" max="200" /></div>
      </div>
      <div class="grid-2">
        <div class="form-row"><label>Learning score tối thiểu</label><input v-model.number="settings.smartLearnMinLearningScore" type="number" min="0.2" max="0.95" step="0.01" /><small class="muted">Dưới ngưỡng sẽ cần Admin override để publish.</small></div>
        <div class="form-row"><label>Source diversity tối thiểu</label><input v-model.number="settings.smartLearnMinSourceDiversity" type="number" min="1" max="10" /><small class="muted">Khuyến nghị 2 nếu lượng ticket đủ lớn.</small></div>
      </div>
      <div class="grid-2">
        <div class="form-row"><label>Conflict threshold</label><input v-model.number="settings.smartLearnConflictThreshold" type="number" min="0.4" max="0.98" step="0.01" /><small class="muted">Nguồn mới mâu thuẫn mạnh với kiến thức cũ sẽ chuyển Admin review.</small></div>
        <div class="form-row"><label>Review lại Knowledge (ngày)</label><input v-model.number="settings.smartLearnReviewIntervalDays" type="number" min="7" max="730" /></div>
      </div>
      <template #actions>
        <StButton variant="ghost" @click="settingsOpen = false">Hủy</StButton>
        <StButton variant="primary" :loading="savingSettings" @click="saveSettings">Lưu cấu hình</StButton>
      </template>
    </Modal>

    <Modal v-if="reviewMode" :model-value="true" size="lg" @close="reviewMode = null">
      <template #title>{{ reviewMode === 'reject' ? '❌ Từ chối candidate' : reviewMode === 'link' ? '🔗 Gộp vào kiến thức hiện có' : '✍️ Câu trả lời khác' }}</template>
      <template v-if="reviewMode === 'reject'">
        <div class="form-row"><label>Lý do từ chối</label><textarea v-model="reviewForm.reason" style="min-height: 150px" placeholder="Sai thông tin, trùng kiến thức cũ, cần thêm dữ liệu..."></textarea></div>
      </template>
      <template v-else-if="reviewMode === 'link'">
        <div class="form-row"><label>Knowledge Article mục tiêu</label><select v-model="reviewForm.targetArticleId"><option value="">Chọn bài để gắn alias</option><option v-for="article in knowledgeOptions" :key="article.id" :value="article.id">{{ article.title }} • {{ article.clusterKeys }}</option></select></div>
        <p class="muted text-sm">Khi đủ phiếu duyệt, câu hỏi này sẽ trở thành alias của bài đã chọn thay vì tạo Knowledge Article mới.</p>
      </template>
      <template v-else>
        <div class="form-row"><label>Tiêu đề ngắn</label><input v-model="reviewForm.title" /></div>
        <div class="form-row"><label>Câu trả lời chính xác</label><textarea v-model="reviewForm.answer" style="min-height: 220px"></textarea></div>
        <div class="form-row"><label>Từ khóa bổ sung</label><input v-model="reviewForm.keywords" placeholder="reset, pv, giữ vật phẩm" /></div>
        <div class="form-row"><label>Ghi chú nội bộ</label><textarea v-model="reviewForm.reason" style="min-height: 90px"></textarea></div>
      </template>
      <template #actions>
        <StButton variant="ghost" @click="reviewMode = null">Hủy</StButton>
        <StButton :variant="reviewMode === 'reject' ? 'danger' : 'primary'" :loading="busy" @click="submitReview(reviewMode === 'reject' ? 'REJECT' : reviewMode === 'link' ? 'LINK_EXISTING' : 'ALTERNATIVE')">
          {{ reviewMode === 'reject' ? 'Xác nhận từ chối' : reviewMode === 'link' ? 'Gộp & gửi duyệt' : 'Lưu & gửi duyệt' }}
        </StButton>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.smartlearn-page { display: grid; gap: 18px; }
.sl-hero { position: relative; overflow: hidden; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 28px 30px; border: 1px solid color-mix(in srgb, var(--primary), transparent 70%); border-radius: 24px; background: radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--primary), transparent 70%), transparent 32%), linear-gradient(135deg, color-mix(in srgb, var(--surface-container-high), transparent 2%), var(--surface-container)); }
.sl-hero::after { content: ''; position: absolute; width: 260px; height: 260px; right: -90px; bottom: -150px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--primary), transparent 70%); }
.sl-eyebrow { display: flex; align-items: center; gap: 8px; color: var(--primary); font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.sl-hero h1 { margin: 9px 0 7px; font-size: clamp(28px, 3vw, 42px); letter-spacing: -.04em; }
.sl-hero p { max-width: 720px; margin: 0; color: var(--on-surface-variant); }
.sl-hero-actions { display: flex; gap: 10px; flex-shrink: 0; z-index: 1; }
.sl-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 13px; }
.sl-metric { display: grid; grid-template-columns: 48px 1fr; gap: 13px; align-items: center; padding: 18px; border: 1px solid var(--outline-variant); border-radius: 18px; background: var(--surface-container); }
.sl-metric > .material-symbols-outlined { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb, var(--accent), transparent 84%); color: var(--accent); }
.sl-metric small, .sl-metric strong, .sl-metric em { display: block; }
.sl-metric small { color: var(--on-surface-variant); font-size: 9px; font-weight: 800; letter-spacing: .1em; }
.sl-metric strong { margin: 2px 0; font-size: 27px; letter-spacing: -.03em; }
.sl-metric em { color: var(--on-surface-variant); font-size: 10px; font-style: normal; }
.accent-orange { --accent:#f39c12; }.accent-green { --accent:#57f287; }.accent-purple { --accent:#9b59b6; }.accent-blue { --accent:#5865f2; }
.sl-toolbar { padding: 12px; display: flex; justify-content: space-between; gap: 14px; align-items: center; }
.sl-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sl-tab { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 12px; border: 0; border-radius: 11px; background: transparent; color: var(--on-surface-variant); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.sl-tab .material-symbols-outlined { font-size: 17px; }.sl-tab:hover { background: var(--surface-container-high); }.sl-tab.active { background: color-mix(in srgb, var(--primary), transparent 84%); color: var(--primary); }
.sl-filters { display: flex; gap: 9px; }.sl-search { min-width: 300px; display: flex; align-items: center; gap: 7px; padding: 0 11px; border: 1px solid var(--outline-variant); border-radius: 12px; background: var(--surface); }.sl-search input { border: 0; background: transparent; padding-inline: 0; }.sl-search .material-symbols-outlined { font-size: 18px; color: var(--on-surface-variant); }
.sl-queue { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 13px; }
.sl-candidate { position: relative; padding: 18px; border: 1px solid var(--outline-variant); border-radius: 18px; background: var(--surface-container); cursor: pointer; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
.sl-candidate:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--primary), transparent 50%); box-shadow: 0 14px 36px rgba(0,0,0,.12); }
.sl-candidate-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }.sl-cluster { display: flex; align-items: center; gap: 9px; }.sl-cluster > span { width: 38px; height: 38px; display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,var(--cluster),transparent 84%);font-size:20px; }.sl-cluster strong,.sl-cluster small{display:block}.sl-cluster small{color:var(--on-surface-variant);font-size:9px;margin-top:2px}.sl-status{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:800;background:var(--surface-container-high);}.sl-status.pending{color:#f39c12}.sl-status.admin{color:#e67e22}.sl-status.conflict,.sl-status.rejected{color:#ed4245}.sl-status.publishing{color:#5865f2}.sl-status.approved{color:#57f287}
.sl-candidate h3 { margin: 15px 0 8px; font-size: 15px; line-height: 1.45; }.sl-candidate p{margin:0;color:var(--on-surface-variant);font-size:12px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.sl-candidate-type{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.sl-candidate-type span{font-size:9px;font-weight:800;color:var(--primary);padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--primary),transparent 88%)}.sl-candidate-type em{font-size:10px;color:var(--on-surface-variant);font-style:normal;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sl-candidate-type strong{margin-left:auto;font-size:9px;color:#f39c12}.sl-candidate-meta{display:flex;gap:13px;flex-wrap:wrap;margin-top:15px;color:var(--on-surface-variant);font-size:9px}.sl-candidate-meta span{display:flex;align-items:center;gap:4px}.sl-candidate-meta .material-symbols-outlined{font-size:14px}.sl-risk{display:flex;align-items:center;gap:6px;margin-top:12px;color:#e67e22;font-size:10px;font-weight:700}.sl-risk .material-symbols-outlined{font-size:15px}.sl-empty{padding:44px;text-align:center;color:var(--on-surface-variant)}
.sl-review-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px}.sl-review-main{display:grid;gap:12px}.sl-review-block,.sl-side-card{padding:17px;border:1px solid var(--outline-variant);border-radius:15px;background:var(--surface-container)}.sl-review-block.answer{background:color-mix(in srgb,var(--primary),transparent 93%);border-color:color-mix(in srgb,var(--primary),transparent 70%)}.sl-label{display:block;margin-bottom:8px;color:var(--primary);font-size:9px;font-weight:800;letter-spacing:.12em}.sl-review-block h2{margin:0;font-size:19px;line-height:1.45}.sl-review-block p{margin:0;white-space:pre-wrap;line-height:1.65;color:var(--on-surface-variant)}.sl-review-block ul{margin:0;padding-left:18px;color:var(--on-surface-variant)}.sl-review-entry{display:grid;grid-template-columns:130px 100px 1fr;gap:8px;padding:9px 0;border-bottom:1px solid var(--outline-variant);font-size:10px}.sl-review-entry:last-child{border-bottom:0}.sl-review-entry span{color:var(--primary);font-weight:700}.sl-review-entry small{color:var(--on-surface-variant)}.sl-review-side{display:grid;align-content:start;gap:12px}.sl-kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--outline-variant);font-size:10px}.sl-kv:last-child{border-bottom:0}.sl-kv span{color:var(--on-surface-variant)}.sl-kv strong{text-align:right}.sl-review-actions{display:grid;gap:8px}.sl-final-state{padding:14px;border-radius:12px;text-align:center;font-weight:800;background:var(--surface-container-high)}.sl-final-state.approved{color:#57f287}.sl-final-state.rejected{color:#ed4245}
.sl-settings-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.sl-setting-toggle{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid var(--outline-variant);border-radius:13px;background:var(--surface-container)}.sl-setting-toggle input{margin-top:3px}.sl-setting-toggle strong,.sl-setting-toggle small{display:block}.sl-setting-toggle small{margin-top:4px;color:var(--on-surface-variant);font-size:9px;line-height:1.45}
.sl-example-list{display:grid;gap:8px;padding-left:0;list-style:none}.sl-example-list li{display:grid;gap:4px;padding:10px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border)}.sl-example-list strong,.sl-example-list small,.sl-example-list em{display:block}.sl-example-list small{color:var(--muted);white-space:pre-wrap}.sl-example-list em{font-size:10px;color:var(--on-surface-variant);font-style:normal}.sl-example-list .sl-observed-bad{color:#ed4245}
@media(max-width:1000px){.sl-metrics{grid-template-columns:repeat(2,1fr)}.sl-toolbar{align-items:stretch;flex-direction:column}.sl-filters{width:100%}.sl-search{min-width:0;flex:1}.sl-review-layout{grid-template-columns:1fr}.sl-settings-grid{grid-template-columns:1fr}}
@media(max-width:700px){.sl-hero{align-items:flex-start;flex-direction:column;padding:22px}.sl-hero-actions{width:100%;flex-wrap:wrap}.sl-metrics,.sl-queue{grid-template-columns:1fr}.sl-filters{flex-direction:column}.sl-review-entry{grid-template-columns:1fr}.sl-tabs{display:grid;grid-template-columns:repeat(2,1fr)}.sl-tab{justify-content:center}}
</style>

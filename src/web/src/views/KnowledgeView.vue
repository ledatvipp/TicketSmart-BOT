<script setup>
import { computed, onMounted, ref } from 'vue';
import { KnowledgeAPI, ClustersAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import StButton from '../components/StButton.vue';
import Modal from '../components/Modal.vue';
import Switch from '../components/Switch.vue';

const auth = useAuth();
const toast = useToast();
const items = ref([]);
const clusters = ref([]);
const overview = ref(null);
const total = ref(0);
const loading = ref(false);
const busy = ref(false);
const search = ref('');
const clusterFilter = ref('');
const statusFilter = ref('all');
const healthFilter = ref('all');
const categoryFilter = ref('');
const editor = ref(null);
const editorTab = ref('content');
const aliasInput = ref('');
const actionsText = ref('[]');
const previewQuery = ref('');
const preview = ref(null);

const statuses = [
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'PUBLISHED', label: 'Đang dùng' },
  { value: 'REVIEW_REQUIRED', label: 'Cần rà soát' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'ARCHIVED', label: 'Đã lưu trữ' },
];
const visibilities = [
  { value: 'PUBLIC', label: 'Người chơi + Bot' },
  { value: 'STAFF_ONLY', label: 'Chỉ Staff' },
  { value: 'INTERNAL', label: 'Nội bộ Admin' },
];
const editorTabs = [
  { value: 'content', label: 'Nội dung', icon: 'article' },
  { value: 'aliases', label: 'Câu tương tự', icon: 'account_tree' },
  { value: 'actions', label: 'Buttons', icon: 'smart_button' },
  { value: 'lifecycle', label: 'Lifecycle', icon: 'event_repeat' },
  { value: 'history', label: 'Phiên bản', icon: 'history' },
];

const categories = computed(() => [...new Set(items.value.map((x) => x.category).filter(Boolean))].sort());
const clusterMap = computed(() => new Map(clusters.value.map((item) => [item.key, item])));

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fmt(value) { return value ? new Date(value).toLocaleString('vi-VN') : '—'; }
function pct(value) { return `${Math.round((Number(value) || 0) * 100)}%`; }
function clusterLabel(keys) {
  if (!keys || keys === '*') return '🌐 Toàn hệ thống';
  return String(keys).split(',').map((key) => {
    const cluster = clusterMap.value.get(key.trim());
    return cluster ? `${cluster.emoji} ${cluster.name}` : key;
  }).join(', ');
}
function statusLabel(value) { return statuses.find((row) => row.value === value)?.label || value; }
function healthLabel(item) {
  return ({ healthy: 'Ổn định', review: 'Cần rà soát', expired: 'Hết hạn', inactive: 'Không hoạt động' })[item.health] || item.health;
}
function healthIcon(item) {
  return ({ healthy: 'verified', review: 'rate_review', expired: 'timer_off', inactive: 'archive' })[item.health] || 'info';
}

async function load() {
  loading.value = true;
  try {
    const params = {
      all: 'true', limit: 100,
      search: search.value || undefined,
      clusterKey: clusterFilter.value || undefined,
      category: categoryFilter.value || undefined,
      status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
      health: healthFilter.value !== 'all' ? healthFilter.value : undefined,
    };
    const [data, metrics] = await Promise.all([KnowledgeAPI.list(params), KnowledgeAPI.overview()]);
    items.value = data.items || [];
    total.value = data.total || 0;
    overview.value = metrics;
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không tải được Knowledge Base');
  } finally { loading.value = false; }
}

onMounted(async () => {
  clusters.value = await ClustersAPI.list({ active: true }).catch(() => []);
  await load();
});

function blankArticle() {
  return {
    id: null, slug: '', title: '', summary: '', content: '', category: '', keywords: '',
    enabled: false, status: 'DRAFT', visibility: 'PUBLIC', pinned: false,
    sourceLabel: 'IS7MC Knowledge Base', sourceUrl: '', clusterKeys: '*',
    expiresAt: '', reviewDueAt: '', qualityScore: 1, confidenceFloor: 0.3,
    aliases: [], revisions: [], actions: [],
  };
}

function createArticle() {
  editor.value = blankArticle();
  editorTab.value = 'content';
  aliasInput.value = '';
  actionsText.value = JSON.stringify([
    { type: 'ticket', label: 'Cần Staff', emoji: '🎫' },
  ], null, 2);
}

async function openArticle(item) {
  busy.value = true;
  try {
    const detail = await KnowledgeAPI.get(item.id);
    editor.value = {
      ...detail,
      aliases: Array.isArray(detail.aliases) ? detail.aliases.map((alias) => ({ ...alias })) : [],
      expiresAt: toInputDate(detail.expiresAt),
      reviewDueAt: toInputDate(detail.reviewDueAt),
    };
    actionsText.value = JSON.stringify(Array.isArray(detail.actions) ? detail.actions : [], null, 2);
    editorTab.value = 'content';
    aliasInput.value = '';
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không mở được bài viết');
  } finally { busy.value = false; }
}

function articleClusterKeys() {
  return String(editor.value?.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
}
function toggleArticleCluster(key) {
  if (!auth.isAdmin) return;
  const current = new Set(articleClusterKeys());
  if (key === '*') { editor.value.clusterKeys = '*'; return; }
  current.delete('*');
  if (current.has(key)) current.delete(key); else current.add(key);
  editor.value.clusterKeys = current.size ? [...current].join(',') : '*';
}
function addAlias() {
  const phrase = aliasInput.value.trim();
  if (!phrase) return;
  const normalized = phrase.toLocaleLowerCase('vi-VN');
  if (!editor.value.aliases.some((alias) => alias.phrase.toLocaleLowerCase('vi-VN') === normalized)) {
    editor.value.aliases.push({ phrase, weight: 1 });
  }
  aliasInput.value = '';
}
function removeAlias(index) { if (auth.isAdmin) editor.value.aliases.splice(index, 1); }

async function save() {
  if (!editor.value || !auth.isAdmin) return;
  busy.value = true;
  try {
    const actions = JSON.parse(actionsText.value || '[]');
    if (!Array.isArray(actions)) throw new Error('Actions phải là JSON array');
    const payload = {
      ...editor.value,
      actions,
      aliases: editor.value.aliases.map(({ phrase, weight }) => ({ phrase, weight })),
      expiresAt: editor.value.expiresAt || null,
      reviewDueAt: editor.value.reviewDueAt || null,
    };
    const saved = payload.id ? await KnowledgeAPI.update(payload.id, payload) : await KnowledgeAPI.create(payload);
    toast.success(payload.id ? `Đã lưu phiên bản v${saved.version}` : 'Đã tạo Knowledge Article');
    editor.value = null;
    await load();
  } catch (error) {
    toast.error(error.response?.data?.message || error.message || 'Không lưu được bài viết');
  } finally { busy.value = false; }
}

async function archive(item) {
  if (!confirm(`Lưu trữ “${item.title}”? Bot sẽ ngừng sử dụng bài này.`)) return;
  busy.value = true;
  try {
    await KnowledgeAPI.archive(item.id);
    toast.success('Đã lưu trữ bài viết');
    editor.value = null;
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Không lưu trữ được'); }
  finally { busy.value = false; }
}

async function remove(item) {
  if (!confirm(`Xóa vĩnh viễn “${item.title}”? Hành động này không thể hoàn tác.`)) return;
  busy.value = true;
  try {
    await KnowledgeAPI.remove(item.id);
    toast.success('Đã xóa vĩnh viễn');
    editor.value = null;
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Không xóa được'); }
  finally { busy.value = false; }
}

async function restoreRevision(revision) {
  if (!editor.value?.id || !confirm(`Khôi phục nội dung từ phiên bản v${revision.version}?`)) return;
  busy.value = true;
  try {
    await KnowledgeAPI.restore(editor.value.id, revision.id);
    toast.success(`Đã khôi phục từ phiên bản v${revision.version}`);
    await openArticle({ id: editor.value.id });
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Không khôi phục được'); }
  finally { busy.value = false; }
}

async function runPreview() {
  if (!previewQuery.value.trim()) return;
  busy.value = true;
  try {
    preview.value = await KnowledgeAPI.search(previewQuery.value, {
      limit: 5, threshold: 0.05, clusterKey: clusterFilter.value || undefined,
    });
  } catch (error) { toast.error(error.response?.data?.message || 'Tìm kiếm thất bại'); }
  finally { busy.value = false; }
}
async function reindexAll() {
  busy.value = true;
  try {
    const result = await KnowledgeAPI.reindexAll();
    toast.success(`Đã index ${result.indexed}/${result.total} bài`);
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Reindex thất bại'); }
  finally { busy.value = false; }
}
async function importFaqs() {
  busy.value = true;
  try {
    const result = await KnowledgeAPI.importFaqs();
    toast.success(`Đã import ${result.imported} FAQ`);
    await load();
  } catch (error) { toast.error(error.response?.data?.message || 'Import thất bại'); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="km-page">
    <section class="km-hero">
      <div>
        <div class="km-eyebrow"><span class="material-symbols-outlined">auto_stories</span> VERIFIED KNOWLEDGE OPERATIONS</div>
        <h1>Knowledge Manager</h1>
        <p>Quản lý câu trả lời chính thức, alias, phạm vi cụm, phiên bản và vòng đời kiến thức mà bot được phép sử dụng.</p>
      </div>
      <div class="km-actions" v-if="auth.isAdmin">
        <StButton variant="ghost" :loading="busy" @click="importFaqs">Import FAQ</StButton>
        <StButton variant="ghost" :loading="busy" @click="reindexAll">Reindex</StButton>
        <StButton variant="primary" @click="createArticle">+ Thêm kiến thức</StButton>
      </div>
    </section>

    <section v-if="overview" class="km-metrics">
      <article><span class="metric-icon green material-symbols-outlined">verified</span><div><small>ĐANG DÙNG</small><strong>{{ overview.published }}</strong><em>Bot có thể trả lời</em></div></article>
      <article><span class="metric-icon orange material-symbols-outlined">rate_review</span><div><small>CẦN RÀ SOÁT</small><strong>{{ overview.reviewRequired + overview.lowQuality }}</strong><em>Hết hạn hoặc chất lượng thấp</em></div></article>
      <article><span class="metric-icon purple material-symbols-outlined">account_tree</span><div><small>CÂU TƯƠNG TỰ</small><strong>{{ overview.aliases }}</strong><em>Alias đã xác minh</em></div></article>
      <article><span class="metric-icon blue material-symbols-outlined">thumb_up</span><div><small>HỮU ÍCH</small><strong>{{ pct(overview.helpfulRate) }}</strong><em>{{ overview.views }} lượt truy xuất</em></div></article>
    </section>

    <section class="km-command card">
      <div class="km-search"><span class="material-symbols-outlined">search</span><input v-model="search" placeholder="Tìm tiêu đề, nội dung, từ khóa..." @keyup.enter="load" /></div>
      <select v-model="clusterFilter" @change="load"><option value="">🌐 Tất cả cụm</option><option v-for="cluster in clusters" :key="cluster.key" :value="cluster.key">{{ cluster.emoji }} {{ cluster.name }}</option></select>
      <select v-model="statusFilter" @change="load"><option value="all">Mọi trạng thái</option><option v-for="row in statuses" :key="row.value" :value="row.value">{{ row.label }}</option></select>
      <select v-model="healthFilter" @change="load"><option value="all">Mọi chất lượng</option><option value="healthy">Ổn định</option><option value="review">Cần rà soát</option><option value="expired">Hết hạn</option></select>
      <select v-model="categoryFilter" @change="load"><option value="">Mọi nhóm</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
      <button class="km-refresh" @click="load"><span class="material-symbols-outlined">refresh</span></button>
    </section>

    <section class="km-layout">
      <div class="km-library">
        <div class="km-section-head"><div><h2>Thư viện kiến thức</h2><p>{{ total }} bài phù hợp bộ lọc</p></div></div>
        <div v-if="loading" class="empty card">Đang tải Knowledge Base...</div>
        <div v-else class="km-grid">
          <article v-for="item in items" :key="item.id" :class="['km-card', `health-${item.health}`]" @click="openArticle(item)">
            <div class="km-card-top">
              <div class="km-status"><span class="material-symbols-outlined">{{ healthIcon(item) }}</span>{{ healthLabel(item) }}</div>
              <span v-if="item.pinned" class="km-pin material-symbols-outlined">keep</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary || item.content?.slice(0, 180) || 'Chưa có tóm tắt.' }}</p>
            <div class="km-badges">
              <span>{{ statusLabel(item.status) }}</span>
              <span>{{ clusterLabel(item.clusterKeys) }}</span>
              <span>{{ item.embeddingReady ? 'Vector + Keyword' : 'Keyword' }}</span>
            </div>
            <div v-if="item.aliases?.length" class="km-alias-preview">
              <span v-for="alias in item.aliases.slice(0, 3)" :key="alias.id">{{ alias.phrase }}</span>
              <em v-if="item.aliasCount > 3">+{{ item.aliasCount - 3 }}</em>
            </div>
            <footer>
              <span>v{{ item.version }}</span><span>👁 {{ item.views }}</span><span>👍 {{ item.helpfulCount }}</span><span>👎 {{ item.unhelpfulCount }}</span><strong>{{ pct(item.quality) }}</strong>
            </footer>
          </article>
          <div v-if="!items.length" class="empty card">Chưa có bài viết phù hợp.</div>
        </div>
      </div>

      <aside class="km-tester card">
        <div class="km-tester-head"><span class="material-symbols-outlined">science</span><div><h3>Retrieval Lab</h3><p>Kiểm tra bot sẽ chọn bài nào</p></div></div>
        <textarea v-model="previewQuery" placeholder="Ví dụ: đồ trong đảo riêng có bị xóa không?" @keydown.ctrl.enter="runPreview"></textarea>
        <StButton variant="primary" :loading="busy" @click="runPreview">Chạy kiểm tra</StButton>
        <div v-if="preview" class="km-results">
          <div class="km-result-meta">{{ preview.embeddingUsed ? 'Semantic + Keyword' : 'Keyword local' }}</div>
          <article v-for="result in preview.results" :key="result.id">
            <div><strong>{{ result.title }}</strong><span>{{ Math.round(result.score * 100) }}%</span></div>
            <p>{{ result.summary || result.content?.slice(0, 120) }}</p>
            <small>{{ clusterLabel(result.clusterKeys) }}</small>
          </article>
          <div v-if="!preview.results.length" class="muted text-sm">Không có bài đủ ngưỡng.</div>
        </div>
      </aside>
    </section>

    <Modal v-if="editor" :model-value="true" size="xl" @close="editor = null">
      <template #title>{{ editor.id ? `📚 ${editor.title}` : '➕ Thêm Knowledge Article' }}</template>
      <div class="km-editor-head">
        <div class="km-editor-tabs">
          <button v-for="tab in editorTabs" :key="tab.value" :class="{ active: editorTab === tab.value }" @click="editorTab = tab.value"><span class="material-symbols-outlined">{{ tab.icon }}</span>{{ tab.label }}</button>
        </div>
        <div v-if="editor.id" class="km-version">v{{ editor.version }} • {{ editor.aliases?.length || 0 }} alias</div>
      </div>

      <div v-if="editorTab === 'content'" class="km-editor-pane">
        <div class="grid-2"><div class="form-row"><label>Tiêu đề</label><input v-model="editor.title" :disabled="!auth.isAdmin" /></div><div class="form-row"><label>Slug</label><input v-model="editor.slug" placeholder="tu-dong-tu-tieu-de" :disabled="!auth.isAdmin" /></div></div>
        <div class="grid-2"><div class="form-row"><label>Category</label><input v-model="editor.category" :disabled="!auth.isAdmin" /></div><div class="form-row"><label>Keywords CSV</label><input v-model="editor.keywords" :disabled="!auth.isAdmin" /></div></div>
        <div class="form-row"><label>Phạm vi cụm</label><div class="km-cluster-picker"><button type="button" :class="{ active: articleClusterKeys().includes('*') }" :disabled="!auth.isAdmin" @click="toggleArticleCluster('*')">🌐 Toàn hệ thống</button><button v-for="cluster in clusters" :key="cluster.key" type="button" :class="{ active: articleClusterKeys().includes(cluster.key) }" :disabled="!auth.isAdmin" @click="toggleArticleCluster(cluster.key)">{{ cluster.emoji }} {{ cluster.name }}</button></div></div>
        <div class="form-row"><label>Tóm tắt ngắn</label><textarea v-model="editor.summary" class="summary" :disabled="!auth.isAdmin"></textarea></div>
        <div class="form-row"><label>Câu trả lời chính thức</label><textarea v-model="editor.content" class="answer" :disabled="!auth.isAdmin"></textarea><small>Bot chỉ dùng nội dung này khi bài ở trạng thái Đang dùng, chưa hết hạn và đúng cụm.</small></div>
        <div class="grid-2"><div class="form-row"><label>Nhãn nguồn</label><input v-model="editor.sourceLabel" :disabled="!auth.isAdmin" /></div><div class="form-row"><label>URL nguồn</label><input v-model="editor.sourceUrl" placeholder="https://..." :disabled="!auth.isAdmin" /></div></div>
      </div>

      <div v-else-if="editorTab === 'aliases'" class="km-editor-pane">
        <div class="km-pane-intro"><span class="material-symbols-outlined">account_tree</span><div><h3>Câu hỏi tương tự</h3><p>Bot dùng alias để hiểu nhiều cách viết mà không cần AI Provider. Chỉ thêm câu cùng ý và cùng cụm.</p></div></div>
        <div v-if="auth.isAdmin" class="km-alias-add"><input v-model="aliasInput" placeholder="Nhập một cách hỏi khác..." @keyup.enter="addAlias" /><input type="number" min="0.25" max="2" step="0.05" value="1" disabled /><StButton variant="primary" @click="addAlias">Thêm</StButton></div>
        <div class="km-alias-list"><article v-for="(alias, index) in editor.aliases" :key="alias.id || index"><div><strong>{{ alias.phrase }}</strong><small>Weight {{ alias.weight || 1 }} • {{ alias.normalized || 'sẽ chuẩn hóa khi lưu' }}</small></div><input v-model.number="alias.weight" type="number" min="0.25" max="2" step="0.05" :disabled="!auth.isAdmin" /><button v-if="auth.isAdmin" @click="removeAlias(index)"><span class="material-symbols-outlined">close</span></button></article><div v-if="!editor.aliases?.length" class="empty">Chưa có alias. SmartLearn có thể bổ sung sau khi staff duyệt.</div></div>
      </div>

      <div v-else-if="editorTab === 'actions'" class="km-editor-pane">
        <div class="km-pane-intro"><span class="material-symbols-outlined">smart_button</span><div><h3>Buttons an toàn</h3><p>Chỉ hỗ trợ ticket, escalate, link HTTP/HTTPS và mở channel Discord.</p></div></div>
        <textarea v-model="actionsText" class="json-editor" :disabled="!auth.isAdmin"></textarea>
        <pre class="km-code">[
  { "type": "ticket", "label": "Tạo ticket", "emoji": "🎫" },
  { "type": "link", "label": "Xem wiki", "url": "https://..." }
]</pre>
      </div>

      <div v-else-if="editorTab === 'lifecycle'" class="km-editor-pane">
        <div class="grid-2"><div class="form-row"><label>Trạng thái</label><select v-model="editor.status" :disabled="!auth.isAdmin"><option v-for="row in statuses" :key="row.value" :value="row.value">{{ row.label }}</option></select></div><div class="form-row"><label>Độ hiển thị</label><select v-model="editor.visibility" :disabled="!auth.isAdmin"><option v-for="row in visibilities" :key="row.value" :value="row.value">{{ row.label }}</option></select></div></div>
        <div class="grid-2"><div class="form-row"><label>Hết hạn lúc</label><input v-model="editor.expiresAt" type="datetime-local" :disabled="!auth.isAdmin" /></div><div class="form-row"><label>Rà soát lại lúc</label><input v-model="editor.reviewDueAt" type="datetime-local" :disabled="!auth.isAdmin" /></div></div>
        <div class="grid-2"><div class="form-row"><label>Quality score</label><input v-model.number="editor.qualityScore" type="number" min="0" max="1" step="0.01" :disabled="!auth.isAdmin" /><small>Thấp hơn 0.65 sẽ được đưa vào hàng cần rà soát.</small></div><div class="form-row"><label>Confidence tối thiểu</label><input v-model.number="editor.confidenceFloor" type="number" min="0.05" max="0.95" step="0.01" :disabled="!auth.isAdmin" /><small>Bot chỉ dùng bài khi điểm truy xuất vượt mức này.</small></div></div>
        <div class="km-switches"><Switch v-model="editor.enabled" :disabled="!auth.isAdmin">Cho phép bot sử dụng</Switch><Switch v-model="editor.pinned" :disabled="!auth.isAdmin">Ghim ưu tiên trong Dashboard</Switch></div>
        <div class="km-lifecycle-info"><span>Lần review cuối: <strong>{{ fmt(editor.lastReviewedAt) }}</strong></span><span>Người review: <strong>{{ editor.lastReviewedBy || '—' }}</strong></span><span>Feedback: <strong>👍 {{ editor.helpfulCount || 0 }} / 👎 {{ editor.unhelpfulCount || 0 }}</strong></span></div>
      </div>

      <div v-else class="km-editor-pane">
        <div class="km-pane-intro"><span class="material-symbols-outlined">history</span><div><h3>Lịch sử phiên bản</h3><p>Mỗi lần sửa sẽ lưu snapshot. Admin có thể rollback khi câu trả lời mới không chính xác.</p></div></div>
        <div class="km-revisions"><article v-for="revision in editor.revisions" :key="revision.id"><div><strong>Version {{ revision.version }}</strong><small>{{ revision.actorName || 'System' }} • {{ fmt(revision.createdAt) }}</small></div><StButton v-if="auth.isAdmin" variant="ghost" size="sm" :loading="busy" @click="restoreRevision(revision)">Khôi phục</StButton></article><div v-if="!editor.revisions?.length" class="empty">Chưa có revision cũ.</div></div>
      </div>

      <template #actions="{ close }">
        <StButton v-if="auth.isAdmin && editor.id && editor.status !== 'ARCHIVED'" variant="ghost" @click="archive(editor)">Lưu trữ</StButton>
        <StButton v-if="auth.isAdmin && editor.id && editor.status === 'ARCHIVED'" variant="danger" @click="remove(editor)">Xóa vĩnh viễn</StButton>
        <div style="flex:1"></div>
        <StButton variant="ghost" @click="close">Đóng</StButton>
        <StButton v-if="auth.isAdmin" variant="primary" :loading="busy" @click="save">Lưu & cập nhật index</StButton>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.km-page{display:grid;gap:20px}.km-hero{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:28px;border:1px solid var(--border);border-radius:24px;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 17%,var(--surface)),var(--surface) 58%,color-mix(in srgb,#22c55e 8%,var(--surface)));overflow:hidden;position:relative}.km-hero:after{content:"";position:absolute;width:280px;height:280px;border-radius:999px;background:var(--brand);filter:blur(100px);opacity:.11;right:-80px;top:-150px}.km-hero h1{font-size:34px;margin:6px 0 8px;letter-spacing:-.035em}.km-hero p{margin:0;max-width:760px;color:var(--muted);line-height:1.6}.km-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--brand)}.km-actions{display:flex;gap:10px;z-index:1;flex-wrap:wrap}.km-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.km-metrics article{display:flex;gap:14px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.km-metrics small,.km-metrics em{display:block;color:var(--muted);font-size:11px;font-style:normal}.km-metrics strong{display:block;font-size:25px;margin:2px 0}.metric-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px}.metric-icon.green{background:#22c55e1c;color:#22c55e}.metric-icon.orange{background:#f59e0b1c;color:#f59e0b}.metric-icon.purple{background:#a855f71c;color:#a855f7}.metric-icon.blue{background:#3b82f61c;color:#3b82f6}.km-command{display:grid;grid-template-columns:minmax(240px,1fr) repeat(4,auto) 42px;gap:10px;padding:12px}.km-search{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:12px;padding:0 12px;background:var(--input-bg)}.km-search input{border:0!important;background:transparent!important;padding-left:0!important}.km-refresh{border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);cursor:pointer}.km-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start}.km-section-head h2{margin:0}.km-section-head p{margin:4px 0 14px;color:var(--muted);font-size:13px}.km-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.km-card{padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface);cursor:pointer;transition:.18s ease;position:relative;overflow:hidden}.km-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#64748b}.km-card.health-healthy:before{background:#22c55e}.km-card.health-review:before{background:#f59e0b}.km-card.health-expired:before{background:#ef4444}.km-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--brand) 45%,var(--border));box-shadow:0 16px 38px #00000012}.km-card-top{display:flex;justify-content:space-between}.km-status{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}.km-status .material-symbols-outlined{font-size:17px}.km-pin{font-size:18px;color:var(--brand)}.km-card h3{font-size:17px;margin:14px 0 7px}.km-card p{font-size:13px;color:var(--muted);line-height:1.55;min-height:42px}.km-badges,.km-alias-preview{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.km-badges span,.km-alias-preview span{font-size:10px;padding:5px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);color:var(--muted)}.km-alias-preview span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.km-alias-preview em{font-size:11px;color:var(--brand);font-style:normal;padding:5px}.km-card footer{display:flex;gap:12px;align-items:center;border-top:1px solid var(--border);margin-top:14px;padding-top:12px;color:var(--muted);font-size:11px}.km-card footer strong{margin-left:auto;color:var(--text)}.km-tester{position:sticky;top:86px;padding:18px}.km-tester-head{display:flex;gap:10px;align-items:center;margin-bottom:14px}.km-tester-head>span{color:var(--brand)}.km-tester h3,.km-tester p{margin:0}.km-tester p{font-size:11px;color:var(--muted)}.km-tester textarea{min-height:110px;margin-bottom:10px}.km-results{display:grid;gap:8px;margin-top:14px}.km-result-meta{font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:800}.km-results article{padding:11px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)}.km-results article>div{display:flex;gap:8px;justify-content:space-between}.km-results article span{color:var(--brand);font-weight:800}.km-results p{font-size:11px;line-height:1.45;margin:6px 0}.km-results small{color:var(--muted)}.km-editor-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);margin:-8px -4px 18px;padding-bottom:12px}.km-editor-tabs{display:flex;gap:5px;overflow:auto}.km-editor-tabs button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--muted);padding:8px 10px;border-radius:10px;white-space:nowrap;cursor:pointer}.km-editor-tabs button.active{background:var(--brand-soft);color:var(--brand);font-weight:700}.km-editor-tabs .material-symbols-outlined{font-size:18px}.km-version{font-size:11px;color:var(--muted)}.km-editor-pane{display:grid;gap:14px;min-height:430px}.km-editor-pane textarea.summary{min-height:76px}.km-editor-pane textarea.answer{min-height:240px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6}.km-cluster-picker{display:flex;gap:8px;flex-wrap:wrap}.km-cluster-picker button{border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:999px;padding:7px 11px;cursor:pointer}.km-cluster-picker button.active{background:var(--brand-soft);border-color:var(--brand);color:var(--brand)}.km-pane-intro{display:flex;gap:12px;padding:14px;border-radius:14px;background:var(--surface-2);border:1px solid var(--border)}.km-pane-intro>span{color:var(--brand)}.km-pane-intro h3,.km-pane-intro p{margin:0}.km-pane-intro p{color:var(--muted);font-size:12px;margin-top:3px}.km-alias-add{display:grid;grid-template-columns:1fr 80px auto;gap:8px}.km-alias-list,.km-revisions{display:grid;gap:8px}.km-alias-list article,.km-revisions article{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)}.km-alias-list article>div,.km-revisions article>div{flex:1;min-width:0}.km-alias-list strong,.km-alias-list small,.km-revisions strong,.km-revisions small{display:block}.km-alias-list small,.km-revisions small{color:var(--muted);font-size:11px;margin-top:3px}.km-alias-list article input{width:72px}.km-alias-list article button{border:0;background:transparent;color:var(--muted);cursor:pointer}.json-editor{min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.km-code{padding:14px;border-radius:12px;background:#111827;color:#d1d5db;white-space:pre-wrap;font-size:12px}.km-switches{display:flex;gap:20px;flex-wrap:wrap;padding:14px;border:1px solid var(--border);border-radius:14px}.km-lifecycle-info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.km-lifecycle-info span{padding:12px;border-radius:12px;background:var(--surface-2);color:var(--muted);font-size:12px}.km-lifecycle-info strong{display:block;color:var(--text);margin-top:4px}@media(max-width:1200px){.km-command{grid-template-columns:1fr 1fr 1fr}.km-search{grid-column:1/-1}.km-layout{grid-template-columns:1fr}.km-tester{position:static}.km-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.km-hero{align-items:flex-start;flex-direction:column}.km-hero h1{font-size:28px}.km-metrics,.km-grid,.km-command,.km-lifecycle-info{grid-template-columns:1fr}.km-search{grid-column:auto}.km-actions{width:100%}.km-editor-tabs{max-width:72vw}}
</style>

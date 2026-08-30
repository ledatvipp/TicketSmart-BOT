<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ChatLevelsAPI, ConfigAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import LevelConfigForm from '../components/LevelConfigForm.vue';
import LevelRankPreview from '../components/LevelRankPreview.vue';
import { cloneLevelConfig, isLevelDraftDirty, parseLevelConfig, readLevelConfigResponse, rewardState, validateLevelConfig } from '../utils/level-dashboard.js';

const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const configError = ref('');
const saveError = ref('');
const draft = ref(null);
const baseline = ref(null);
const mode = ref('guided');
const editorText = ref('');
const leaderboard = ref([]);
const rewards = ref([]);
const setupStatus = ref(null);
const leaderboardError = ref('');
const rewardsError = ref('');
const setupStatusError = ref('');
const operationalRefreshing = ref(false);
const operationalLoaded = ref(false);
const lastOperationalRefresh = ref(null);
const retryingRewardId = ref('');
let refreshTimer = null;
let disposed = false;
let refreshPromise = null;

const activeDraft = computed(() => {
  if (mode.value === 'guided') return { value: draft.value, error: '' };
  try { return { value: parseLevelConfig(editorText.value), error: '' }; }
  catch (error) { return { value: null, error: 'JSON không hợp lệ: ' + error.message }; }
});
const validationErrors = computed(() => !draft.value ? [] : activeDraft.value.error ? [activeDraft.value.error] : validateLevelConfig(activeDraft.value.value));
const config = computed(() => validationErrors.value.length ? null : activeDraft.value.value);
const dirty = computed(() => baseline.value !== null && (Boolean(activeDraft.value.error) || isLevelDraftDirty(activeDraft.value.value, baseline.value)));
const controlsLocked = computed(() => loading.value || saving.value || Boolean(configError.value));
const canSave = computed(() => Boolean(config.value) && dirty.value && !controlsLocked.value);
const savedConfig = computed(() => baseline.value ? JSON.parse(baseline.value) : null);
const setupChecks = computed(() => {
  const status = setupStatus.value;
  const saved = savedConfig.value;
  return [
    { label: 'Tính EXP', good: status?.configEnabled ?? saved?.enabled, value: (status?.configEnabled ?? saved?.enabled) ? 'Đã bật' : 'Đang tắt', help: 'Theo cấu hình đã lưu.' },
    { label: 'Kênh cho phép', good: status?.allowListPresent ?? Boolean(saved?.allowedChannelIds?.length), value: (status?.allowListPresent ?? Boolean(saved?.allowedChannelIds?.length)) ? 'Đã cấu hình' : 'Chưa có kênh', help: 'Danh sách trống = không cộng EXP.' },
    { label: 'Worker Minecraft', good: Boolean(status?.serviceLastSeenAt), value: status?.serviceLastSeenAt ? 'Đã từng kết nối' : 'Chưa ghi nhận', help: status?.serviceLastSeenAt ? formatDate(status.serviceLastSeenAt) : 'Kiểm tra worker và khóa ký ở môi trường máy chủ.' },
  ];
});

function setDraft(value) {
  draft.value = cloneLevelConfig(value);
  editorText.value = JSON.stringify(value, null, 2);
}
function changeMode(next) {
  if (controlsLocked.value || next === mode.value) return;
  if (next === 'json') editorText.value = JSON.stringify(draft.value, null, 2);
  else {
    if (!config.value) { toast.error('Sửa JSON hợp lệ trước khi quay về biểu mẫu.'); return; }
    setDraft(config.value);
  }
  mode.value = next;
}
function confirmDiscard() { return !dirty.value || window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?'); }
function resetDefaults() {
  if (controlsLocked.value || !window.confirm('Thay cấu hình đang soạn bằng mặc định? Thao tác này chưa ghi lên máy chủ.')) return;
  setDraft(cloneLevelConfig());
  mode.value = 'guided';
}
function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback; }

async function loadConfig({ initial = false } = {}) {
  if (saving.value || (!initial && (loading.value || !confirmDiscard()))) return;
  loading.value = true;
  configError.value = '';
  try {
    const value = readLevelConfigResponse(await ConfigAPI.get());
    if (disposed) return;
    setDraft(value);
    baseline.value = JSON.stringify(value);
    mode.value = validateLevelConfig(value).length ? 'json' : 'guided';
    saveError.value = '';
  } catch (error) {
    if (!disposed) configError.value = errorMessage(error, 'Không tải được cấu hình.');
  } finally { if (!disposed) loading.value = false; }
}

function unwrapItems(value, key) { return Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : Array.isArray(value?.items) ? value.items : []; }
function refreshOperationalData() {
  if (disposed || document.hidden) return Promise.resolve();
  if (refreshPromise) return refreshPromise;
  operationalRefreshing.value = true;
  refreshPromise = (async () => {
    const results = await Promise.allSettled([ChatLevelsAPI.leaderboard(), ChatLevelsAPI.rewards(), ChatLevelsAPI.setupStatus()]);
    if (disposed) return;
    const [leaders, grants, setup] = results;
    if (leaders.status === 'fulfilled') { leaderboard.value = unwrapItems(leaders.value, 'leaderboard'); leaderboardError.value = ''; }
    else leaderboardError.value = errorMessage(leaders.reason, 'Không tải được bảng xếp hạng.');
    if (grants.status === 'fulfilled') { rewards.value = unwrapItems(grants.value, 'rewards'); rewardsError.value = ''; }
    else rewardsError.value = errorMessage(grants.reason, 'Không tải được phần thưởng.');
    if (setup.status === 'fulfilled' && setup.value && typeof setup.value === 'object') { setupStatus.value = setup.value; setupStatusError.value = ''; }
    else setupStatusError.value = 'Chưa tải được trạng thái worker. Không thể xác nhận kết nối hiện tại.';
    operationalLoaded.value = true;
    if (results.every((result) => result.status === 'fulfilled')) lastOperationalRefresh.value = new Date();
  })().finally(() => {
    refreshPromise = null;
    if (!disposed) operationalRefreshing.value = false;
  });
  return refreshPromise;
}
function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  if (disposed || document.hidden) return;
  refreshTimer = window.setTimeout(async () => { await refreshOperationalData(); scheduleRefresh(); }, 30_000);
}
async function onVisibilityChange() {
  window.clearTimeout(refreshTimer);
  if (!document.hidden && !disposed) { await refreshOperationalData(); scheduleRefresh(); }
}
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  saveError.value = '';
  const payload = cloneLevelConfig(config.value);
  try {
    const value = readLevelConfigResponse(await ConfigAPI.update({ chatLevelConfig: payload }));
    if (disposed) return;
    setDraft(value);
    baseline.value = JSON.stringify(value);
    toast.success('Đã lưu cấu hình Level Chat.');
    // A poll issued before the save cannot be the final operational snapshot.
    if (refreshPromise) await refreshPromise;
    await refreshOperationalData();
  } catch (error) {
    if (!disposed) { saveError.value = errorMessage(error, 'Không lưu được cấu hình.'); toast.error(saveError.value); }
  } finally { if (!disposed) saving.value = false; }
}
async function retryReward(item) {
  if (!item?.id || !rewardState(item).retryable || retryingRewardId.value) return;
  retryingRewardId.value = item.id;
  try {
    await ChatLevelsAPI.retryReward(item.id);
    if (disposed) return;
    toast.success('Đã đưa phần thưởng về hàng đợi.');
    if (refreshPromise) await refreshPromise;
    await refreshOperationalData();
  } catch (error) { if (!disposed) toast.error(errorMessage(error, 'Không thể thử lại phần thưởng.')); }
  finally { if (!disposed) retryingRewardId.value = ''; }
}
function formatDate(value) { const date = value ? new Date(value) : null; return !date || Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN'); }
function beforeUnload(event) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; } }
onBeforeRouteLeave(() => { if (saving.value) { toast.error('Vui lòng chờ lưu cấu hình hoàn tất.'); return false; } return confirmDiscard(); });
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', onVisibilityChange);
  await Promise.all([loadConfig({ initial: true }), refreshOperationalData()]);
  scheduleRefresh();
});
onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(refreshTimer);
  window.removeEventListener('beforeunload', beforeUnload);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
  <div class="level-page">
    <header class="level-hero">
      <div><div class="level-eyebrow"><span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span>CỘNG ĐỒNG · TIẾN TRÌNH · PHẦN THƯỞNG</div><h1>Level Chat</h1><p>Biến những cuộc trò chuyện thành hành trình.<br />Thiết lập EXP, role cấp độ và phần thưởng Minecraft ở một nơi.</p></div>
      <div class="level-hero-meta"><span class="level-pill"><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span>Không lưu khóa bí mật</span><span class="level-pill"><span class="material-symbols-outlined" aria-hidden="true">sync</span>Discord → Minecraft</span></div>
    </header>
    <div class="level-toolbar">
      <div class="level-save-state" role="status" aria-live="polite"><span :class="['state-dot', { dirty }]" aria-hidden="true"></span>{{ loading ? 'Đang tải cấu hình…' : configError ? 'Cấu hình chưa khả dụng' : saving ? 'Đang lưu…' : dirty ? 'Có thay đổi chưa lưu' : 'Đã đồng bộ cấu hình' }}</div>
      <div class="level-toolbar-actions"><StButton variant="ghost" :disabled="loading || saving" @click="loadConfig()"><span class="material-symbols-outlined" aria-hidden="true">settings_backup_restore</span>Tải lại cấu hình</StButton><StButton variant="primary" :disabled="!canSave" @click="save"><span class="material-symbols-outlined" aria-hidden="true">save</span>{{ saving ? 'Đang lưu…' : 'Lưu cấu hình' }}</StButton></div>
    </div>
    <div v-if="loading" class="level-loading" role="status"><span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span>Đang đọc cấu hình từ máy chủ…</div>
    <div v-if="configError" class="level-notice danger" role="alert"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span><div><strong>Chưa thể chỉnh sửa hoặc lưu</strong><p>{{ configError }} Không thay thế bằng cấu hình mặc định. Chọn “Tải lại cấu hình” để thử lại.</p></div></div>
    <div v-if="saveError" class="level-notice danger" role="alert"><span class="material-symbols-outlined" aria-hidden="true">error</span><div><strong>Lưu chưa hoàn tất</strong><p>{{ saveError }} Bản đang soạn vẫn được giữ nguyên.</p></div></div>
    <div v-if="draft && !loading" class="level-workspace">
      <section class="level-config-panel" aria-labelledby="level-config-title">
        <div class="level-panel-heading"><div><h2 id="level-config-title">Thiết lập trải nghiệm</h2><p>Bắt đầu với kênh nhận EXP, sau đó tùy chỉnh phần thưởng.</p></div><span class="level-step-label">CẤU HÌNH</span></div>
        <div class="level-editor-tabs" role="group" aria-label="Chế độ chỉnh sửa"><button type="button" :aria-pressed="mode === 'guided'" :disabled="controlsLocked" @click="changeMode('guided')"><span class="material-symbols-outlined" aria-hidden="true">tune</span>Biểu mẫu hướng dẫn</button><button type="button" :aria-pressed="mode === 'json'" :disabled="controlsLocked" @click="changeMode('json')"><span class="material-symbols-outlined" aria-hidden="true">data_object</span>JSON nâng cao</button></div>
        <LevelConfigForm v-if="mode === 'guided'" :config="draft" :disabled="controlsLocked" />
        <div v-else class="level-advanced"><label for="chat-level-config">Cấu hình JSON nâng cao</label><p class="level-help">Dành cho quản trị viên cần sửa trực tiếp. Các trường mở rộng không chứa dữ liệu bí mật được giữ lại khi chuyển chế độ.</p><textarea id="chat-level-config" v-model="editorText" :disabled="controlsLocked" rows="30" spellcheck="false" autocomplete="off" :aria-describedby="validationErrors.length ? 'level-config-errors' : undefined"></textarea></div>
        <div class="level-reset"><StButton type="button" variant="ghost" :disabled="controlsLocked" @click="resetDefaults"><span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>Đặt lại bản soạn về mặc định</StButton><small>Chỉ có hiệu lực trên máy chủ sau khi lưu.</small></div>
        <div v-if="validationErrors.length" id="level-config-errors" class="level-notice danger" role="alert"><span class="material-symbols-outlined" aria-hidden="true">error</span><div><strong>Kiểm tra trước khi lưu</strong><ul><li v-for="error in validationErrors" :key="error">{{ error }}</li></ul></div></div>
      </section>
      <aside class="level-insights" aria-label="Xem trước và trạng thái vận hành">
        <LevelRankPreview :config="activeDraft.value" />
        <section class="level-status-panel" aria-labelledby="level-status-title">
          <div class="level-panel-heading"><div><h2 id="level-status-title">Sẵn sàng vận hành</h2><p>Dữ liệu đã lưu, không phải bản đang soạn.</p></div><button class="level-icon-button" type="button" :disabled="operationalRefreshing" aria-label="Làm mới dữ liệu vận hành" @click="refreshOperationalData"><span class="material-symbols-outlined" aria-hidden="true">refresh</span></button></div>
          <p v-if="setupStatusError" class="level-field-warning" role="status">{{ setupStatusError }} Dữ liệu hiển thị có thể đã cũ.</p>
          <p v-if="!operationalLoaded" class="level-help" role="status">Đang tải trạng thái…</p>
          <div v-else class="level-checks"><div v-for="check in setupChecks" :key="check.label"><span class="material-symbols-outlined" :class="{ good: check.good }" aria-hidden="true">{{ check.good ? 'check_circle' : 'radio_button_unchecked' }}</span><div><strong>{{ check.label }}</strong><b>{{ check.value }}</b><small>{{ check.help }}</small></div></div></div>
          <div class="level-queue-counts"><div><span>Chờ</span><strong>{{ setupStatus?.pendingCount ?? '—' }}</strong><small>PENDING</small></div><div><span>Đã hoãn</span><strong>{{ setupStatus?.deferredCount ?? '—' }}</strong><small>DEFERRED</small></div><div><span>Thất bại</span><strong>{{ setupStatus?.failedCount ?? '—' }}</strong><small>FAILED</small></div></div>
          <p class="level-help">Tự cập nhật mỗi 30 giây khi tab đang mở. Không thay đổi bản cấu hình đang soạn.</p><small v-if="lastOperationalRefresh" class="level-updated">Cập nhật: {{ formatDate(lastOperationalRefresh) }}</small>
        </section>
        <section class="level-guide"><span class="material-symbols-outlined" aria-hidden="true">lightbulb</span><div><h2>Bắt đầu đơn giản</h2><p>Thêm một kênh, giữ 20 EXP và 60 giây chờ. Lưu cấu hình rồi thử trò chuyện bằng tài khoản có role xác minh.</p><p>Khóa ký Minecraft chỉ đặt trong biến môi trường của máy chủ, không đặt trong biểu mẫu hoặc JSON.</p></div></section>
      </aside>
    </div>
    <section class="level-operations" aria-labelledby="level-operations-title">
      <div class="level-panel-heading"><div><h2 id="level-operations-title">Hoạt động cộng đồng</h2><p>Bảng xếp hạng và phần thưởng từ máy chủ.</p></div><StButton variant="ghost" :disabled="operationalRefreshing" @click="refreshOperationalData"><span class="material-symbols-outlined" aria-hidden="true">refresh</span>{{ operationalRefreshing ? 'Đang cập nhật…' : 'Làm mới dữ liệu' }}</StButton></div>
      <div class="level-data-grid">
        <section class="level-data-panel" aria-labelledby="leaderboard-title">
          <h3 id="leaderboard-title"><span class="material-symbols-outlined" aria-hidden="true">leaderboard</span>Bảng xếp hạng</h3>
          <p v-if="leaderboardError" class="level-notice danger" role="alert">{{ leaderboardError }} Chọn làm mới dữ liệu để thử lại.</p>
          <p v-else-if="!operationalLoaded" class="level-inline-empty" role="status">Đang tải bảng xếp hạng…</p>
          <div v-else-if="leaderboard.length" class="level-table-scroll" tabindex="0" role="region" aria-label="Bảng xếp hạng, cuộn ngang nếu cần"><table><thead><tr><th scope="col">Hạng</th><th scope="col">Thành viên</th><th scope="col">Level</th><th scope="col">Tổng EXP</th></tr></thead><tbody><tr v-for="(item, index) in leaderboard" :key="item.userId || item.id || index"><td><span class="level-rank-number">{{ index + 1 }}</span></td><td class="level-player-name">{{ item.username || item.displayName || item.userId || '—' }}</td><td>{{ item.level ?? '—' }}</td><td>{{ item.totalExperience ?? '—' }}</td></tr></tbody></table></div>
          <div v-else class="level-data-empty"><span class="material-symbols-outlined" aria-hidden="true">forum</span><strong>Cuộc trò chuyện đầu tiên đang chờ</strong><p>Khi thành viên nhận EXP, thứ hạng sẽ xuất hiện ở đây.</p></div>
        </section>
        <section class="level-data-panel" aria-labelledby="reward-status-title">
          <h3 id="reward-status-title"><span class="material-symbols-outlined" aria-hidden="true">redeem</span>Phần thưởng Minecraft</h3>
          <p v-if="rewardsError" class="level-notice danger" role="alert">{{ rewardsError }} Chọn làm mới dữ liệu để thử lại.</p>
          <p v-else-if="!operationalLoaded" class="level-inline-empty" role="status">Đang tải phần thưởng…</p>
          <div v-else-if="rewards.length" class="level-table-scroll" tabindex="0" role="region" aria-label="Phần thưởng Minecraft, cuộn ngang nếu cần"><table><thead><tr><th scope="col">Thành viên / thời gian</th><th scope="col">Thưởng</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody><tr v-for="item in rewards" :key="item.id"><td class="level-player-name">{{ item.username || item.userId || '—' }}<small>{{ formatDate(item.createdAt) }}</small></td><td>Lv {{ item.level }}<small>{{ item.spins }} lượt quay</small></td><td><span :class="['level-reward-state', 'state-' + rewardState(item).raw.toLowerCase()]">{{ rewardState(item).raw }}</span><small>{{ rewardState(item).label }}</small><details v-if="item.lastError" class="level-grant-error"><summary>Xem lỗi</summary><p>{{ item.lastError }}</p></details></td><td><StButton v-if="rewardState(item).retryable" variant="ghost" size="sm" :disabled="Boolean(retryingRewardId)" :aria-label="'Thử lại phần thưởng cấp ' + item.level + ' của ' + item.userId" @click="retryReward(item)">{{ retryingRewardId === item.id ? 'Đang thử…' : 'Thử lại' }}</StButton><span v-else class="level-help">—</span></td></tr></tbody></table></div>
          <div v-else class="level-data-empty"><span class="material-symbols-outlined" aria-hidden="true">redeem</span><strong>Chưa có phần thưởng</strong><p>Phần thưởng được tạo khi thành viên vượt cấp. Chỉ FAILED và DEFERRED có thể thử lại tại đây.</p></div>
        </section>
      </div>
    </section>
  </div>
</template>

<style>
.level-page { display: grid; gap: 22px; min-width: 0; color: var(--on-surface); }
.level-hero { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding: 30px 32px; border: 1px solid var(--v7-panel-border); border-radius: 23px; background: radial-gradient(ellipse at 90% 10%, color-mix(in srgb, var(--v7-purple), transparent 85%), transparent 60%), var(--v7-card); }
.level-eyebrow { display: flex; align-items: center; gap: 7px; color: var(--on-surface-variant); font-size: 9px; font-weight: 800; letter-spacing: .11em; }
.level-eyebrow .material-symbols-outlined { color: var(--primary); font-size: 22px; }
.level-hero h1 { margin: 11px 0 8px; font-size: clamp(32px, 4vw, 45px); line-height: 1.1; font-weight: 800; letter-spacing: -.045em; }
.level-hero p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--on-surface-variant); }
.level-hero-meta { display: grid; gap: 10px; flex-shrink: 0; }
.level-pill { display: flex; align-items: center; gap: 8px; padding: 10px 13px; background: var(--surface-container); border: 1px solid var(--v7-panel-border); border-radius: 10px; font-size: 11px; color: var(--on-surface-variant); }
.level-pill .material-symbols-outlined { font-size: 18px; color: var(--primary); }
.level-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
.level-save-state { display: flex; align-items: center; gap: 8px; color: var(--on-surface-variant); font-size: 12px; }
.level-save-state .state-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--on-surface-variant); }
.level-save-state .state-dot.dirty { background: var(--warning); box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning), transparent 88%); }
.level-toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.level-page .btn { min-height: 44px; }.level-page .btn .material-symbols-outlined { font-size: 18px; }
.level-loading { display: flex; gap: 10px; align-items: center; justify-content: center; min-height: 180px; color: var(--on-surface-variant); }
.level-workspace { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .85fr); align-items: start; gap: 22px; }
.level-config-panel, .level-status-panel, .level-data-panel { min-width: 0; padding: 24px; border: 1px solid var(--v7-panel-border); border-radius: 20px; background: var(--v7-card); }
.level-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 20px; }
.level-panel-heading h2 { font-size: 16px; margin: 0; letter-spacing: -.02em; }
.level-panel-heading p { font-size: 12px; line-height: 1.55; color: var(--on-surface-variant); margin: 6px 0 0; }
.level-step-label { font-size: 9px; letter-spacing: .09em; color: var(--on-surface-variant); white-space: nowrap; padding-top: 4px; }
.level-editor-tabs { display: flex; gap: 4px; padding: 4px; background: var(--surface-container-high); border-radius: 12px; margin-bottom: 22px; }
.level-editor-tabs button { display: flex; flex: 1; justify-content: center; align-items: center; gap: 7px; min-height: 44px; background: transparent; border: 1px solid transparent; border-radius: 9px; color: var(--on-surface-variant); font-size: 12px; font-weight: 650; }
.level-editor-tabs button[aria-pressed="true"] { background: var(--surface-container-low); border-color: var(--outline-variant); color: var(--on-surface); box-shadow: var(--shadow-sm); }
.level-editor-tabs .material-symbols-outlined { font-size: 19px; }
.level-controls { border: 0; padding: 0; margin: 0; min-width: 0; }.level-controls:disabled { opacity: .65; }
.level-controls:disabled button, .level-controls:disabled input, .level-controls:disabled textarea { cursor: not-allowed; }
.level-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 15px; background: var(--surface-container); border: 1px solid var(--v7-panel-border); border-radius: 12px; margin: 0 0 18px; }
.level-toggle-row label { font-size: 13px; font-weight: 700; cursor: pointer; }
.level-toggle-row p { font-size: 11px; color: var(--on-surface-variant); line-height: 1.6; margin: 4px 0 0; }
.level-toggle-row input[type="checkbox"] { appearance: auto; width: 24px; height: 24px; min-width: 24px; margin: 10px 0; accent-color: var(--primary); cursor: pointer; }
.level-form-section { border-top: 1px solid var(--v7-panel-border); padding-top: 24px; margin-top: 25px; }
.level-section-title { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 21px; }
.level-section-title > span { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; border: 1px solid var(--outline-variant); border-radius: 10px; color: var(--primary); background: var(--surface-container); font-size: 11px; font-weight: 800; }
.level-section-title h3 { margin: 0; font-size: 14px; }.level-section-title p { color: var(--on-surface-variant); font-size: 11px; margin: 5px 0 0; line-height: 1.55; }
.level-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; margin-bottom: 18px; }
.level-field label, .level-advanced > label { font-size: 12px; font-weight: 650; line-height: 1.5; }
.level-field label span { color: var(--on-surface-variant); font-weight: 400; }
.level-field input, .level-field textarea, .level-advanced textarea { width: 100%; min-width: 0; min-height: 44px; padding: 11px 12px; border: 1px solid var(--outline-variant); border-radius: 10px; background: var(--surface-container); color: var(--on-surface); font-size: 14px; line-height: 1.5; box-sizing: border-box; }
.level-field textarea { resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; }
.level-field small, .level-help { color: var(--on-surface-variant); font-size: 11px; line-height: 1.65; }
.level-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.level-field-warning { display: flex; align-items: flex-start; gap: 6px; color: var(--warning); background: color-mix(in srgb, var(--warning), transparent 92%); padding: 10px 11px; border-radius: 9px; font-size: 11px; line-height: 1.65; margin: 2px 0; }
.level-field-warning .material-symbols-outlined { font-size: 17px; flex-shrink: 0; }
.level-milestone-row { display: grid; grid-template-columns: minmax(70px, .45fr) minmax(0, 1fr) 44px; gap: 10px; align-items: end; margin-bottom: 14px; }
.level-milestone-row .level-field { margin-bottom: 0; }
.level-remove, .level-icon-button { min-height: 44px; width: 44px; display: grid; place-items: center; border: 1px solid var(--outline-variant); border-radius: 10px; background: var(--surface-container); color: var(--on-surface-variant); flex-shrink: 0; }
.level-remove:hover { color: var(--error); background: var(--error-container); }.level-icon-button:hover { color: var(--primary); }
.level-remove .material-symbols-outlined, .level-icon-button .material-symbols-outlined { font-size: 19px; }
.level-inline-empty { color: var(--on-surface-variant); font-size: 12px; line-height: 1.6; padding: 15px; background: var(--surface-container); border-radius: 10px; }
.level-color-field { display: flex; align-items: center; gap: 10px; }.level-color-field > span { width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid var(--outline); border-radius: 10px; }
.level-reset { padding-top: 22px; margin-top: 25px; border-top: 1px solid var(--v7-panel-border); }.level-reset small { display: block; margin-top: 7px; color: var(--on-surface-variant); font-size: 11px; }
.level-advanced textarea { resize: vertical; min-height: 620px; font: 12px/1.7 ui-monospace, monospace; }
.level-notice { display: flex; align-items: flex-start; gap: 10px; padding: 15px; border: 1px solid var(--outline-variant); border-radius: 12px; font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.level-notice p { margin: 4px 0 0; }.level-notice ul { padding-left: 18px; margin: 6px 0 0; }.level-notice .material-symbols-outlined { flex-shrink: 0; font-size: 22px; }
.level-notice.danger { color: var(--error); background: color-mix(in srgb, var(--error), transparent 95%); border-color: color-mix(in srgb, var(--error), transparent 65%); }
.level-config-panel > .level-notice { margin-top: 18px; }
.level-insights { display: grid; gap: 20px; min-width: 0; }
.level-checks { display: grid; gap: 18px; }.level-checks > div { display: flex; align-items: flex-start; gap: 11px; }
.level-checks > div > .material-symbols-outlined { font-size: 21px; color: var(--on-surface-variant); margin-top: 1px; }.level-checks .material-symbols-outlined.good { color: var(--success); }
.level-checks strong, .level-checks b, .level-checks small { display: block; }.level-checks strong { font-size: 12px; }.level-checks b { font-size: 12px; font-weight: 500; margin: 4px 0; }.level-checks small { color: var(--on-surface-variant); font-size: 10px; line-height: 1.6; }
.level-queue-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 24px; }
.level-queue-counts > div { padding: 13px 10px; border: 1px solid var(--v7-panel-border); border-radius: 11px; background: var(--surface-container); }
.level-queue-counts span, .level-queue-counts small { display: block; color: var(--on-surface-variant); font-size: 10px; }.level-queue-counts strong { display: block; font-size: 25px; margin: 5px 0; font-variant-numeric: tabular-nums; }.level-queue-counts small { font-size: 8px; letter-spacing: .05em; }
.level-updated { display: block; font-size: 10px; color: var(--on-surface-variant); }
.level-guide { display: flex; align-items: flex-start; gap: 12px; padding: 20px; border: 1px solid color-mix(in srgb, var(--primary), transparent 75%); border-radius: 16px; background: color-mix(in srgb, var(--primary), transparent 96%); }
.level-guide > .material-symbols-outlined { color: var(--primary); font-size: 22px; }.level-guide h2 { font-size: 13px; margin: 0; }.level-guide p { margin: 7px 0 0; color: var(--on-surface-variant); font-size: 11px; line-height: 1.75; }
.level-operations { min-width: 0; margin-top: 7px; }.level-data-grid { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 20px; }
.level-data-panel h3 { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 0 0 20px; }.level-data-panel h3 > .material-symbols-outlined { color: var(--primary); font-size: 21px; }
.level-table-scroll { max-width: 100%; overflow: auto; border: 1px solid var(--v7-panel-border); border-radius: 12px; }
.level-table-scroll table { width: 100%; border-collapse: collapse; font-size: 11px; }.level-table-scroll th { text-align: left; color: var(--on-surface-variant); background: var(--surface-container); font-size: 10px; font-weight: 600; white-space: nowrap; }
.level-table-scroll th, .level-table-scroll td { padding: 12px 10px; border-bottom: 1px solid var(--v7-panel-border); }.level-table-scroll tr:last-child td { border-bottom: 0; }
.level-table-scroll td { vertical-align: top; font-variant-numeric: tabular-nums; }.level-table-scroll td > small { display: block; margin-top: 5px; color: var(--on-surface-variant); font-size: 10px; line-height: 1.5; white-space: nowrap; }
.level-player-name { overflow-wrap: anywhere; min-width: 100px; }.level-rank-number { display: grid; place-items: center; width: 25px; height: 25px; background: var(--surface-container-high); border-radius: 8px; font-weight: 800; }
.level-reward-state { display: inline-block; padding: 4px 6px; background: var(--surface-container-high); color: var(--on-surface-variant); border-radius: 6px; font-size: 9px; font-weight: 750; letter-spacing: .02em; }
.level-reward-state.state-failed { background: var(--error-container); color: var(--error); }.level-reward-state.state-deferred { background: color-mix(in srgb, var(--warning), transparent 89%); color: var(--warning); }.level-reward-state.state-leased { background: color-mix(in srgb, var(--primary), transparent 89%); color: var(--primary); }.level-reward-state.state-completed { background: color-mix(in srgb, var(--success), transparent 89%); color: var(--success); }
.level-grant-error { margin-top: 6px; color: var(--error); }.level-grant-error summary { cursor: pointer; padding: 6px 0; }.level-grant-error p { min-width: 140px; max-width: 240px; overflow-wrap: anywhere; line-height: 1.6; }
.level-data-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; text-align: center; padding: 20px 12px; border: 1px dashed var(--outline-variant); border-radius: 12px; background: var(--surface-container); }
.level-data-empty > .material-symbols-outlined { color: var(--primary); font-size: 29px; margin-bottom: 12px; }.level-data-empty strong { font-size: 13px; }.level-data-empty p { max-width: 320px; margin: 7px 0 0; font-size: 11px; line-height: 1.7; color: var(--on-surface-variant); }
.level-page :is(button, input, textarea, summary, [tabindex]):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }.level-page button { cursor: pointer; }.level-page button:disabled { cursor: not-allowed; opacity: .55; }
.level-sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media(min-width: 1400px) { .level-insights { position: sticky; top: 20px; } }
@media(max-width: 1150px) { .level-workspace { grid-template-columns: minmax(0, 1fr); }.level-insights { grid-template-columns: repeat(2, minmax(0, 1fr)); }.level-guide { grid-column: 1 / -1; }.level-data-grid { grid-template-columns: minmax(0, 1fr); } }
@media(max-width: 700px) { .level-hero { padding: 23px; align-items: flex-start; }.level-hero-meta { display: none; }.level-insights { grid-template-columns: minmax(0, 1fr); }.level-field input, .level-field textarea, .level-advanced textarea { font-size: 16px; }.level-toolbar-actions { width: 100%; }.level-toolbar-actions .btn { flex: 1; }.level-field-grid { gap: 0 12px; }.level-panel-heading { gap: 10px; }.level-step-label { display: none; } }
@media(max-width: 440px) { .level-page { gap: 16px; }.level-hero { padding: 20px; }.level-eyebrow { font-size: 8px; letter-spacing: .055em; }.level-hero p { font-size: 12px; }.level-config-panel, .level-status-panel, .level-data-panel { padding: 17px; }.level-field-grid { grid-template-columns: minmax(0, 1fr); }.level-editor-tabs button { gap: 5px; font-size: 11px; }.level-editor-tabs .material-symbols-outlined { font-size: 16px; }.level-toolbar-actions .btn { padding-inline: 10px; font-size: 11px; }.level-milestone-row { grid-template-columns: minmax(60px, .5fr) minmax(0, 1fr) 40px; gap: 7px; }.level-remove { width: 40px; }.level-operations > .level-panel-heading { flex-direction: column; }.level-advanced textarea { min-height: 440px; } }
@media(prefers-reduced-motion: reduce) { .level-page *, .level-page *::before, .level-page *::after { animation: none !important; transition: none !important; } }
</style>

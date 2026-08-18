<script setup>
import { ref, onMounted, computed } from 'vue';
import { StatsAPI, RatingsAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';

const toast = useToast();
const exporting = ref(false);
const exportingMoves = ref(false);
const heatmap = ref(null);
const top = ref([]);
const dist = ref(null);
const tags = ref([]);
const ratings = ref(null);
const moveStats = ref(null);

onMounted(async () => {
  const [hm, tr, ds, tc, rt, mv] = await Promise.all([
    StatsAPI.heatmap(30), StatsAPI.topRequesters(10),
    StatsAPI.distribution(), StatsAPI.tagCloud(),
    RatingsAPI.list({ limit: 50 }),
    StatsAPI.moves(30).catch(() => null),
  ]);
  heatmap.value = hm; top.value = tr; dist.value = ds; tags.value = tc; ratings.value = rt; moveStats.value = mv;
});

const heatmapMax = computed(() => {
  if (!heatmap.value?.grid) return 1;
  let m = 0;
  for (const row of heatmap.value.grid) for (const v of row) if (v > m) m = v;
  return m || 1;
});

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function downloadResponseBlob(response, fallbackName) {
  const url = URL.createObjectURL(response.data);
  try {
    const disposition = String(response.headers?.['content-disposition'] || '');
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '').trim()) : fallbackName;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

async function exportCsv() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    downloadResponseBlob(await StatsAPI.downloadCsv(), `tickets-${Date.now()}.csv`);
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không thể export CSV');
  } finally {
    exporting.value = false;
  }
}

async function exportMoveCsv() {
  if (exportingMoves.value) return;
  exportingMoves.value = true;
  try {
    downloadResponseBlob(await StatsAPI.downloadMoveCsv(30), `ticket-moves-${Date.now()}.csv`);
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không thể export lịch sử move');
  } finally {
    exportingMoves.value = false;
  }
}

const maxTag = computed(() => Math.max(1, ...(tags.value || []).map((t) => t.count)));
function tagSize(count) {
  return 11 + Math.round((count / maxTag.value) * 18); // 11-29px
}
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">Analytics</h1>
      <p class="page-sub">Phân tích sâu hệ thống ticket</p>
    </div>
    <div class="flex" style="gap:8px;">
      <StButton variant="secondary" :disabled="exportingMoves" @click="exportMoveCsv">{{ exportingMoves ? 'Đang xuất...' : '📦 Export Move CSV' }}</StButton>
      <StButton variant="primary" :disabled="exporting" @click="exportCsv">{{ exporting ? 'Đang xuất...' : '📥 Export Ticket CSV' }}</StButton>
    </div>
  </div>

  <!-- Heatmap -->
  <div class="card" style="margin-bottom: 16px;">
    <h3 style="margin: 0 0 12px;">🔥 Heatmap — Tickets theo giờ × ngày trong tuần (30 ngày)</h3>
    <div v-if="!heatmap" class="empty">Đang tải...</div>
    <div v-else>
      <div style="display: grid; grid-template-columns: 40px repeat(24, 1fr); gap: 2px;">
        <div></div>
        <div v-for="h in 24" :key="h" class="muted2" style="font-size: 9px; text-align: center;">{{ (h - 1) }}</div>

        <template v-for="(row, di) in heatmap.grid" :key="di">
          <div class="muted2" style="font-size: 10px; padding-top: 6px;">{{ DAY_NAMES[di] }}</div>
          <div
            v-for="(v, hi) in row" :key="hi"
            :title="`${DAY_NAMES[di]} ${hi}h — ${v} tickets`"
            :style="{
              height: '20px',
              borderRadius: '3px',
              background: v === 0
                ? 'var(--bg-3)'
                : `rgba(124, 92, 255, ${0.15 + 0.85 * (v / heatmapMax)})`,
              transition: 'transform 0.1s',
            }"
            class="hover-cell"
          ></div>
        </template>
      </div>
      <div class="muted text-xs mt-3">Tổng: {{ heatmap.totalTickets }} tickets trong {{ heatmap.days }} ngày</div>
    </div>
  </div>

  <div class="grid-2">
    <!-- Distribution -->
    <div class="card">
      <h3 style="margin: 0 0 12px;">📊 Phân bố thời gian xử lý</h3>
      <div v-if="!dist" class="empty">...</div>
      <div v-else>
        <div style="font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 6px;">First response time</div>
        <div v-for="b in dist.firstResponse" :key="'fr-' + b.label" style="margin-bottom: 4px;">
          <div class="flex" style="justify-content: space-between; font-size: 11px;">
            <span>{{ b.label }}</span><span class="muted">{{ b.count }}</span>
          </div>
          <div style="height: 6px; background: var(--bg-3); border-radius: 3px; overflow: hidden;">
            <div :style="{ width: ((b.count / Math.max(1, ...dist.firstResponse.map(x => x.count))) * 100) + '%', height: '100%', background: 'var(--green-2)' }"></div>
          </div>
        </div>

        <div style="font-size: 12px; font-weight: 600; color: var(--text-3); margin: 14px 0 6px;">Close time</div>
        <div v-for="b in dist.closeTime" :key="'ct-' + b.label" style="margin-bottom: 4px;">
          <div class="flex" style="justify-content: space-between; font-size: 11px;">
            <span>{{ b.label }}</span><span class="muted">{{ b.count }}</span>
          </div>
          <div style="height: 6px; background: var(--bg-3); border-radius: 3px; overflow: hidden;">
            <div :style="{ width: ((b.count / Math.max(1, ...dist.closeTime.map(x => x.count))) * 100) + '%', height: '100%', background: 'var(--brand)' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top requesters -->
    <div class="card">
      <h3 style="margin: 0 0 12px;">🏆 Top Requesters (30d)</h3>
      <div v-if="!top.length" class="empty">Chưa có data</div>
      <div v-else>
        <div v-for="(u, i) in top" :key="u.creatorId" style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line-1);">
          <div style="font-weight: 700; width: 24px;">{{ i + 1 }}</div>
          <div style="flex: 1; font-size: 13px;">{{ u.creatorName }}</div>
          <div class="badge badge-gray">{{ u.count }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Ticket routing / move analytics -->
  <div class="card mt-4">
    <div class="flex" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <h3 style="margin:0;">📦 Ticket routing — Move history (30d)</h3>
        <div class="muted text-xs mt-2">Dùng để phát hiện mục tạo ticket dễ bị chọn nhầm và luồng chuyển giữa các đội xử lý.</div>
      </div>
      <span v-if="moveStats?.truncated" class="badge badge-gray">Đang hiển thị tối đa 10.000 lượt move</span>
    </div>
    <div v-if="!moveStats" class="empty">Chưa có dữ liệu routing</div>
    <template v-else>
      <div class="stat-grid" style="margin-bottom:14px;">
        <div class="stat-card"><div class="label">Lượt move</div><div class="value">{{ moveStats.totalMoves || 0 }}</div></div>
        <div class="stat-card"><div class="label">Ticket từng move</div><div class="value">{{ moveStats.movedTickets || 0 }}</div></div>
        <div class="stat-card"><div class="label">Tỷ lệ ticket cần phân luồng</div><div class="value">{{ moveStats.moveRatePercent || 0 }}%</div><div class="sub">{{ moveStats.movedOpenedTickets || 0 }}/{{ moveStats.openedTickets || 0 }} ticket mở trong 30d</div></div>
        <div class="stat-card"><div class="label">Move nhiều lần</div><div class="value">{{ moveStats.repeatedMoveTickets || 0 }}</div><div class="sub">max {{ moveStats.maxMovesOnSingleTicket || 0 }} lần / ticket</div></div>
      </div>

      <div class="grid-2">
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Top luồng chuyển</div>
          <div v-if="!moveStats.topTransitions?.length" class="muted text-sm">Chưa có transition.</div>
          <div v-for="route in moveStats.topTransitions?.slice(0, 10) || []" :key="`${route.fromOptionId}-${route.toOptionId}`" style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-1);font-size:12px;">
            <span><strong>{{ route.fromOptionName }}</strong> → <strong>{{ route.toOptionName }}</strong></span>
            <span class="badge badge-gray">{{ route.count }}</span>
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Top staff phân luồng</div>
          <div v-if="!moveStats.topMovers?.length" class="muted text-sm">Chưa có dữ liệu staff.</div>
          <div v-for="staff in moveStats.topMovers?.slice(0, 10) || []" :key="staff.discordId" style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-1);font-size:12px;">
            <span>{{ staff.username }}</span><span class="badge badge-gray">{{ staff.count }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Tag cloud -->
  <div class="card mt-4">
    <h3 style="margin: 0 0 12px;">☁️ Tag cloud</h3>
    <div v-if="!tags.length" class="empty">Chưa có tag</div>
    <div v-else class="flex" style="flex-wrap: wrap; gap: 10px; align-items: center;">
      <span
        v-for="t in tags" :key="t.tag"
        class="badge badge-brand"
        :style="{ fontSize: tagSize(t.count) + 'px', padding: '4px 12px' }"
      >{{ t.tag }} <span style="opacity: 0.6; font-size: 10px;">({{ t.count }})</span></span>
    </div>
  </div>

  <!-- Ratings -->
  <div v-if="ratings" class="card mt-4">
    <h3 style="margin: 0 0 12px;">⭐ User Ratings</h3>
    <div class="stat-grid" style="margin-bottom: 12px;">
      <div class="stat-card">
        <div class="label">Tổng ratings</div>
        <div class="value">{{ ratings.stats.total }}</div>
      </div>
      <div class="stat-card">
        <div class="label">Avg score</div>
        <div class="value" style="color: var(--yellow-2);">{{ ratings.stats.avg.toFixed(2) }}</div>
        <div class="sub">{{ '⭐'.repeat(Math.round(ratings.stats.avg)) }}</div>
      </div>
      <div class="stat-card" v-for="s in [5,4,3,2,1]" :key="s">
        <div class="label">{{ s }} sao</div>
        <div class="value" :style="{ color: s >= 4 ? 'var(--green-2)' : s >= 3 ? 'var(--yellow-2)' : 'var(--red-2)' }">{{ ratings.stats.distribution[s] }}</div>
      </div>
    </div>
    <div v-if="!ratings.items.length" class="empty">Chưa có rating nào</div>
    <div v-else>
      <div v-for="r in ratings.items.slice(0, 10)" :key="r.id" style="padding: 8px 0; border-bottom: 1px solid var(--line-1);">
        <div class="flex" style="justify-content: space-between; align-items: center;">
          <div>
            <strong>#{{ String(r.ticket?.ticketNum || '?').padStart(4, '0') }}</strong>
            <span class="muted text-sm" style="margin-left: 6px;">{{ r.ticket?.creatorName }}</span>
            <span class="muted text-xs" style="margin-left: 6px;">→ {{ r.staffName || '—' }}</span>
          </div>
          <span style="color: var(--yellow-2);">{{ '⭐'.repeat(r.score) }}{{ '☆'.repeat(5 - r.score) }}</span>
        </div>
        <div v-if="r.comment" class="muted text-sm mt-2">{{ r.comment }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hover-cell:hover { transform: scale(1.4); z-index: 2; position: relative; }
</style>

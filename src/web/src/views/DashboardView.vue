<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ClustersAPI, IntelligenceAPI, KnowledgeAPI, SmartLearnAPI, StaffAPI, StatsAPI, TicketsAPI } from '../api/endpoints';
import { on } from '../socket';

const overview = ref({ totalTickets: 0, openTickets: 0, claimedTickets: 0, closedTickets: 0, slaBreached: 0 });
const chart = ref([]);
const byOption = ref([]);
const leaderboard = ref([]);
const recentTickets = ref([]);
const clusters = ref([]);
const intelligence = ref({ detections: 0, helpfulRate: null, actions: 0, failedActions: 0, knowledge: 0, activeConversations: 0 });
const knowledgeHealth = ref({ total: 0, published: 0, drafts: 0, reviewRequired: 0, expired: 0, lowQuality: 0, aliases: 0, helpfulRate: 1 });
const smartLearnHealth = ref({ pending: 0, conflicted: 0, totalOccurrences: 0, byType: {} });
const moveStats = ref({ totalMoves: 0, movedTickets: 0, averageMovesPerMovedTicket: 0, topTransitions: [], byDestination: [] });
const loading = ref(true);
const refreshing = ref(false);
const lastUpdated = ref(new Date());
const activePoint = ref(null);
const unbinds = [];

const STATUS_LABEL = { open: 'Chờ xử lý', claimed: 'Đang xử lý', closed: 'Đã đóng' };
const STATUS_CLASS = { open: 'status-open', claimed: 'status-claimed', closed: 'status-closed' };
const PRIORITY_LABEL = { urgent: 'Khẩn', high: 'Cao', normal: 'Thường' };

const pad4 = (value) => String(value ?? 0).padStart(4, '0');
const activeTickets = computed(() => Number(overview.value.openTickets || 0) + Number(overview.value.claimedTickets || 0));
const closeRate = computed(() => overview.value.totalTickets ? Math.round((overview.value.closedTickets / overview.value.totalTickets) * 100) : 0);
const aiHelpfulRate = computed(() => intelligence.value.helpfulRate == null ? null : Math.round(intelligence.value.helpfulRate * 100));
const actionSuccessRate = computed(() => {
  const actions = Number(intelligence.value.actions || 0);
  if (!actions) return null;
  return Math.max(0, Math.round(((actions - Number(intelligence.value.failedActions || 0)) / actions) * 100));
});
const clusterReadyCount = computed(() => clusters.value.filter((cluster) => cluster.isActive && cluster.discordCategoryId && cluster.staffRoleIds).length);
const clusterActiveCount = computed(() => clusters.value.filter((cluster) => cluster.isActive).length);
const topOption = computed(() => byOption.value[0] || null);
const queue = computed(() => [...recentTickets.value]
  .filter((ticket) => ticket.status !== 'closed')
  .sort((a, b) => {
    const weight = { urgent: 3, high: 2, normal: 1 };
    return (weight[b.priority] || 0) - (weight[a.priority] || 0) || new Date(a.openedAt) - new Date(b.openedAt);
  })
  .slice(0, 5));

const metricBars = computed(() => {
  const source = chart.value.slice(-7);
  const max = Math.max(1, ...source.map((item) => item.opened + item.closed));
  return source.map((item) => Math.max(12, Math.round(((item.opened + item.closed) / max) * 100)));
});

async function load({ quiet = false } = {}) {
  if (quiet) refreshing.value = true;
  else loading.value = true;

  const tasks = await Promise.allSettled([
    StatsAPI.overview(),
    StatsAPI.chart(14),
    StatsAPI.byOption(),
    StaffAPI.leaderboard(),
    TicketsAPI.list({ limit: 12, sortBy: 'openedAt', sortDir: 'desc' }),
    ClustersAPI.list(),
    IntelligenceAPI.overview(),
    KnowledgeAPI.overview(),
    SmartLearnAPI.overview(),
    StatsAPI.moves(30),
  ]);

  if (tasks[0].status === 'fulfilled') overview.value = tasks[0].value;
  if (tasks[1].status === 'fulfilled') chart.value = tasks[1].value.chart || [];
  if (tasks[2].status === 'fulfilled') byOption.value = tasks[2].value || [];
  if (tasks[3].status === 'fulfilled') leaderboard.value = tasks[3].value.leaderboard || [];
  if (tasks[4].status === 'fulfilled') recentTickets.value = tasks[4].value.tickets || tasks[4].value || [];
  if (tasks[5].status === 'fulfilled') clusters.value = tasks[5].value || [];
  if (tasks[6].status === 'fulfilled') intelligence.value = tasks[6].value || intelligence.value;
  if (tasks[7].status === 'fulfilled') knowledgeHealth.value = tasks[7].value || knowledgeHealth.value;
  if (tasks[8].status === 'fulfilled') smartLearnHealth.value = tasks[8].value || smartLearnHealth.value;
  if (tasks[9].status === 'fulfilled') moveStats.value = tasks[9].value || moveStats.value;

  lastUpdated.value = new Date();
  loading.value = false;
  refreshing.value = false;
}

onMounted(() => {
  load();
  unbinds.push(on('ticket:created', (ticket) => {
    recentTickets.value = [ticket, ...recentTickets.value.filter((item) => item.id !== ticket.id)].slice(0, 12);
    load({ quiet: true });
  }));
  for (const event of ['ticket:updated', 'ticket:claimed', 'ticket:closed', 'ticket:moved']) {
    unbinds.push(on(event, (payload) => {
      const changedTicket = event === 'ticket:moved' ? payload?.ticket : payload;
      if (changedTicket?.id) {
        const index = recentTickets.value.findIndex((item) => item.id === changedTicket.id);
        if (index !== -1) recentTickets.value[index] = { ...recentTickets.value[index], ...changedTicket };
      }
      if (event !== 'ticket:updated') load({ quiet: true });
    }));
  }
});

onUnmounted(() => unbinds.forEach((unbind) => unbind()));

function fmtMin(value) {
  const minutes = Number(value || 0);
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours}h ${remain}m` : `${hours} giờ`;
}

function relativeTime(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'vừa xong';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}


function clusterForTicket(ticket) {
  return clusters.value.find((cluster) => cluster.key === ticket?.clusterKey) || null;
}

function clusterHealth(cluster) {
  const checks = [cluster.discordCategoryId, cluster.staffRoleIds, cluster.supportChannelIds];
  const score = checks.filter(Boolean).length;
  if (!cluster.isActive) return { label: 'Đang tắt', tone: 'muted', score: 0 };
  if (score === checks.length) return { label: 'Sẵn sàng', tone: 'good', score: 100 };
  if (score >= 2) return { label: 'Gần hoàn tất', tone: 'warn', score: 72 };
  return { label: 'Cần cấu hình', tone: 'danger', score: 38 };
}

// SVG chart
const svgWidth = 920;
const svgHeight = 280;
const pad = { left: 42, right: 22, top: 24, bottom: 34 };
const graphWidth = svgWidth - pad.left - pad.right;
const graphHeight = svgHeight - pad.top - pad.bottom;
const maxChart = computed(() => Math.max(1, ...chart.value.flatMap((item) => [item.opened || 0, item.closed || 0])));

function chartPoints(key) {
  const data = chart.value;
  if (!data.length) return [];
  const step = data.length > 1 ? graphWidth / (data.length - 1) : 0;
  return data.map((item, index) => ({
    x: pad.left + index * step,
    y: pad.top + graphHeight - ((item[key] || 0) / maxChart.value) * graphHeight,
    data: item,
  }));
}
const openedPoints = computed(() => chartPoints('opened'));
const closedPoints = computed(() => chartPoints('closed'));

function curve(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const delta = (next.x - current.x) / 3;
    path += ` C ${current.x + delta} ${current.y}, ${next.x - delta} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}
const openedLine = computed(() => curve(openedPoints.value));
const closedLine = computed(() => curve(closedPoints.value));
const openedArea = computed(() => openedPoints.value.length ? `${openedLine.value} L ${openedPoints.value.at(-1).x} ${pad.top + graphHeight} L ${openedPoints.value[0].x} ${pad.top + graphHeight} Z` : '');
const gridLines = computed(() => Array.from({ length: 5 }, (_, index) => ({
  y: pad.top + (graphHeight / 4) * index,
  value: Math.round(maxChart.value * (1 - index / 4)),
})));
</script>

<template>
  <div class="dashboard-pro">
    <section class="mission-hero">
      <div class="mission-copy">
        <div class="mission-kicker"><span></span> IS7MC SUPPORT COMMAND CENTER</div>
        <h1>Điều hành hỗ trợ.<br><em>Rõ ràng trong một màn hình.</em></h1>
        <p>Theo dõi ticket, chất lượng AI và sức khỏe của từng cụm mà không phải chuyển qua nhiều trang.</p>
        <div class="mission-actions">
          <RouterLink to="/tickets" class="pro-button primary">
            <span class="material-symbols-outlined">confirmation_number</span>Xử lý ticket
          </RouterLink>
          <RouterLink to="/intelligence" class="pro-button secondary">
            <span class="material-symbols-outlined">neurology</span>Kiểm tra AI
          </RouterLink>
          <button class="pro-button ghost" :disabled="refreshing" @click="load({ quiet: true })">
            <span class="material-symbols-outlined" :class="{ spin: refreshing }">refresh</span>Làm mới
          </button>
        </div>
      </div>

      <div class="mission-status">
        <div class="status-ring" :style="{ '--progress': `${closeRate * 3.6}deg` }">
          <div><strong>{{ closeRate }}%</strong><span>đã xử lý</span></div>
        </div>
        <div class="status-lines">
          <div><span class="pulse-dot"></span><strong>{{ activeTickets }}</strong><small>ticket đang hoạt động</small></div>
          <div><span class="mini-icon material-symbols-outlined">hub</span><strong>{{ clusterReadyCount }}/{{ clusterActiveCount }}</strong><small>cụm sẵn sàng</small></div>
          <div><span class="mini-icon material-symbols-outlined">verified</span><strong>{{ aiHelpfulRate == null ? '—' : `${aiHelpfulRate}%` }}</strong><small>AI hữu ích</small></div>
        </div>
      </div>
    </section>

    <section class="pro-metrics" :class="{ loading }">
      <article class="pro-metric blue">
        <div class="metric-top"><span class="metric-icon material-symbols-outlined">confirmation_number</span><span class="metric-chip">Toàn thời gian</span></div>
        <strong>{{ overview.totalTickets }}</strong><p>Tổng ticket</p>
        <div class="metric-spark"><i v-for="(height, index) in metricBars" :key="index" :style="{ height: `${height}%` }"></i></div>
      </article>
      <article class="pro-metric violet">
        <div class="metric-top"><span class="metric-icon material-symbols-outlined">pending_actions</span><span class="metric-chip">Cần chú ý</span></div>
        <strong>{{ activeTickets }}</strong><p>Đang cần xử lý</p>
        <small>{{ overview.openTickets }} chờ • {{ overview.claimedTickets }} đã nhận</small>
      </article>
      <article class="pro-metric green">
        <div class="metric-top"><span class="metric-icon material-symbols-outlined">speed</span><span class="metric-chip">Trung bình</span></div>
        <strong>{{ fmtMin(overview.avgFirstResponseMinutes) }}</strong><p>Phản hồi đầu tiên</p>
        <small>P95: {{ fmtMin(overview.p95FirstResponseMinutes) }}</small>
      </article>
      <article class="pro-metric orange">
        <div class="metric-top"><span class="metric-icon material-symbols-outlined">warning</span><span class="metric-chip">SLA</span></div>
        <strong>{{ overview.slaBreached || 0 }}</strong><p>Ticket quá hạn</p>
        <small>{{ overview.avgRating ? `${Number(overview.avgRating).toFixed(1)}★ đánh giá trung bình` : 'Chưa có đánh giá' }}</small>
      </article>
    </section>

    <section class="pro-layout-main">
      <article class="pro-panel trend-panel">
        <header class="pro-panel-head">
          <div><span class="section-label">VẬN HÀNH 14 NGÀY</span><h2>Nhịp độ ticket</h2><p>Mở mới và hoàn tất theo ngày</p></div>
          <div class="chart-legend-pro"><span><i class="open"></i>Mở mới</span><span><i class="closed"></i>Đã đóng</span></div>
        </header>
        <div v-if="loading" class="panel-skeleton tall"></div>
        <div v-else-if="!chart.length" class="pro-empty"><span class="material-symbols-outlined">monitoring</span>Chưa có dữ liệu biểu đồ</div>
        <div v-else class="pro-chart">
          <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="pro-open-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6c63ff" stop-opacity=".34"/><stop offset="100%" stop-color="#6c63ff" stop-opacity="0"/></linearGradient>
            </defs>
            <g class="pro-grid"><line v-for="line in gridLines" :key="line.y" :x1="pad.left" :x2="svgWidth - pad.right" :y1="line.y" :y2="line.y"/><text v-for="line in gridLines" :key="`t${line.y}`" :x="pad.left - 10" :y="line.y + 4">{{ line.value }}</text></g>
            <path :d="openedArea" class="area-open"/>
            <path :d="openedLine" class="line-open"/>
            <path :d="closedLine" class="line-closed"/>
            <g>
              <circle v-for="point in openedPoints" :key="`o${point.data.date}`" :cx="point.x" :cy="point.y" r="5" class="point-open" @mouseenter="activePoint = point" @mouseleave="activePoint = null"/>
              <text v-for="(point, index) in openedPoints" v-show="index % 2 === 0" :key="`d${point.data.date}`" :x="point.x" :y="svgHeight - 10" class="date-label">{{ point.data.date.slice(5) }}</text>
            </g>
          </svg>
          <div v-if="activePoint" class="pro-tooltip" :style="{ left: `${Math.min(86, Math.max(8, activePoint.x / svgWidth * 100))}%`, top: `${Math.max(4, activePoint.y / svgHeight * 100 - 17)}%` }">
            <strong>{{ activePoint.data.date }}</strong><span>{{ activePoint.data.opened }} mở • {{ activePoint.data.closed }} đóng</span>
          </div>
        </div>
      </article>

      <article class="pro-panel queue-panel">
        <header class="pro-panel-head compact"><div><span class="section-label">ACTION QUEUE</span><h2>Cần xử lý ngay</h2></div><RouterLink to="/tickets" class="text-link">Tất cả</RouterLink></header>
        <div v-if="loading" class="panel-skeleton tall"></div>
        <div v-else-if="!queue.length" class="pro-empty small"><span class="material-symbols-outlined">task_alt</span>Không có ticket tồn đọng</div>
        <div v-else class="queue-list">
          <RouterLink v-for="ticket in queue" :key="ticket.id" :to="`/tickets/${ticket.id}`" class="queue-item">
            <span :class="['priority-line', ticket.priority || 'normal']"></span>
            <div class="queue-id">#{{ pad4(ticket.ticketNum) }}</div>
            <div class="queue-copy"><strong>{{ ticket.creatorName || 'Người chơi' }}</strong><small>{{ clusterForTicket(ticket)?.emoji || ticket.option?.emoji || '🎫' }} {{ clusterForTicket(ticket)?.name || ticket.option?.name || 'Hỗ trợ chung' }}</small></div>
            <div class="queue-meta"><span>{{ PRIORITY_LABEL[ticket.priority] || 'Thường' }}</span><small>{{ relativeTime(ticket.openedAt) }}</small></div>
            <span class="material-symbols-outlined">arrow_forward</span>
          </RouterLink>
        </div>
      </article>
    </section>

    <section class="section-heading">
      <div><span class="section-label">MULTI-CLUSTER</span><h2>Sức khỏe cụm máy chủ</h2><p>Kiểm tra nhanh mức độ sẵn sàng của luồng ticket theo từng chế độ chơi.</p></div>
      <RouterLink to="/clusters" class="pro-button secondary small">Quản lý cụm <span class="material-symbols-outlined">arrow_outward</span></RouterLink>
    </section>

    <section class="cluster-health-grid">
      <article v-for="cluster in clusters" :key="cluster.id" class="cluster-health-card" :style="{ '--cluster': cluster.color || '#6c63ff' }">
        <div class="cluster-card-top"><span class="cluster-emoji">{{ cluster.emoji || '🗺️' }}</span><span :class="['health-badge', clusterHealth(cluster).tone]">{{ clusterHealth(cluster).label }}</span></div>
        <h3>{{ cluster.name }}</h3><p>{{ cluster.description || 'Chưa có mô tả cho cụm này.' }}</p>
        <div class="cluster-progress"><i :style="{ width: `${clusterHealth(cluster).score}%` }"></i></div>
        <footer><span>{{ cluster._count?.tickets || 0 }} ticket</span><span>{{ cluster.isActive ? 'Đang hoạt động' : 'Đã tắt' }}</span></footer>
      </article>
      <RouterLink v-if="!clusters.length && !loading" to="/clusters" class="cluster-health-card add-cluster"><span class="material-symbols-outlined">add_circle</span><strong>Thiết lập các cụm máy chủ</strong><small>SMP, Survival, Skyblock, BoxPvP...</small></RouterLink>
    </section>

    <section class="pro-layout-lower">
      <article class="pro-panel ai-quality-panel">
        <header class="pro-panel-head"><div><span class="section-label">SMART ASSISTANT</span><h2>Chất lượng AI</h2><p>30 ngày gần nhất</p></div><RouterLink to="/intelligence" class="text-link">Chi tiết</RouterLink></header>
        <div class="ai-score-grid">
          <div class="ai-score-main"><strong>{{ aiHelpfulRate == null ? '—' : `${aiHelpfulRate}%` }}</strong><span>Phản hồi hữu ích</span><div class="score-track"><i :style="{ width: `${aiHelpfulRate || 0}%` }"></i></div></div>
          <div class="ai-mini"><span class="material-symbols-outlined">psychology</span><strong>{{ intelligence.detections || 0 }}</strong><small>lượt nhận diện</small></div>
          <div class="ai-mini"><span class="material-symbols-outlined">bolt</span><strong>{{ actionSuccessRate == null ? '—' : `${actionSuccessRate}%` }}</strong><small>action thành công</small></div>
          <div class="ai-mini"><span class="material-symbols-outlined">forum</span><strong>{{ intelligence.activeConversations || 0 }}</strong><small>hội thoại đang nhớ</small></div>
          <div class="ai-mini"><span class="material-symbols-outlined">library_books</span><strong>{{ intelligence.knowledge || 0 }}</strong><small>tài liệu hoạt động</small></div>
        </div>
      </article>

      <article class="pro-panel knowledge-command-panel">
        <header class="pro-panel-head compact">
          <div><span class="section-label">VERIFIED KNOWLEDGE</span><h2>Knowledge Command</h2></div>
          <RouterLink to="/knowledge" class="text-link">Quản lý</RouterLink>
        </header>
        <div class="knowledge-command-score">
          <div class="knowledge-orb" :style="{ '--knowledge-progress': `${Math.round((knowledgeHealth.helpfulRate || 0) * 360)}deg` }">
            <div><strong>{{ Math.round((knowledgeHealth.helpfulRate || 0) * 100) }}%</strong><small>hữu ích</small></div>
          </div>
          <div class="knowledge-command-copy">
            <strong>{{ knowledgeHealth.published || 0 }} kiến thức đang hoạt động</strong>
            <span>{{ knowledgeHealth.aliases || 0 }} câu đồng nghĩa đã học</span>
            <div class="knowledge-alert-row">
              <RouterLink v-if="knowledgeHealth.reviewRequired" to="/knowledge?health=review" class="knowledge-alert warn"><b>{{ knowledgeHealth.reviewRequired }}</b> cần xem lại</RouterLink>
              <RouterLink v-if="knowledgeHealth.expired" to="/knowledge?health=expired" class="knowledge-alert danger"><b>{{ knowledgeHealth.expired }}</b> hết hạn</RouterLink>
              <span v-if="!knowledgeHealth.reviewRequired && !knowledgeHealth.expired" class="knowledge-alert good"><span class="material-symbols-outlined">verified</span> Kho kiến thức ổn định</span>
            </div>
          </div>
        </div>
        <div class="smartlearn-queue-strip">
          <div><span class="material-symbols-outlined">school</span><p><strong>{{ smartLearnHealth.pending || 0 }}</strong><small>chờ duyệt</small></p></div>
          <div><span class="material-symbols-outlined">merge</span><p><strong>{{ smartLearnHealth.totalOccurrences || 0 }}</strong><small>lượt câu hỏi đã gộp</small></p></div>
          <div><span class="material-symbols-outlined">warning</span><p><strong>{{ smartLearnHealth.conflicted || 0 }}</strong><small>đang tranh luận</small></p></div>
        </div>
        <footer class="knowledge-command-actions">
          <RouterLink to="/knowledge" class="pro-button secondary small"><span class="material-symbols-outlined">library_books</span> Kho kiến thức</RouterLink>
          <RouterLink to="/smartlearn" class="pro-button primary small"><span class="material-symbols-outlined">fact_check</span> Hàng đợi duyệt</RouterLink>
        </footer>
      </article>


      <article class="pro-panel category-panel">
        <header class="pro-panel-head compact"><div><span class="section-label">TICKET ROUTING</span><h2>Move & phân luồng</h2></div><span class="top-category">30 ngày</span></header>
        <div class="ai-score-grid">
          <div class="ai-mini"><span class="material-symbols-outlined">drive_file_move</span><strong>{{ moveStats.totalMoves || 0 }}</strong><small>lượt move</small></div>
          <div class="ai-mini"><span class="material-symbols-outlined">confirmation_number</span><strong>{{ moveStats.movedTickets || 0 }}</strong><small>ticket từng move</small></div>
          <div class="ai-mini"><span class="material-symbols-outlined">repeat</span><strong>{{ moveStats.averageMovesPerMovedTicket || 0 }}</strong><small>move / ticket</small></div>
        </div>
        <div v-if="moveStats.topTransitions?.length" class="category-list" style="margin-top:12px;">
          <div v-for="route in moveStats.topTransitions.slice(0, 5)" :key="`${route.fromOptionId}-${route.toOptionId}`">
            <div><span>{{ route.fromOptionName }} → {{ route.toOptionName }}</span><strong>{{ route.count }}</strong></div>
          </div>
        </div>
        <div v-else class="pro-empty small"><span class="material-symbols-outlined">route</span>Chưa có ticket được move</div>
      </article>

      <article class="pro-panel team-panel">
        <header class="pro-panel-head compact"><div><span class="section-label">ĐỘI NGŨ</span><h2>Top hỗ trợ tháng</h2></div><RouterLink to="/analytics" class="text-link">Hiệu suất</RouterLink></header>
        <div v-if="!leaderboard.length" class="pro-empty small"><span class="material-symbols-outlined">group</span>Chưa có dữ liệu staff</div>
        <div v-else class="pro-leaderboard">
          <div v-for="(staff, index) in leaderboard.slice(0, 5)" :key="staff.discordId" class="leader-row">
            <span :class="['leader-rank', `rank-${index + 1}`]">{{ index + 1 }}</span>
            <img v-if="staff.avatar" :src="staff.avatar" alt=""/><span v-else class="leader-avatar">{{ staff.username?.[0]?.toUpperCase() || '?' }}</span>
            <div><strong>{{ staff.username }}</strong><small>{{ staff.role || 'Staff' }}</small></div>
            <span class="leader-count">{{ staff.ticketsClaimed }} <small>ticket</small></span>
          </div>
        </div>
      </article>

      <article class="pro-panel category-panel">
        <header class="pro-panel-head compact"><div><span class="section-label">PHÂN LOẠI</span><h2>Nhu cầu hỗ trợ</h2></div><span class="top-category">{{ topOption?.emoji }} {{ topOption?.optionName || '—' }}</span></header>
        <div v-if="!byOption.length" class="pro-empty small"><span class="material-symbols-outlined">donut_large</span>Chưa có dữ liệu</div>
        <div v-else class="category-list">
          <div v-for="item in byOption.slice(0, 6)" :key="item.optionId || item.optionName">
            <div><span>{{ item.emoji || '•' }} {{ item.optionName }}</span><strong>{{ item.count }}</strong></div>
            <i><b :style="{ width: `${Math.round((item.count / Math.max(...byOption.map((x) => x.count))) * 100)}%`, background: item.color || '#6c63ff' }"></b></i>
          </div>
        </div>
      </article>
    </section>

    <section class="pro-panel recent-panel">
      <header class="pro-panel-head"><div><span class="section-label">REALTIME FEED</span><h2>Hoạt động gần đây</h2><p>Cập nhật trực tiếp từ Discord và dashboard</p></div><span class="updated-at"><span></span>Cập nhật {{ lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }}</span></header>
      <div class="recent-table-wrap">
        <table class="recent-table">
          <thead><tr><th>Ticket</th><th>Người chơi</th><th>Cụm / Loại</th><th>Trạng thái</th><th>Ưu tiên</th><th>Thời gian</th><th></th></tr></thead>
          <tbody>
            <tr v-for="ticket in recentTickets.slice(0, 8)" :key="ticket.id">
              <td><RouterLink :to="`/tickets/${ticket.id}`" class="ticket-number">#{{ pad4(ticket.ticketNum) }}</RouterLink></td>
              <td><div class="table-user"><span>{{ ticket.creatorName?.[0]?.toUpperCase() || '?' }}</span><strong>{{ ticket.creatorName || 'Người chơi' }}</strong></div></td>
              <td><div class="table-cluster"><span>{{ clusterForTicket(ticket)?.emoji || ticket.option?.emoji || '🎫' }}</span><div><strong>{{ clusterForTicket(ticket)?.name || ticket.clusterKey || 'Toàn hệ thống' }}</strong><small>{{ ticket.option?.name || ticket.type || 'Hỗ trợ' }}</small></div></div></td>
              <td><span :class="['pro-status', STATUS_CLASS[ticket.status]]"><i></i>{{ STATUS_LABEL[ticket.status] || ticket.status }}</span></td>
              <td><span :class="['priority-pill', ticket.priority || 'normal']">{{ PRIORITY_LABEL[ticket.priority] || 'Thường' }}</span></td>
              <td class="muted-cell">{{ relativeTime(ticket.openedAt) }}</td>
              <td><RouterLink :to="`/tickets/${ticket.id}`" class="row-action"><span class="material-symbols-outlined">chevron_right</span></RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

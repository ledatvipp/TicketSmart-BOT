<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../stores/auth';
import { getStoredValue, setStoredValue } from '../utils/storage';
import { socketState } from '../socket';

const auth = useAuth();
const route = useRoute();
const emit = defineEmits(['toggle-sidebar']);
defineProps({ navExpanded: { type: Boolean, default: true } });
const theme = ref('dark');

const pageMap = {
  '/dashboard': ['Trung tâm vận hành', 'Theo dõi ticket, AI và các cụm máy chủ'],
  '/tickets': ['Tickets', 'Tìm kiếm và xử lý yêu cầu hỗ trợ'],
  '/analytics': ['Phân tích', 'Hiệu suất hỗ trợ và xu hướng vận hành'],
  '/clusters': ['Cụm máy chủ', 'Quản lý luồng hỗ trợ theo từng chế độ chơi'],
  '/knowledge': ['Knowledge Base', 'Nguồn kiến thức an toàn cho Smart AI'],
  '/smartlearn': ['SmartLearn', 'Hàng đợi kiến thức do staff xác minh'],
  '/intelligence': ['AI & Actions', 'Quan sát chất lượng nhận diện và hành động'],
  '/config': ['Cấu hình', 'Điều khiển bot, ticket và trải nghiệm người dùng'],
  '/levels': ['Level Chat', 'Cấp độ, hình ảnh thành viên và phần thưởng Minecraft'],
  '/options': ['Loại ticket', 'Sắp xếp biểu mẫu và luồng hỗ trợ'],
  '/staff': ['Đội ngũ', 'Quản lý nhân sự và quyền truy cập'],
  '/canned': ['Mẫu trả lời', 'Phản hồi nhanh và nhất quán'],
  '/audit': ['Nhật ký', 'Tra cứu các thao tác quản trị'],
  '/faqs': ['FAQ', 'Những câu hỏi thường gặp'],
  '/autotag': ['Auto tags', 'Tự động phân loại yêu cầu hỗ trợ'],
  '/webhooks': ['Webhooks', 'Kết nối và theo dõi sự kiện hệ thống'],
  '/announcements': ['Thông báo', 'Soạn thông báo cho cộng đồng Discord'],
  '/banner-generator': ['Studio ảnh', 'Thiết kế ảnh thông báo'],
};
const pageInfo = computed(() => {
  const key = Object.keys(pageMap).find((path) => route.path === path || route.path.startsWith(`${path}/`));
  return pageMap[key] || ['IS7MC Control', 'Discord support management'];
});

function applyTheme(nextTheme) {
  theme.value = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  setStoredValue('ticket-theme', nextTheme);
}
function toggleTheme() { applyTheme(theme.value === 'dark' ? 'light' : 'dark'); }
function openPalette() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })); }

onMounted(() => {
  const saved = getStoredValue('ticket-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || preferred);
});
</script>

<template>
  <header class="topnav topnav-v7">
    <div class="topnav-v7-left">
      <button id="sidebar-toggle" class="topnav-icon-btn" title="Mở / thu gọn menu" aria-label="Mở / thu gọn menu" aria-controls="primary-sidebar" :aria-expanded="navExpanded" @click="emit('toggle-sidebar')">
        <span class="material-symbols-outlined">menu_open</span>
      </button>
      <div class="page-context">
        <strong>{{ pageInfo[0] }}</strong>
        <small>{{ pageInfo[1] }}</small>
      </div>
    </div>

    <div class="topnav-v7-actions">
      <button class="command-trigger" aria-label="Tìm kiếm nhanh" @click="openPalette">
        <span class="material-symbols-outlined">search</span>
        <span>Tìm kiếm nhanh</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div :class="['connection-chip', { offline: !socketState.connected }]">
        <span></span>{{ socketState.connected ? 'Realtime' : 'Offline' }}
      </div>

      <button class="topnav-icon-btn" :title="theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'" :aria-label="theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'" @click="toggleTheme">
        <span class="material-symbols-outlined">{{ theme === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
      </button>

      <div class="topnav-profile">
        <img v-if="auth.user?.avatar" :src="auth.user.avatar" alt="" />
        <span v-else>{{ (auth.user?.username || '?')[0].toUpperCase() }}</span>
        <div>
          <strong>{{ auth.user?.username }}</strong>
          <small>{{ auth.user?.role }}</small>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useAuth } from '../stores/auth';
import { socketState } from '../socket';

defineProps({
  open: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  mobile: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'toggle-collapse']);
const auth = useAuth();

const canOpen = (item) => {
  if (item.admin) return auth.isAdmin;
  return !item.permission || auth.hasPermission(item.permission);
};

const sections = computed(() => {
  const operations = [
    { to: '/dashboard', label: 'Tổng quan', icon: 'space_dashboard', permission: 'analytics.view' },
    { to: '/tickets', label: 'Tickets', icon: 'confirmation_number', permission: 'ticket.view' },
    { to: '/analytics', label: 'Phân tích', icon: 'query_stats', permission: 'analytics.view' },
  ];
  const intelligence = [
    { to: '/intelligence', label: 'AI & Actions', icon: 'neurology', permission: 'intelligence.view' },
    { to: '/knowledge', label: 'Knowledge Base', icon: 'auto_stories', permission: 'knowledge.view' },
    { to: '/smartlearn', label: 'SmartLearn', icon: 'school', permission: 'smartlearn.view' },
    { to: '/levels', label: 'Level Chat', icon: 'workspace_premium', admin: true },
    { to: '/canned', label: 'Mẫu trả lời', icon: 'quickreply', permission: 'canned.view' },
    { to: '/faqs', label: 'FAQ cũ', icon: 'help_center', permission: 'faq.view' },
  ];
  const system = [
    { to: '/clusters', label: 'Cụm máy chủ', icon: 'hub', admin: true },
    { to: '/options', label: 'Loại ticket', icon: 'view_quilt', permission: 'ticket.view' },
    { to: '/audit', label: 'Nhật ký', icon: 'history', permission: 'audit.view' },
    { to: '/staff', label: 'Đội ngũ', icon: 'group', admin: true },
  ];
  const admin = [
    { to: '/announcements', label: 'Thông báo', icon: 'campaign', admin: true },
    { to: '/banner-generator', label: 'Studio ảnh', icon: 'imagesmode', admin: true },
    { to: '/autotag', label: 'Auto tags', icon: 'new_label', admin: true },
    { to: '/webhooks', label: 'Webhooks', icon: 'webhook', admin: true },
    { to: '/config', label: 'Cấu hình', icon: 'tune', admin: true },
  ];

  return [
    { label: 'Vận hành', items: operations.filter(canOpen) },
    { label: 'Trí tuệ', items: intelligence.filter(canOpen) },
    { label: 'Hệ thống', items: system.filter(canOpen) },
    { label: 'Quản trị', items: admin.filter(canOpen) },
  ].filter((group) => group.items.length > 0);
});

function logout() {
  if (confirm('Đăng xuất khỏi dashboard?')) auth.logout();
}

const userInitial = computed(() => (auth.user?.username || '?')[0].toUpperCase());
</script>

<template>
  <div class="sidebar-backdrop" :class="{ show: open }" @click="emit('close')"></div>
  <aside id="primary-sidebar" class="sidebar sidebar-v7" :class="{ open, collapsed: collapsed && !mobile }" :inert="mobile && !open" aria-label="Menu quản trị">
    <div class="sidebar-v7-brand">
      <div class="brand-orb"><span>IS</span></div>
      <div class="brand-copy">
        <strong>IS7MC Control</strong>
        <small>Support Intelligence</small>
      </div>
      <button class="sidebar-collapse-btn" :title="mobile ? 'Đóng menu' : 'Thu gọn sidebar'" :aria-label="mobile ? 'Đóng menu' : 'Thu gọn sidebar'" @click="mobile ? emit('close') : emit('toggle-collapse')">
        <span class="material-symbols-outlined">dock_to_right</span>
      </button>
    </div>

    <div class="sidebar-workspace">
      <span class="workspace-dot"></span>
      <div>
        <strong>IS7MC Network</strong>
        <small>{{ socketState.connected ? 'Hệ thống đang trực tuyến' : 'Mất kết nối realtime' }}</small>
      </div>
      <span :class="['live-pill', { offline: !socketState.connected }]">{{ socketState.connected ? 'LIVE' : 'OFF' }}</span>
    </div>

    <nav class="sidebar-v7-nav" aria-label="Điều hướng chính">
      <section v-for="group in sections" :key="group.label" class="sidebar-nav-group">
        <h3>{{ group.label }}</h3>
        <RouterLink
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="nav-link nav-link-v7"
          active-class="active"
          :title="collapsed && !mobile ? item.label : undefined"
          :aria-label="item.label"
        >
          <span class="nav-icon"><span class="material-symbols-outlined">{{ item.icon }}</span></span>
          <span class="nav-label">{{ item.label }}</span>
          <span class="nav-arrow material-symbols-outlined">chevron_right</span>
        </RouterLink>
      </section>
    </nav>

    <div class="sidebar-v7-footer">
      <button class="sidebar-user" @click="logout" title="Đăng xuất">
        <img v-if="auth.user?.avatar" :src="auth.user.avatar" alt="" />
        <span v-else class="sidebar-avatar-fallback">{{ userInitial }}</span>
        <span class="sidebar-user-copy">
          <strong>{{ auth.user?.username }}</strong>
          <small>{{ auth.user?.role || 'Staff' }}</small>
        </span>
        <span class="material-symbols-outlined logout-icon">logout</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from './stores/auth';
import TopNav from './components/TopNav.vue';
import Sidebar from './components/Sidebar.vue';
import Toasts from './components/Toasts.vue';
import CommandPalette from './components/CommandPalette.vue';
import { getStoredValue, setStoredValue } from './utils/storage';

const auth = useAuth();
const route = useRoute();
const mobileNavOpen = ref(false);
const sidebarCollapsed = ref(getStoredValue('ticket-sidebar-collapsed') === 'true');

const showShell = computed(() => auth.isAuthenticated && !route.meta.public);

function toggleSidebar() {
  if (window.matchMedia('(max-width: 980px)').matches) {
    mobileNavOpen.value = !mobileNavOpen.value;
    return;
  }
  sidebarCollapsed.value = !sidebarCollapsed.value;
  setStoredValue('ticket-sidebar-collapsed', String(sidebarCollapsed.value));
}

onMounted(() => auth.bootstrap());

watch(() => route.fullPath, () => {
  mobileNavOpen.value = false;
});
</script>

<template>
  <div
    v-if="showShell"
    class="app-shell app-shell-v7"
    :class="{ 'sidebar-collapsed': sidebarCollapsed }"
  >
    <TopNav @toggle-sidebar="toggleSidebar" />
    <Sidebar
      :open="mobileNavOpen"
      :collapsed="sidebarCollapsed"
      @close="mobileNavOpen = false"
      @toggle-collapse="toggleSidebar"
    />
    <main class="main main-v7">
      <RouterView />
    </main>
  </div>

  <RouterView v-else />

  <Toasts />
  <CommandPalette v-if="showShell" />
</template>

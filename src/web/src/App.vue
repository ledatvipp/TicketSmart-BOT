<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
const mobileView = ref(window.matchMedia('(max-width: 980px)').matches);
const mainRegion = ref(null);
let mediaQuery;

const showShell = computed(() => auth.isAuthenticated && !route.meta.public);

function toggleSidebar() {
  if (mobileView.value) {
    mobileNavOpen.value = !mobileNavOpen.value;
    if (mobileNavOpen.value) nextTick(() => document.querySelector('#primary-sidebar a')?.focus());
    return;
  }
  sidebarCollapsed.value = !sidebarCollapsed.value;
  setStoredValue('ticket-sidebar-collapsed', String(sidebarCollapsed.value));
}

function closeMobileNav() {
  if (!mobileNavOpen.value) return;
  mobileNavOpen.value = false;
  document.querySelector('#sidebar-toggle')?.focus();
}

function updateViewport(event) {
  mobileView.value = event.matches;
  mobileNavOpen.value = false;
}

function onNavKey(event) {
  if (!mobileView.value || !mobileNavOpen.value) return;
  if (document.querySelector('[aria-modal="true"]')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeMobileNav(); }
  if (event.key !== 'Tab') return;
  const controls = [...document.querySelectorAll('#primary-sidebar a, #primary-sidebar button')]
    .filter((element) => !element.disabled && element.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first) return;
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}

onMounted(() => {
  auth.bootstrap();
  mediaQuery = window.matchMedia('(max-width: 980px)');
  mediaQuery.addEventListener('change', updateViewport);
  window.addEventListener('keydown', onNavKey);
});
onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', updateViewport);
  window.removeEventListener('keydown', onNavKey);
});

watch(() => route.fullPath, () => {
  mobileNavOpen.value = false;
  nextTick(() => mainRegion.value?.focus({ preventScroll: true }));
});
</script>

<template>
  <div
    v-if="showShell"
    class="app-shell app-shell-v7"
    :class="{ 'sidebar-collapsed': sidebarCollapsed && !mobileView }"
  >
    <a class="skip-content" href="#main-content">Bỏ qua menu, đến nội dung</a>
    <TopNav :nav-expanded="mobileView ? mobileNavOpen : !sidebarCollapsed" @toggle-sidebar="toggleSidebar" />
    <Sidebar
      :open="mobileNavOpen"
      :collapsed="sidebarCollapsed"
      :mobile="mobileView"
      @close="closeMobileNav"
      @toggle-collapse="toggleSidebar"
    />
    <main id="main-content" ref="mainRegion" class="main main-v7" tabindex="-1" :inert="mobileView && mobileNavOpen">
      <RouterView />
    </main>
  </div>

  <RouterView v-else />

  <Toasts />
  <CommandPalette v-if="showShell" />
</template>

<style scoped>
.skip-content { position: fixed; top: 8px; left: 12px; z-index: 10000; padding: 12px 18px; color: var(--on-surface, #fff); background: var(--surface-container, #202438); border: 2px solid var(--primary, #8796ff); border-radius: 8px; transform: translateY(-180%); }
.skip-content:focus { transform: translateY(0); }
main:focus { outline: none; }
</style>

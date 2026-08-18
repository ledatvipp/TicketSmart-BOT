import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../stores/auth';

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/auth-callback', component: () => import('../views/AuthCallbackView.vue'), meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { permission: 'analytics.view' } },
  { path: '/tickets', component: () => import('../views/TicketsView.vue'), meta: { permission: 'ticket.view' } },
  { path: '/tickets/:id', component: () => import('../views/TicketDetailView.vue'), meta: { permission: 'ticket.view' } },
  { path: '/options', component: () => import('../views/OptionsView.vue'), meta: { permission: 'ticket.view' } },
  { path: '/clusters', component: () => import('../views/ClustersView.vue'), meta: { requiresAdmin: true } },
  { path: '/staff', component: () => import('../views/StaffView.vue'), meta: { requiresAdmin: true } },
  { path: '/canned', component: () => import('../views/CannedView.vue'), meta: { permission: 'canned.view' } },
  { path: '/audit', component: () => import('../views/AuditView.vue'), meta: { permission: 'audit.view' } },
  { path: '/analytics', component: () => import('../views/AnalyticsView.vue'), meta: { permission: 'analytics.view' } },
  { path: '/faqs', component: () => import('../views/FaqsView.vue'), meta: { permission: 'faq.view' } },
  { path: '/knowledge', component: () => import('../views/KnowledgeView.vue'), meta: { permission: 'knowledge.view' } },
  { path: '/smartlearn', component: () => import('../views/SmartLearnView.vue'), meta: { permission: 'smartlearn.view' } },
  { path: '/intelligence', component: () => import('../views/IntelligenceView.vue'), meta: { permission: 'intelligence.view' } },
  { path: '/autotag', component: () => import('../views/AutoTagView.vue'), meta: { requiresAdmin: true } },
  { path: '/webhooks', component: () => import('../views/WebhooksView.vue'), meta: { requiresAdmin: true } },
  { path: '/config', component: () => import('../views/ConfigView.vue'), meta: { requiresAdmin: true } },
  { path: '/announcements', component: () => import('../views/AnnouncementsView.vue'), meta: { requiresAdmin: true } },
  { path: '/banner-generator', component: () => import('../views/BannerGeneratorView.vue'), meta: { requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({ history: createWebHistory(), routes });

function homeFor(auth) {
  if (auth.hasPermission('analytics.view')) return '/dashboard';
  if (auth.hasPermission('ticket.view')) return '/tickets';
  if (auth.hasPermission('knowledge.view')) return '/knowledge';
  return '/login';
}

router.beforeEach(async (to) => {
  const auth = useAuth();
  await auth.bootstrap();
  if (to.meta.public) {
    if (to.path === '/login' && auth.isAuthenticated) return homeFor(auth);
    return true;
  }
  if (!auth.isAuthenticated) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.requiresAdmin && !auth.isAdmin) return homeFor(auth);
  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) return homeFor(auth);
  return true;
});
export default router;

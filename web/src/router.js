import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from './api'
import { applySeo } from './seo'
import { loadRuntime, isAccountMode } from './runtime'

import LoginView from './views/LoginView.vue'
import DetectView from './views/DetectView.vue'
import ConfigsView from './views/ConfigsView.vue'
import ConfigFormView from './views/ConfigFormView.vue'
import HistoryView from './views/HistoryView.vue'
import HistoryDetailView from './views/HistoryDetailView.vue'
import ShareView from './views/ShareView.vue'
import HomeView from './views/HomeView.vue'

export const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { public: true, tab: null } },
  { path: '/s/:id', name: 'share', component: ShareView, meta: { public: true, tab: null } },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true, tab: null } },
  { path: '/detect', name: 'detect', component: DetectView, meta: { tab: '/detect' } },
  { path: '/configs', name: 'configs', component: ConfigsView, meta: { tab: '/configs' } },
  { path: '/configs/new', name: 'config-new', component: ConfigFormView, meta: { tab: '/configs' } },
  { path: '/configs/:id', name: 'config-edit', component: ConfigFormView, meta: { tab: '/configs' } },
  { path: '/history', name: 'history', component: HistoryView, meta: { tab: '/history' } },
  { path: '/history/:key', name: 'history-detail', component: HistoryDetailView, meta: { tab: '/history' } },
  { path: '/:pathMatch(.*)*', redirect: '/detect' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  await loadRuntime()
  if (!isAccountMode()) {
    return ['login', 'history', 'history-detail', 'share'].includes(to.name)
      ? { name: 'detect', replace: true } : true
  }
  if (!to.meta.public && !getToken()) {
    return { name: 'login', query: to.fullPath !== '/detect' ? { next: to.fullPath } : {} }
  }
  if (to.meta.public && getToken() && to.name === 'login') {
    return { name: 'detect' }
  }
  return true
})

// SPA 内部跳转不重载文档，需要在每次导航后同步 head 里的 TDK / OG
router.afterEach((to) => {
  applySeo(to.path)
})

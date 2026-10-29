<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, detectTask, logout, toast } from '../store'
import { theme, toggleTheme } from '../theme'
import { t, locale, toggleLocale } from '../i18n'
import { accountMode } from '../runtime'

const route = useRoute()
const router = useRouter()
const isLight = computed(() => theme.value === 'light')

// 标签用 i18n key，渲染时取词，切换语言即时更新
const tabs = computed(() => [
  { path: '/detect', key: 'nav.detect' },
  { path: '/configs', key: 'nav.configs' },
  { path: '/history', key: 'nav.history' },
].filter(tab => accountMode.value || tab.path !== '/history'))
const active = computed(() => route.meta.tab)
const initial = computed(() => (auth.user?.name || '?').slice(0, 1).toUpperCase())
const detecting = computed(() => detectTask.running)

function doLogout() {
  logout()
  toast(t('auth.logout'))
  router.replace({ name: 'login' })
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line/80 bg-ink-900/80 backdrop-blur-xl">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
      <RouterLink to="/" class="flex items-center gap-2.5 shrink-0" :title="t('nav.home')">
        <span class="relative grid size-8 place-items-center rounded-[10px] bg-ink-800 ring-1 ring-line">
          <span class="absolute size-5 rounded-full border border-signal/35"></span>
          <span class="size-2 rounded-full bg-signal shadow-[var(--signal-glow-shadow)]"></span>
        </span>
        <span class="hidden flex-col leading-none sm:flex">
          <span class="text-[13.5px] font-semibold tracking-tight">{{ t('common.appName') }}</span>
          <span class="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-mute">{{ t('common.brandSub') }}</span>
        </span>
      </RouterLink>

      <nav class="ml-2 hidden items-center gap-1 sm:flex">
        <RouterLink
          v-for="tab in tabs" :key="tab.path" :to="tab.path"
          class="rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors"
          :class="active === tab.path
            ? 'bg-signal/10 text-signal ring-1 ring-signal/25'
            : 'text-mute hover:bg-hover hover:text-chalk'"
        >{{ t(tab.key) }}</RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <!-- 检测运行指示 -->
        <div v-if="detecting" class="hidden items-center gap-2 rounded-lg border border-signal/25 bg-signal/8 px-2.5 py-1.5 sm:flex">
          <span class="pulse-dot size-1.5 rounded-full bg-signal text-signal"></span>
          <span class="font-mono text-[11px] text-signal">{{ detectTask.done }}/{{ detectTask.total }}</span>
        </div>

        <div v-if="accountMode" class="flex items-center gap-2 rounded-full border border-line bg-ink-800 py-1 pl-1 pr-2.5">
          <span class="grid size-6 place-items-center rounded-full bg-signal/12 text-[11px] font-bold text-signal">
            {{ initial }}
          </span>
          <span class="max-w-[92px] truncate text-[12.5px] text-chalk/90">{{ auth.user?.name }}</span>
        </div>

        <button
          class="btn btn-ghost btn-sm !px-2 font-mono text-[11px] font-semibold uppercase"
          :title="t('lang.switch')"
          :aria-label="t('lang.switch')"
          @click="toggleLocale"
        >{{ locale === 'zh' ? 'EN' : '中' }}</button>

        <button
          class="btn btn-ghost btn-sm !px-2"
          :title="isLight ? t('theme.toDark') : t('theme.toLight')"
          :aria-label="isLight ? t('theme.toDark') : t('theme.toLight')"
          :aria-pressed="isLight"
          @click="toggleTheme"
        >
          <svg v-if="isLight" viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M16.5 12.4A6.8 6.8 0 0 1 7.6 3.5a6.9 6.9 0 1 0 8.9 8.9Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 2.2v1.8M10 16v1.8M17.8 10H16M4 10H2.2M15.5 4.5l-1.3 1.3M5.8 14.2l-1.3 1.3M15.5 15.5l-1.3-1.3M5.8 5.8 4.5 4.5" stroke-linecap="round" />
          </svg>
        </button>

        <button v-if="accountMode" class="btn btn-ghost btn-sm !px-2" title="退出登录" aria-label="退出登录" @click="doLogout">
          <svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h6a1.5 1.5 0 0 0 1.5-1.5V14" stroke-linecap="round" />
            <path d="M8 10h9m0 0-2.5-2.5M17 10l-2.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

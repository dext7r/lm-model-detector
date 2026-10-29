<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '../i18n'

const route = useRoute()
const tabs = [
  { path: '/detect', key: 'nav.detectShort', icon: 'scan' },
  { path: '/configs', key: 'nav.configsShort', icon: 'sliders' },
  { path: '/history', key: 'nav.historyShort', icon: 'list' },
]
const active = computed(() => route.meta.tab)
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-ink-900/92 backdrop-blur-xl sm:hidden"
       style="padding-bottom: env(safe-area-inset-bottom)">
    <div class="flex items-stretch">
      <RouterLink
        v-for="tab in tabs" :key="tab.path" :to="tab.path"
        class="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors"
        :class="active === tab.path ? 'text-signal' : 'text-mute'"
      >
        <span class="grid size-8 place-items-center rounded-lg" :class="active === tab.path ? 'bg-signal/10' : ''">
          <svg v-if="tab.icon === 'scan'" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" stroke-linecap="round" />
            <path d="M3 12h18" stroke-linecap="round" opacity=".55" />
          </svg>
          <svg v-else-if="tab.icon === 'sliders'" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M4 7h9M17 7h3M4 17h4M12 17h8" stroke-linecap="round" />
            <circle cx="15" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M4 6h16M4 12h16M4 18h10" stroke-linecap="round" />
          </svg>
        </span>
        <span>{{ t(tab.key) }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

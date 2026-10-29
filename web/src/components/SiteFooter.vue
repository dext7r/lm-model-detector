<script setup>
import { computed } from 'vue'
import { t } from '../i18n'

// 公共页脚：所有页面共用，保证站点信息、RSS 入口、免责声明只有一处维护。
const year = computed(() => new Date().getFullYear())
</script>

<template>
  <footer class="border-t border-line-soft">
    <div class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <!-- 品牌 -->
        <div class="flex items-center gap-2.5">
          <div class="relative grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-ink-850">
            <span class="absolute size-5 rounded-full border border-signal/25"></span>
            <span class="size-1.5 rounded-full bg-signal"></span>
          </div>
          <div class="flex flex-col leading-none">
            <span class="text-[12.5px] font-medium text-chalk/90">{{ t('common.appName') }}</span>
            <span class="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-mute">{{ t('common.brandSub') }}</span>
          </div>
        </div>

        <!-- 链接 -->
        <nav class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-mute">
          <RouterLink to="/" class="transition-colors hover:text-chalk">{{ t('nav.home') }}</RouterLink>
          <RouterLink to="/detect" class="transition-colors hover:text-chalk">{{ t('nav.detect') }}</RouterLink>
          <RouterLink to="/history" class="transition-colors hover:text-chalk">{{ t('nav.history') }}</RouterLink>
          <RouterLink to="/configs" class="transition-colors hover:text-chalk">{{ t('nav.configs') }}</RouterLink>
          <a href="/rss.xml" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-chalk">{{ t('footer.rss') }}</a>
        </nav>
      </div>

      <div class="mt-6 flex flex-col gap-1.5 border-t border-line-soft pt-5 text-[11px] text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>{{ t('footer.copyright', { year }) }}</p>
        <p class="font-mono text-[10.5px] opacity-80">{{ t('footer.note') }}</p>
      </div>
    </div>
  </footer>
</template>

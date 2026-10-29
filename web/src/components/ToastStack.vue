<script setup>
import { toasts } from '../store'

const tone = {
  ok: 'border-signal/40 text-signal',
  warn: 'border-warn/40 text-warn',
  error: 'border-danger/40 text-danger',
  info: 'border-line text-chalk',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts" :key="t.id"
        class="flex max-w-[min(92vw,560px)] items-start gap-2.5 rounded-xl border bg-ink-800/95 px-3.5 py-2.5 text-[13px] shadow-[var(--pop-shadow)] backdrop-blur"
        :class="tone[t.type] || tone.info"
      >
        <span class="mt-[3px] size-1.5 shrink-0 rounded-full bg-current"></span>
        <span class="leading-relaxed text-chalk/95">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(8px) scale(.98); }
.toast-leave-to { opacity: 0; transform: translateY(-4px); }
</style>

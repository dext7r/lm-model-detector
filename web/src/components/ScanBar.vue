<script setup>
import { computed } from 'vue'
import { t } from '../i18n'

const props = defineProps({
  done: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  phase: { type: String, default: 'idle' }, // loading-data | running | done
})

const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
const label = computed(() => {
  if (props.phase === 'loading-data') return t('scan.loadingData')
  if (props.phase === 'running') return t('scan.running')
  return t('scan.done')
})
</script>

<template>
  <div class="rounded-xl border border-line bg-ink-850/70 p-3.5">
    <div class="mb-2 flex items-end justify-between gap-3">
      <div class="flex items-center gap-2">
        <span
          class="size-1.5 rounded-full"
          :class="phase === 'running' ? 'pulse-dot bg-signal text-signal' : phase === 'done' ? 'bg-signal' : 'bg-warn'"
        ></span>
        <span class="text-[12.5px] text-chalk/85">{{ label }}</span>
        <span class="font-mono text-[11px] text-mute">{{ done }}/{{ total }}</span>
      </div>
      <span class="font-mono text-[18px] font-bold tabular-nums" :class="phase === 'done' ? 'text-signal' : 'text-chalk'">
        {{ pct }}<span class="text-[11px] text-mute">%</span>
      </span>
    </div>
    <div class="relative h-1.5 overflow-hidden rounded-full bg-ink-700">
      <div
        class="h-full rounded-full bg-gradient-to-r from-signal-dim via-signal to-sky transition-[width] duration-500"
        :style="{ width: pct + '%' }"
      ></div>
      <div v-if="phase !== 'done'" class="absolute inset-0 overflow-hidden">
        <div class="h-full w-1/3 animate-[scan_1.9s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
      </div>
    </div>
  </div>
</template>

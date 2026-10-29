<script setup>
import { computed } from 'vue'
import { t } from '../i18n'

const props = defineProps({
  decision: { type: String, default: null },
  error: { type: String, default: null },
  probability: { type: Number, default: null },
})

const badge = computed(() => {
  const d = props.decision
  if (d === 'scored') return { text: t('status.scored'), cls: 'border-signal/40 bg-signal/12 text-signal' }
  if (d === 'partial') return { text: t('status.partial'), cls: 'border-warn/40 bg-warn/12 text-warn' }
  if (d === 'not_model') return { text: t('status.notModel'), cls: 'border-warn/40 bg-warn/10 text-warn' }
  if (d === 'unscorable') return { text: t('status.unscorable'), cls: 'border-danger/40 bg-danger/10 text-danger' }
  if (props.error) return { text: t('status.failed'), cls: 'border-danger/40 bg-danger/10 text-danger' }
  return { text: t('status.none'), cls: 'border-line bg-hover text-mute' }
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-md border px-2 py-[3px] text-[11.5px] font-semibold" :class="badge.cls">
    <span class="size-1.5 rounded-full bg-current"></span>
    {{ badge.text }}
    <span v-if="decision === 'scored' && probability != null" class="font-mono font-bold">
      {{ (probability * 100).toFixed(1) }}%
    </span>
  </span>
</template>

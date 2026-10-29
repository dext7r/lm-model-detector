<script setup>
import { computed } from 'vue'
import { t, locale } from '../i18n'

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, default: 0 },
  pageSize: { type: Number, default: 20 },
})
const emit = defineEmits(['change'])

const pages = computed(() => {
  const out = new Set([1, props.totalPages])
  for (let i = props.page - 1; i <= props.page + 1; i++) {
    if (i > 1 && i < props.totalPages) out.add(i)
  }
  return [...out].sort((a, b) => a - b)
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 pt-4">
    <span class="mr-auto font-mono text-[11.5px] text-mute">
      {{ t('history.total', { n: total }) }} · {{ t('history.page', { page, total: totalPages }) }} · {{ t('history.perPage', { n: pageSize }) }}
    </span>
    <template v-if="totalPages > 1">
      <button class="btn btn-sm" :disabled="page <= 1" @click="emit('change', page - 1)">{{ locale === 'zh' ? '上一页' : 'Prev' }}</button>
      <template v-for="(p, i) in pages" :key="p">
        <span v-if="i > 0 && p - pages[i - 1] > 1" class="px-1 text-mute">…</span>
        <button
          class="btn btn-sm min-w-9 font-mono"
          :class="p === page ? '!border-signal/50 !bg-signal/12 !text-signal !font-bold' : ''"
          @click="emit('change', p)"
        >{{ p }}</button>
      </template>
      <button class="btn btn-sm" :disabled="page >= totalPages" @click="emit('change', page + 1)">{{ locale === 'zh' ? '下一页' : 'Next' }}</button>
    </template>
  </div>
</template>

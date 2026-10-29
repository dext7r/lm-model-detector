<script setup>
import { t } from '../i18n'
defineProps({
  title: { type: String, default: () => t('common.notFound') },
  desc: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div class="relative mb-4 grid size-12 place-items-center rounded-xl border border-line bg-ink-800">
      <span class="absolute size-7 rounded-full border border-signal/20"></span>
      <span class="size-1.5 rounded-full bg-signal/60"></span>
    </div>
    <div class="text-[14px] font-medium text-chalk/90">{{ title }}</div>
    <div v-if="desc" class="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-mute">{{ desc }}</div>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>

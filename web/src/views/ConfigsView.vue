<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loadConfigs, configCache, del, toast } from '../store'
import EmptyState from '../components/EmptyState.vue'
import { t } from '../i18n'

const router = useRouter()
const configs = computed(() => configCache.list || [])
const loading = ref(true)

function maskKey(k) {
  if (!k) return ''
  return k.length <= 10 ? k.slice(0, 2) + '••••' : k.slice(0, 6) + '••••' + k.slice(-4)
}
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function remove(c) {
  if (!confirm(`确定删除配置「${c.name}」？已产生的检测历史会保留。`)) return
  try {
    await del('/api/configs/' + encodeURIComponent(c.id))
    configCache.list = null
    await loadConfigs(true)
    toast(t('configs.deleted'), 'ok')
  } catch (e) {
    toast(e.message, 'error')
  }
}

onMounted(async () => {
  try { await loadConfigs(true) } finally { loading.value = false }
})
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-signal"></span>
          <h1 class="text-[19px] font-semibold tracking-tight">{{ t('configs.heading') }}</h1>
        </div>
        <p class="mt-1 text-[12.5px] text-mute">{{ t('configs.desc', { n: configs.length }) }}</p>
      </div>
      <div class="ml-auto">
        <RouterLink to="/configs/new" class="btn btn-primary btn-sm">{{ t('configs.add') }}</RouterLink>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="panel h-24 animate-pulse"></div>
    </div>

    <div v-else-if="configs.length" class="space-y-3">
      <article v-for="c in configs" :key="c.id" class="panel panel-hover p-4 transition-colors">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="size-1.5 rounded-full bg-signal/70"></span>
              <h2 class="truncate text-[14.5px] font-semibold">{{ c.name }}</h2>
            </div>
            <div class="mt-1.5 truncate font-mono text-[11.5px] text-mute" :title="c.baseUrl">{{ c.baseUrl }}</div>
            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <span class="chip font-mono">🔑 {{ maskKey(c.apiKey) }}</span>
              <span class="chip">{{ t('configs.createdAt', { time: fmtDate(c.createdAt) }) }}</span>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <RouterLink :to="`/detect?config=${encodeURIComponent(c.id)}`" class="btn btn-sm">{{ t('configs.goDetect') }}</RouterLink>
            <RouterLink :to="`/configs/${encodeURIComponent(c.id)}`" class="btn btn-sm">{{ t('common.edit') }}</RouterLink>
            <button class="btn btn-sm btn-danger" @click="remove(c)">{{ t('common.delete') }}</button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="panel">
      <EmptyState :title="t('configs.empty')" :desc="t('configs.emptyDesc')">
        <RouterLink to="/configs/new" class="btn btn-primary btn-sm">{{ t('configs.addConfig') }}</RouterLink>
      </EmptyState>
    </div>
  </div>
</template>

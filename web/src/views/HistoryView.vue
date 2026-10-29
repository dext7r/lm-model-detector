<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, buildQuery, getToken } from '../api'
import { t } from '../i18n'
import { loadConfigs, configCache, deleteHistory, detectTask, toast } from '../store'
import Pager from '../components/Pager.vue'
import EmptyState from '../components/EmptyState.vue'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()

const data = ref({ items: [], total: 0, totalPages: 1, page: 1, pageSize: 20 })
const loading = ref(true)
const deleting = ref('')
const searchInput = ref(route.query.q || '')
const configs = computed(() => configCache.list || [])

const page = computed(() => Math.max(1, parseInt(route.query.page || '1', 10) || 1))
const pageSize = computed(() => ([10, 20, 50, 100].includes(parseInt(route.query.size, 10)) ? parseInt(route.query.size, 10) : 20))
const activeConfig = computed(() => route.query.config || '')
const query = computed(() => route.query.q || '')
const hasFilter = computed(() => !!(query.value || activeConfig.value))

function patchQuery(patch) {
  const q = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') delete q[k]
    else q[k] = v
  }
  router.replace({ name: 'history', query: q })
}

async function load() {
  loading.value = true
  try {
    data.value = await api('/api/history' + buildQuery({
      page: page.value, pageSize: pageSize.value, q: query.value, configId: activeConfig.value,
    }))
    if (page.value > data.value.totalPages) patchQuery({ page: data.value.totalPages > 1 ? data.value.totalPages : undefined })
  } catch (e) {
    toast(e.message, 'error')
    data.value = { items: [], total: 0, totalPages: 1, page: 1, pageSize: pageSize.value }
  } finally {
    loading.value = false
  }
}

let timer
watch(searchInput, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => patchQuery({ q: v.trim() || undefined, page: undefined }), 380)
})
watch(() => [route.query.page, route.query.size, route.query.q, route.query.config], load)

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function removeItem(item) {
  if (deleting.value || loading.value || detectTask.running) return
  if (!confirm(t('history.deleteConfirm'))) return
  deleting.value = item.key || item.id
  try {
    await deleteHistory(item.key || item.id)
    toast(t('history.deleted'), 'ok')
    await load()
  } catch (e) { toast(e.message, 'error') }
  finally { deleting.value = '' }
}

async function clearAll() {
  if (deleting.value || loading.value || detectTask.running) return
  if (!confirm(t('history.clearConfirm'))) return
  deleting.value = 'all'
  try {
    await deleteHistory()
    toast(t('history.cleared'), 'ok')
    await load()
  } catch (e) { toast(e.message, 'error') }
  finally { deleting.value = '' }
}

async function exportJson() {
  try {
    const res = await fetch('/api/history/export', { headers: { Authorization: 'Bearer ' + getToken() } })
    if (!res.ok) throw new Error(t('history.exportFailed'))
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lmfpd-history-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    toast(t('history.exportStarted'), 'ok')
  } catch (e) { toast(e.message, 'error') }
}

onMounted(async () => {
  await loadConfigs()
  await load()
})
</script>

<template>
  <div>
    <p v-if="detectTask.running" role="status" class="mb-4 text-[12.5px] text-warn">{{ t('account.stopHint') }}</p>
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-signal"></span>
          <h1 class="text-[19px] font-semibold tracking-tight">{{ t('history.heading') }}</h1>
        </div>
        <p class="mt-1 text-[12.5px] text-mute">
          {{ t('history.total', { n: data.total }) }} · {{ t('history.desc') }}
        </p>
      </div>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-sm" @click="exportJson">{{ t('history.export') }}</button>
        <button class="btn btn-sm btn-danger" :disabled="Boolean(deleting) || loading || detectTask.running" @click="clearAll">{{ t('history.clear') }}</button>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="panel mb-4 flex flex-wrap items-center gap-2 p-3">
      <div class="relative min-w-[160px] flex-1">
        <svg viewBox="0 0 20 20" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" fill="none" stroke="currentColor" stroke-width="1.7">
          <circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" stroke-linecap="round" />
        </svg>
        <input v-model="searchInput" class="field !min-h-9 pl-9 text-[13px]" :placeholder="t('history.search')" />
      </div>
      <select
        class="field !min-h-9 max-w-[190px] text-[13px]"
        :value="activeConfig"
        @change="patchQuery({ config: $event.target.value || undefined, page: undefined })"
      >
        <option value="">{{ t('history.allConfigs') }}</option>
        <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select
        class="field !min-h-9 max-w-[120px] text-[13px]"
        :value="String(pageSize)"
        @change="patchQuery({ size: $event.target.value === '20' ? undefined : $event.target.value, page: undefined })"
      >
        <option v-for="n in [10, 20, 50, 100]" :key="n" :value="n">{{ t('history.perPage', { n }) }}</option>
      </select>
      <button v-if="hasFilter" class="btn btn-sm btn-ghost" @click="router.replace({ name: 'history' })">{{ t('history.clearFilter') }}</button>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="panel space-y-3 p-4">
      <div v-for="i in 5" :key="i" class="h-10 animate-pulse rounded-md bg-ink-750/70"></div>
    </div>

    <!-- 空态 -->
    <div v-else-if="!data.items.length" class="panel">
      <EmptyState
        :title="hasFilter ? t('history.emptyFiltered') : t('history.empty')"
        :desc="hasFilter ? t('history.emptyFilteredDesc') : t('history.emptyDesc')"
      >
        <button v-if="hasFilter" class="btn btn-sm" @click="router.replace({ name: 'history' })">{{ t('history.clearFilter') }}</button>
        <RouterLink v-else to="/detect" class="btn btn-primary btn-sm">{{ t('history.goDetect') }}</RouterLink>
      </EmptyState>
    </div>

    <template v-else>
      <!-- 桌面表格 -->
      <div class="panel hidden overflow-hidden sm:block">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="border-b border-line text-left">
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colTime') }}</th>
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colModel') }}</th>
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colPredicted') }}</th>
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colConfidence') }}</th>
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colStatus') }}</th>
              <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{{ t('history.colConfig') }}</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in data.items" :key="h.key || h.id"
              class="group cursor-pointer border-b border-line-soft/70 transition-colors last:border-0 hover:bg-hover-soft"
              @click="router.push(`/history/${encodeURIComponent(h.key || h.id)}`)"
            >
              <td class="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] text-mute">{{ fmtTime(h.time) }}</td>
              <td class="max-w-[220px] px-4 py-3">
                <div class="truncate font-mono text-[12.5px]">{{ h.model }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="text-[13px] font-medium">{{ h.prediction_name || h.prediction || '—' }}</div>
                <div v-if="h.family_prediction_name" class="mt-0.5 text-[11px] text-mute">{{ h.family_prediction_name }}</div>
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span v-if="h.probability != null" class="font-mono text-[12.5px] text-signal">{{ (h.probability * 100).toFixed(1) }}%</span>
                <span v-else class="text-mute">—</span>
              </td>
              <td class="px-4 py-3">
                <StatusBadge :decision="h.decision" :error="h.error" />
              </td>
              <td class="max-w-[140px] px-4 py-3">
                <span class="truncate text-[12px] text-mute">{{ h.configName || '—' }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <button class="btn btn-ghost btn-sm" :disabled="Boolean(deleting) || detectTask.running" @click.stop="removeItem(h)">{{ t('common.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 移动卡片 -->
      <div class="space-y-2.5 sm:hidden">
        <article
          v-for="h in data.items" :key="h.key || h.id"
          class="panel p-3.5"
          @click="router.push(`/history/${encodeURIComponent(h.key || h.id)}`)"
        >
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <div class="truncate font-mono text-[12.5px] text-chalk/90">{{ h.model }}</div>
              <div class="mt-1 flex items-center gap-1.5 text-[12px]">
                <span class="text-mute">→</span>
                <span class="truncate font-medium">{{ h.prediction_name || h.prediction || '—' }}</span>
              </div>
            </div>
            <StatusBadge :decision="h.decision" :error="h.error" />
          </div>
          <div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-mute">
            <span>{{ fmtTime(h.time) }}</span>
            <span v-if="h.probability != null" class="text-signal">{{ (h.probability * 100).toFixed(1) }}%</span>
            <span class="truncate">{{ h.configName }}</span>
            <button class="btn btn-danger btn-sm ml-auto" :disabled="Boolean(deleting) || detectTask.running" @click.stop="removeItem(h)">{{ t('common.delete') }}</button>
          </div>
        </article>
      </div>

      <Pager
        :page="data.page" :total-pages="data.totalPages" :total="data.total" :page-size="data.pageSize"
        @change="(p) => { patchQuery({ page: p > 1 ? p : undefined }); window.scrollTo({ top: 0, behavior: 'smooth' }) }"
      />
    </template>
  </div>
</template>

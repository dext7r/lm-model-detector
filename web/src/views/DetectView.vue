<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  configCache, loadConfigs, modelState, resetModels, fetchModels,
  detectTask, runBatch, stopBatch, toast,
  normalizeConcurrency, CONCURRENCY_DEFAULT, CONCURRENCY_MAX,
} from '../store'
import StatusBadge from '../components/StatusBadge.vue'
import ScanBar from '../components/ScanBar.vue'
import EmptyState from '../components/EmptyState.vue'
import { fuzzyFilter } from '../fuzzy'
import { t } from '../i18n'

const route = useRoute()
const router = useRouter()

const configs = computed(() => configCache.list || [])
const apiProto = computed({
  get: () => (['chat_completions', 'responses', 'messages'].includes(route.query.api) ? route.query.api : 'chat_completions'),
  set: (v) => patchQuery({ api: v === 'chat_completions' ? undefined : v }),
})
const effort = computed({
  get: () => route.query.effort || '',
  set: (v) => patchQuery({ effort: v || undefined }),
})
const strict = computed({
  get: () => route.query.strict === '1',
  set: (v) => patchQuery({ strict: v ? '1' : undefined }),
})
// 并发度：放在 URL 里，刷新或分享链接后仍保持用户选择
const concurrency = computed({
  get: () => normalizeConcurrency(route.query.conc),
  set: (v) => patchQuery({ conc: normalizeConcurrency(v) === CONCURRENCY_DEFAULT ? undefined : normalizeConcurrency(v) }),
})

const activeConfigId = computed(() => route.query.config || '')
const activeConfig = computed(() => configs.value.find(c => c.id === activeConfigId.value) || null)

const filterInput = ref(route.query.q || '')
const shownModels = computed(() => fuzzyFilter(modelState.list, filterInput.value))
const selectedCount = computed(() => modelState.selected.length)
const running = computed(() => detectTask.running)

function patchQuery(patch, { replace = true } = {}) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') delete query[k]
    else query[k] = v
  }
  const nav = { name: route.name, params: route.params, query }
  replace ? router.replace(nav) : router.push(nav)
}

function selectConfig(id) {
  if (id === activeConfigId.value) return
  resetModels(id)
  patchQuery({ config: id, models: undefined })
}

let filterTimer
watch(filterInput, (v) => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => patchQuery({ q: v.trim() || undefined }), 300)
})
watch(() => route.query.q, (v) => { if ((v || '') !== filterInput.value) filterInput.value = v || '' })

// URL 中的 models 参数（可直接分享「已勾选」状态）
function adoptModelsFromUrl() {
  const raw = route.query.models
  if (!raw || modelState.list.length) return
  const list = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  modelState.selected = [...new Set([...modelState.selected, ...list])]
}
function syncModelsToUrl() {
  patchQuery({ models: modelState.selected.length ? modelState.selected.join(',') : undefined })
}

function toggleModel(m) {
  const i = modelState.selected.indexOf(m)
  if (i >= 0) modelState.selected.splice(i, 1)
  else modelState.selected.push(m)
  syncModelsToUrl()
}
function bulkSelect(mode) {
  const names = shownModels.value
  if (mode === 'all') {
    for (const m of names) if (!modelState.selected.includes(m)) modelState.selected.push(m)
  } else if (mode === 'none') {
    modelState.selected = []
  } else {
    for (const m of names) {
      const i = modelState.selected.indexOf(m)
      if (i >= 0) modelState.selected.splice(i, 1)
      else modelState.selected.push(m)
    }
  }
  syncModelsToUrl()
}

const fetching = ref(false)
async function doFetchModels() {
  if (!activeConfig.value) return toast(t('detect.needConfig'), 'warn')
  fetching.value = true
  try {
    const res = await fetchModels(activeConfig.value)
    adoptModelsFromUrl()
    toast(t('detect.fetched', { n: res.models.length }), 'ok')
  } catch (e) {
    toast(t('detect.fetchFailed', { msg: e.message }), 'error', 5200)
  } finally {
    fetching.value = false
  }
}

async function start() {
  await runBatch({
    config: activeConfig.value,
    models: [...modelState.selected],
    apiProto: apiProto.value,
    effort: effort.value,
    strict: strict.value,
    concurrency: concurrency.value,
  })
}
function stop() {
  stopBatch()
  toast(t('detect.stopped'), 'warn')
}

const scoredCount = computed(() => detectTask.rows.filter(r => r.record?.decision === 'scored').length)
const failedCount = computed(() => detectTask.rows.filter(r => r.err || (r.record?.error && r.record?.decision !== 'not_model')).length)

function matchTag(rec) {
  if (!rec?.prediction || rec.decision === 'not_model') return null
  const req = (rec.model || '').toLowerCase().split(/[@:/]/)[0]
  const pred = (rec.prediction || '').toLowerCase()
  const fam = (rec.family_prediction || '').toLowerCase()
  const ok = pred.includes(req) || req.includes(pred.split(/[-_.]/)[0]) || (fam && (req.includes(fam) || fam.includes(req.split(/[-]/)[0])))
  return ok
    ? { text: t('detect.match'), cls: 'text-signal border-signal/35 bg-signal/10' }
    : { text: t('detect.needCheck'), cls: 'text-warn border-warn/35 bg-warn/10' }
}

onMounted(async () => {
  await loadConfigs()
  if (!activeConfigId.value && configs.value.length === 1) {
    selectConfig(configs.value[0].id)
  }
  if (activeConfigId.value && modelState.configId !== activeConfigId.value) {
    resetModels(activeConfigId.value)
  }
  adoptModelsFromUrl()
})
</script>

<template>
  <div>
    <!-- 页头 -->
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-signal pulse-dot text-signal"></span>
          <h1 class="text-[19px] font-semibold tracking-tight">{{ t('detect.heading') }}</h1>
        </div>
        <p class="mt-1 text-[12.5px] text-mute">{{ t('detect.desc') }}</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <RouterLink to="/history" class="btn btn-sm">{{ t('detect.viewHistory') }}</RouterLink>
      </div>
    </div>

    <div class="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <!-- 左列：大屏下限制在视口内独立滚动，配置再多也不撑高页面 -->
      <div class="scroll-area space-y-4 lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        <section class="panel p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="label-xs">{{ t('detect.step1') }}</h2>
            <RouterLink to="/configs/new?return=/detect" class="text-[12px] text-signal hover:underline">{{ t('detect.add') }}</RouterLink>
          </div>

          <!-- 配置多时内部滚动，避免把整页撑长 -->
          <div v-if="configs.length" class="scroll-area max-h-[min(38vh,300px)] space-y-2 overflow-y-auto overscroll-contain pr-1">
            <button
              v-for="c in configs" :key="c.id"
              class="card-row w-full p-3 text-left"
              :class="c.id === activeConfigId ? '!border-signal/50 !bg-signal/8' : ''"
              @click="selectConfig(c.id)"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="c.id === activeConfigId ? 'bg-signal shadow-[var(--signal-glow-shadow)]' : 'bg-line'"
                ></span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13.5px] font-medium">{{ c.name }}</div>
                  <div class="mt-0.5 truncate font-mono text-[11px] text-mute" :title="c.baseUrl">{{ c.baseUrl }}</div>
                </div>
              </div>
            </button>
          </div>
          <EmptyState v-else :title="t('detect.noConfig')" :desc="t('detect.noConfigDesc')">
            <RouterLink to="/configs/new?return=/detect" class="btn btn-primary btn-sm">{{ t('detect.addConfig') }}</RouterLink>
          </EmptyState>
        </section>

        <section class="panel p-4">
          <h2 class="label-xs mb-3">{{ t('detect.step2') }}</h2>

          <label class="label-xs mb-1.5 block">{{ t('detect.apiProto') }}</label>
          <select v-model="apiProto" class="field">
            <option value="chat_completions">{{ t('detect.api.chat') }}</option>
            <option value="responses">{{ t('detect.api.responses') }}</option>
            <option value="messages">{{ t('detect.api.messages') }}</option>
          </select>

          <label class="label-xs mb-1.5 mt-3.5 block">{{ t('detect.effort') }}</label>
          <select v-model="effort" class="field">
            <option value="">{{ t('detect.effortNone') }}</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>

          <label class="mt-4 flex cursor-pointer items-start gap-2.5">
            <input v-model="strict" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]" />
            <span class="text-[12.5px] leading-snug text-chalk/85">
              {{ t('detect.strict') }}
              <span class="mt-0.5 block text-[11.5px] text-mute">{{ t('detect.strictDesc') }}</span>
            </span>
          </label>

          <label class="label-xs mb-1.5 mt-3.5 block">{{ t('detect.concurrency') }}</label>
          <div class="flex items-center gap-2">
            <input
              :value="concurrency"
              type="number" min="1" :max="CONCURRENCY_MAX" step="1"
              class="field !w-20 !min-h-9 !py-1.5 font-mono text-[13px]"
              @change="concurrency = $event.target.value"
            />
            <span class="text-[11.5px] leading-snug text-mute">
              {{ t('detect.concurrencyHint', { n: concurrency, max: CONCURRENCY_MAX }) }}
            </span>
          </div>

          <p class="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-mute">
            {{ t('detect.footNote') }}
          </p>
        </section>
      </div>

      <!-- 右列：同样限制在视口内，结果再多也不撑高页面 -->
      <div class="scroll-area space-y-4 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        <section class="panel overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
            <h2 class="label-xs">{{ t('detect.step3') }}</h2>
            <span v-if="modelState.list.length" class="chip">{{ modelState.list.length }}</span>
            <div class="ml-auto flex gap-2">
              <button class="btn btn-sm btn-primary" :disabled="!activeConfig || fetching" @click="doFetchModels">
                <span v-if="fetching" class="size-3 animate-spin rounded-full border-2 border-on-signal/40 border-t-on-signal"></span>
                {{ fetching ? t('detect.fetching') : t('detect.fetch') }}
              </button>
            </div>
          </div>

          <div v-if="modelState.list.length" class="flex flex-wrap items-center gap-2 border-b border-line-soft bg-ink-850/40 px-4 py-2.5">
            <input v-model="filterInput" class="field !min-h-8 max-w-[220px] !py-1.5 text-[12.5px]" :placeholder="t('detect.filter')" />
            <button class="btn btn-sm" @click="bulkSelect('all')">{{ t('detect.selectAll') }}</button>
            <button class="btn btn-sm" @click="bulkSelect('none')">{{ t('detect.clear') }}</button>
            <button class="btn btn-sm" @click="bulkSelect('inv')">{{ t('detect.invert') }}</button>
            <span class="ml-auto font-mono text-[11.5px] text-mute">{{ shownModels.length }} / {{ modelState.list.length }}</span>
          </div>

          <div v-if="modelState.loading" class="space-y-2 p-4">
            <div v-for="i in 4" :key="i" class="h-8 animate-pulse rounded-md bg-ink-750"></div>
          </div>

          <div v-else-if="modelState.list.length" class="scroll-area max-h-[min(52vh,420px)] overflow-y-auto overscroll-contain">
            <label
              v-for="m in shownModels" :key="m"
              class="flex cursor-pointer items-center gap-3 border-b border-line-soft/70 px-4 py-2.5 last:border-0 transition-colors hover:bg-hover-soft"
              :class="modelState.selected.includes(m) ? 'bg-signal/[.045]' : ''"
            >
              <span
                class="grid size-4 shrink-0 place-items-center rounded border transition-colors"
                :class="modelState.selected.includes(m) ? 'border-signal bg-signal text-on-signal' : 'border-line hover:border-line-strong'"
              >
                <svg v-if="modelState.selected.includes(m)" viewBox="0 0 12 12" class="size-3" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <input type="checkbox" class="sr-only" :checked="modelState.selected.includes(m)" @change="toggleModel(m)" />
              <span class="truncate font-mono text-[12.5px]">{{ m }}</span>
            </label>
          </div>

          <EmptyState v-else :title="t('detect.noModels')" :desc="t('detect.noModelsDesc')" />

          <div class="flex flex-wrap items-center gap-2 border-t border-line-soft p-4">
            <span class="text-[12.5px] text-mute">
              {{ t('detect.selected', { n: selectedCount }) }}
            </span>
            <div class="ml-auto flex gap-2">
              <button v-if="running" class="btn btn-sm btn-danger" @click="stop">{{ t('detect.stop') }}</button>
              <button class="btn btn-primary btn-sm" :disabled="running || !selectedCount || !activeConfig" @click="start">
                {{ running ? t('detect.running') : t('detect.start') }}
              </button>
            </div>
          </div>
        </section>

        <ScanBar
          v-if="detectTask.phase !== 'idle'"
          :done="detectTask.done"
          :total="detectTask.total"
          :phase="detectTask.phase"
        />

        <!-- 结果 -->
        <section class="panel overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
            <h2 class="label-xs">{{ t('detect.results') }}</h2>
            <template v-if="detectTask.rows.length">
              <span class="chip">{{ t('detect.modelsCount', { n: detectTask.rows.length }) }}</span>
              <span v-if="scoredCount" class="chip !border-signal/30 !text-signal">{{ t('detect.scoredCount', { n: scoredCount }) }}</span>
              <span v-if="failedCount" class="chip !border-danger/30 !text-danger">{{ t('detect.failedCount', { n: failedCount }) }}</span>
            </template>
          </div>

          <div v-if="!detectTask.rows.length">
            <EmptyState :title="t('detect.noResults')" :desc="t('detect.noResultsDesc')" />
          </div>

          <div v-else class="scroll-area max-h-[min(64vh,640px)] divide-y divide-line-soft overflow-y-auto overscroll-contain">
            <article
              v-for="row in detectTask.rows" :key="row.model"
              class="relative px-4 py-3.5 transition-colors hover:bg-hover-soft"
            >
              <span
                class="absolute inset-y-0 left-0 w-[2px]"
                :class="row.status === 'running' ? 'bg-sky'
                  : row.record?.decision === 'scored' ? 'bg-signal'
                  : row.record?.decision === 'not_model' ? 'bg-warn'
                  : row.status === 'fail' ? 'bg-danger' : 'bg-transparent'"
              ></span>

              <div class="flex flex-wrap items-center gap-2">
                <span class="min-w-0 truncate font-mono text-[13px] font-medium">{{ row.model }}</span>
                <div class="ml-auto flex items-center gap-2">
                  <span v-if="row.status === 'running'" class="inline-flex items-center gap-1.5 rounded-md border border-sky/40 bg-sky/10 px-2 py-[3px] text-[11.5px] font-semibold text-sky">
                    <span class="pulse-dot size-1.5 rounded-full bg-sky text-sky"></span>{{ t('detect.detecting') }}
                    <span class="font-mono opacity-70">{{ row.samplesDone || 0 }}/3</span>
                  </span>
                  <span v-else-if="row.status === 'pending'" class="chip !text-[11.5px]">{{ t('detect.waiting') }}</span>
                  <StatusBadge
                    v-else-if="row.record"
                    :decision="row.record.decision" :error="row.record.error" :probability="row.record.probability"
                  />
                  <span v-else class="inline-flex rounded-md border border-danger/40 bg-danger/10 px-2 py-[3px] text-[11.5px] font-semibold text-danger">{{ t('detect.requestFailed') }}</span>

                  <RouterLink
                    v-if="row.record?.key" :to="`/history/${encodeURIComponent(row.record.key)}`"
                    class="btn btn-ghost btn-sm !min-h-7 !px-2 text-[12px]"
                  >{{ t('common.details') }}</RouterLink>
                </div>
              </div>

              <div v-if="row.err" class="mt-2 rounded-lg border border-danger/25 bg-danger/6 px-2.5 py-1.5 text-[12px] text-danger/90">
                {{ row.err }}
              </div>

              <div v-else-if="row.record" class="mt-2 space-y-1.5">
                <template v-if="row.record.decision === 'not_model'">
                  <p class="text-[12px] text-mute">{{ t('detect.notModelText') }}</p>
                </template>
                <template v-else-if="row.record.prediction">
                  <div class="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span class="text-mute">{{ t('detect.predict') }}</span>
                    <span class="font-medium text-chalk">{{ row.record.prediction_name || row.record.prediction }}</span>
                    <span v-if="row.record.family_prediction_name" class="chip !text-[11px]">{{ row.record.family_prediction_name }}</span>
                    <span
                      v-if="matchTag(row.record)"
                      class="rounded-md border px-1.5 py-[1px] text-[11px] font-medium"
                      :class="matchTag(row.record).cls"
                    >{{ matchTag(row.record).text }}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] text-mute">
                    <span>score {{ row.record.ranking_score != null ? row.record.ranking_score.toFixed(3) : '—' }}</span>
                    <span>{{ t('detect.samples') }} {{ row.record.used_outputs ?? '—' }}/3</span>
                  </div>
                  <div v-if="row.record.top?.length" class="flex flex-wrap gap-1.5 pt-0.5">
                    <span
                      v-for="(t, i) in row.record.top" :key="t.model"
                      class="rounded-md border border-line bg-ink-850 px-1.5 py-0.5 font-mono text-[11px] text-chalk/70"
                    >
                      <span class="text-mute">{{ i + 1 }}.</span> {{ t.display_name || t.model }}
                      <span class="text-signal/80">{{ t.score != null ? t.score.toFixed(3) : '—' }}</span>
                    </span>
                  </div>
                </template>
                <p v-else-if="row.record.error" class="text-[12px] text-warn/90">{{ row.record.error }}</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

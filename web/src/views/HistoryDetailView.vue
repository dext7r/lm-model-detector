<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, del } from '../api'
import { t } from '../i18n'
import { toast } from '../store'
import StatusBadge from '../components/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const rec = ref(null)
const loading = ref(true)
const err = ref('')
const sharing = ref(false)
const shareResult = ref(null)

const rawKey = computed(() => {
  const k = route.params.key
  try { return decodeURIComponent(String(k)) } catch { return String(k) }
})

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const DECISION_KEY = {
  scored: 'status.scored',
  partial: 'status.partial',
  unscorable: 'status.unscorable',
  not_model: 'status.notModel',
}
const STATE_KEY = {
  ok: 'sample.ok',
  complete: 'sample.complete',
  truncated: 'sample.truncated',
  parse_mismatch: 'sample.parse_mismatch',
  no_numbers: 'sample.no_numbers',
  empty: 'sample.empty',
  error: 'sample.error',
  cancelled: 'sample.cancelled',
  failed: 'sample.failed',
}

const decisionText = computed(() => (DECISION_KEY[rec.value?.decision] ? t(DECISION_KEY[rec.value?.decision]) : (rec.value?.decision || '—')))
const decisionCode = computed(() => (rec.value?.decision ? rec.value.decision : ''))

function stateText(s) {
  return STATE_KEY[s] ? t(STATE_KEY[s]) : (s || '—')
}
function stateClass(s) {
  if (['ok', 'complete'].includes(s)) return 'border-signal/35 bg-signal/10 text-signal'
  if (s === 'truncated') return 'border-sky/35 bg-sky/10 text-sky'
  return 'border-danger/35 bg-danger/10 text-danger'
}

const matchTag = computed(() => {
  const r = rec.value
  if (!r?.prediction || r.decision === 'not_model') return null
  const req = (r.model || '').toLowerCase().split(/[@:/]/)[0]
  const pred = (r.prediction || '').toLowerCase()
  const fam = (r.family_prediction || '').toLowerCase()
  const ok = pred.includes(req) || req.includes(pred.split(/[-_.]/)[0]) || (fam && (req.includes(fam) || fam.includes(req.split(/[-]/)[0])))
  return ok
    ? { text: t('detail.matchOk'), cls: 'border-signal/40 bg-signal/10 text-signal' }
    : { text: t('detail.matchBad'), cls: 'border-warn/40 bg-warn/10 text-warn' }
})

const retestLink = computed(() => {
  const r = rec.value
  if (!r) return '/detect'
  const q = new URLSearchParams()
  if (r.configId) q.set('config', r.configId)
  q.set('models', r.model)
  if (r.api && r.api !== 'chat_completions') q.set('api', r.api)
  return '/detect?' + q.toString()
})

// 排名分是相对分（可能出现 2.4 这种大于 1 的值），不能直接当百分比用。
// 以本记录最高分为基准归一，条形才有可比性。
function scoreBarWidth(t) {
  const list = rec.value?.top || []
  const max = Math.max(...list.map(x => x.score || 0), 0.0001)
  return Math.max(3, Math.min(100, ((t.score || 0) / max) * 100))
}

// 创建分享：服务端会生成快照和分享 ID，返回值只有 id
async function createShare() {
  if (sharing.value) return
  sharing.value = true
  try {
    const res = await api('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: rawKey.value }),
    })
    shareResult.value = { id: res.id, url: `${location.origin}/s/${res.id}` }
    toast(t('detail.shareCreated'), 'ok')
  } catch (e) {
    toast(t('detail.shareFailed', { msg: e.message }), 'error', 5000)
  } finally {
    sharing.value = false
  }
}

async function copyShareLink() {
  if (!shareResult.value) return
  try {
    await navigator.clipboard.writeText(shareResult.value.url)
    toast(t('common.copied'), 'ok')
  } catch { toast(t('common.copyFailed'), 'error') }
}

async function remove() {
  if (!confirm(t('history.deleteConfirm'))) return
  try {
    await del('/api/history/item/' + encodeURIComponent(rawKey.value))
    toast(t('history.deleted'), 'ok')
    router.replace('/history')
  } catch (e) { toast(e.message, 'error') }
}

onMounted(async () => {
  try {
    rec.value = await api('/api/history/item/' + encodeURIComponent(rawKey.value))
  } catch (e) {
    err.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-1.5 text-[12px] text-mute">
      <RouterLink to="/history" class="hover:text-chalk">{{ t('nav.history') }}</RouterLink>
      <span class="text-line">/</span>
      <span class="truncate font-mono">{{ rec?.model || t('common.details') }}</span>
    </div>

    <div v-if="loading" class="panel h-64 animate-pulse"></div>

    <div v-else-if="err" class="panel">
      <div class="flex flex-col items-center px-6 py-14 text-center">
        <div class="mb-3 text-[13px] text-warn">{{ err }}</div>
        <RouterLink to="/history" class="btn btn-sm">{{ t('detail.back') }}</RouterLink>
      </div>
    </div>

    <template v-else-if="rec">
      <div class="mb-5 flex flex-wrap items-end gap-3">
        <div class="min-w-0">
          <h1 class="truncate font-mono text-[18px] font-semibold tracking-tight">{{ rec.model }}</h1>
          <p class="mt-1 text-[12px] text-mute">
            {{ fmtTime(rec.time) }} · {{ rec.configName || t('detail.unknownConfig') }} · {{ rec.api }}{{ rec.effort ? ` · effort=${rec.effort}` : '' }}
          </p>
        </div>
        <div class="ml-auto flex flex-wrap gap-2">
          <button class="btn btn-sm btn-primary" :disabled="sharing" @click="createShare">
            {{ sharing ? t('detail.sharing') : t('detail.share') }}
          </button>
          <RouterLink :to="retestLink" class="btn btn-sm">{{ t('detail.retest') }}</RouterLink>
          <RouterLink to="/history" class="btn btn-sm">{{ t('detail.back') }}</RouterLink>
          <button class="btn btn-sm btn-danger" @click="remove">{{ t('common.delete') }}</button>
        </div>
      </div>

      <!-- 分享结果：创建后给出可复制的公开链接 -->
      <section v-if="shareResult" class="panel mb-4 p-4 fade-up">
        <div class="mb-2 flex items-center gap-2">
          <h2 class="label-xs">{{ t('detail.shareLink') }}</h2>
          <span class="chip !text-[11px]">{{ t('detail.shareTtl') }}</span>
          <button class="btn btn-ghost btn-sm ml-auto !min-h-6 !px-1.5 text-[11.5px]" @click="shareResult = null">{{ t('common.close') }}</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <input :value="shareResult.url" readonly class="field min-w-0 flex-1 !font-mono !text-[12px]" @focus="$event.target.select()" />
          <button class="btn btn-sm shrink-0" @click="copyShareLink">{{ t('detail.copyLink') }}</button>
          <RouterLink :to="`/s/${shareResult.id}`" class="btn btn-sm shrink-0">{{ t('common.preview') }}</RouterLink>
        </div>
      </section>

      <!-- 结论 -->
      <section class="panel mb-4 overflow-hidden">
        <div class="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
          <h2 class="label-xs">{{ t('detail.conclusion') }}</h2>
          <div class="ml-auto flex flex-wrap items-center gap-1.5">
            <StatusBadge :decision="rec.decision" :error="rec.error" :probability="rec.probability" />
            <span v-if="matchTag" class="rounded-md border px-2 py-[3px] text-[11.5px] font-medium" :class="matchTag.cls">
              {{ matchTag.text }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-px bg-line-soft lg:grid-cols-3">
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.predicted') }}</div>
            <div class="mt-1.5 text-[15px] font-semibold">{{ rec.prediction_name || rec.prediction || '—' }}</div>
            <div v-if="rec.prediction" class="mt-0.5 truncate font-mono text-[11px] text-mute">{{ rec.prediction }}</div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.family') }}</div>
            <div class="mt-1.5 text-[15px]">{{ rec.family_prediction_name || rec.family_prediction || '—' }}</div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.confidence') }}</div>
            <div class="mt-1.5 flex items-baseline gap-1.5">
              <span class="font-mono text-[19px] font-bold text-signal">
                {{ rec.probability != null ? (rec.probability * 100).toFixed(1) : '—' }}<span v-if="rec.probability != null" class="text-[12px]">%</span>
              </span>
              <span v-if="rec.probability_status" class="text-[10.5px] text-mute">{{ rec.probability_status }}</span>
            </div>
            <div v-if="rec.probability != null" class="mt-2 h-1 overflow-hidden rounded-full bg-ink-700">
              <div class="h-full rounded-full bg-gradient-to-r from-signal-dim to-signal" :style="{ width: (rec.probability * 100).toFixed(1) + '%' }"></div>
            </div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.rankScore') }}</div>
            <div class="mt-1.5 font-mono text-[15px]">{{ rec.ranking_score != null ? rec.ranking_score.toFixed(4) : '—' }}</div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.decision') }}</div>
            <div class="mt-1.5 flex items-baseline gap-1.5">
              <span class="text-[13.5px] font-semibold">{{ decisionText }}</span>
              <span v-if="decisionCode" class="font-mono text-[10.5px] text-mute">{{ decisionCode }}</span>
            </div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.validSamples') }}</div>
            <div class="mt-1.5 font-mono text-[15px]">{{ rec.used_outputs ?? '—' }} <span class="text-[12px] text-mute">/ 3</span></div>
          </div>
        </div>

        <p v-if="rec.evidence_reason" class="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-mute">
          {{ rec.evidence_reason }}
        </p>
        <p v-if="rec.error" class="border-t border-line-soft px-4 py-3 text-[12px] text-danger/90">{{ rec.error }}</p>
      </section>

      <!-- Top 候选 -->
      <section v-if="rec.top?.length" class="panel mb-4 overflow-hidden">
        <div class="border-b border-line-soft p-4"><h2 class="label-xs">{{ t('detail.topCandidates') }}</h2></div>
        <div class="divide-y divide-line-soft">
          <div v-for="(t, i) in rec.top" :key="t.model" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[11px]"
              :class="i === 0 ? 'border-signal/45 bg-signal/10 text-signal' : 'border-line text-mute'"
            >{{ i + 1 }}</span>
            <div class="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-0">
              <div class="truncate text-[13.5px] font-medium">{{ t.display_name || t.model }}</div>
              <div class="truncate font-mono text-[11px] text-mute">{{ t.model }}{{ t.family_name ? ' · ' + t.family_name : '' }}</div>
            </div>
            <div class="min-w-0 flex-1 sm:w-28 sm:flex-none">
              <div class="h-1 overflow-hidden rounded-full bg-ink-700">
                <div class="h-full rounded-full" :class="i === 0 ? 'bg-signal' : 'bg-sky/50'" :style="{ width: scoreBarWidth(t) + '%' }"></div>
              </div>
            </div>
            <div class="w-14 shrink-0 text-right font-mono text-[12px] sm:w-16" :class="i === 0 ? 'text-signal' : 'text-chalk/70'">
              {{ t.score != null ? (t.score * 100).toFixed(1) + '%' : '—' }}
            </div>
          </div>
        </div>
      </section>

      <!-- 采样明细 -->
      <section v-if="rec.samples?.length" class="panel mb-4 overflow-hidden">
        <div class="flex items-center gap-2 border-b border-line-soft p-4">
          <h2 class="label-xs">{{ t('detail.samples') }}</h2>
          <span class="chip ml-auto">{{ t('detail.sampleCount', { n: rec.samples.length }) }}</span>
        </div>
        <div class="divide-y divide-line-soft">
          <div v-for="(s, i) in rec.samples" :key="i" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-[12px]">
            <span class="font-mono text-[11px] text-mute">#{{ i + 1 }}</span>
            <span
              class="rounded-md border px-1.5 py-[1px] text-[11px] font-medium"
              :class="stateClass(s.state)"
              :title="s.state"
            >{{ stateText(s.state) }}</span>
            <span class="font-mono text-[11.5px] text-chalk/80">{{ s.count }}/{{ s.expected_count }}</span>
            <span v-if="s.first_byte_ms != null" class="font-mono text-[11px] text-mute">{{ t('detail.firstByte', { n: s.first_byte_ms }) }}</span>
            <span v-if="s.response_model" class="font-mono text-[11px] text-mute">{{ t('detail.returned', { name: s.response_model }) }}</span>
            <span v-if="s.error" class="min-w-0 flex-1 basis-full text-[11px] text-danger/90">{{ s.error }}</span>
          </div>
        </div>
      </section>

      <!-- 请求信息 -->
      <section class="panel overflow-hidden">
        <div class="border-b border-line-soft p-4"><h2 class="label-xs">{{ t('detail.requestInfo') }}</h2></div>
        <div class="grid grid-cols-1 gap-px bg-line-soft sm:grid-cols-2">
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">Base URL</div>
            <div class="mt-1.5 break-all font-mono text-[12px]">{{ rec.baseUrl || '—' }}</div>
          </div>
          <div class="bg-ink-850/60 p-4">
            <div class="label-xs">{{ t('detail.configProto') }}</div>
            <div class="mt-1.5 text-[12.5px]">{{ rec.configName || '—' }} · <span class="font-mono">{{ rec.api }}</span></div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

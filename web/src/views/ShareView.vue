<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from '../store'
import { t } from '../i18n'
import StatusBadge from '../components/StatusBadge.vue'
import { renderShareCard, downloadOrShareImage } from '../share/card'

const route = useRoute()
const rec = ref(null)
const loading = ref(true)
const err = ref('')
const saving = ref(false)

const shareId = computed(() => String(route.params.id || ''))
const siteUrl = computed(() => location.origin)

// 「复现检测」链接：点开后自动带上模型名与协议，登录后即可重跑同一条检测
const detectUrl = computed(() => {
  const r = rec.value
  if (!r) return location.origin + '/detect'
  const q = new URLSearchParams({ models: r.model })
  if (r.api && r.api !== 'chat_completions') q.set('api', r.api)
  return `${location.origin}/detect?${q}`
})

const shareLink = computed(() => `${location.origin}/s/${shareId.value}`)
// 模板作用域访问不到 window，这里单独给出站内相对路径供 RouterLink 使用
const detectPath = computed(() => detectUrl.value.replace(location.origin, ''))

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    toast(t('common.copied'), 'ok')
  } catch {
    toast(t('common.copyFailed'), 'error')
  }
}

async function saveImage() {
  if (!rec.value) return
  saving.value = true
  try {
    const blob = await renderShareCard(rec.value, {
      siteUrl: location.origin,
      detectUrl: detectUrl.value,
    })
    const result = await downloadOrShareImage(blob, `lmfpd-${rec.value.model}.png`, t('common.appName'))
    if (result === 'downloaded') toast(t('share.saved'), 'ok')
    else if (result === 'shared') toast(t('share.shared'), 'ok')
  } catch (e) {
    toast(t('share.imageFailed', { msg: e.message }), 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const res = await fetch('/api/share/' + encodeURIComponent(shareId.value))
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    rec.value = data
  } catch (e) {
    err.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
    <div v-if="loading" class="space-y-3">
      <div class="panel h-28 animate-pulse"></div>
      <div class="panel h-40 animate-pulse"></div>
    </div>

    <div v-else-if="err" class="panel px-6 py-16 text-center">
      <div class="mb-2 text-[32px]">🔍</div>
      <div class="text-[15px] font-semibold">{{ t('share.notFound') }}</div>
      <p class="mt-1.5 text-[12.5px] text-mute">{{ t('share.notFoundDesc') }}</p>
      <RouterLink to="/detect" class="btn btn-primary btn-sm mt-5">{{ t('share.goDetect') }}</RouterLink>
    </div>

    <template v-else-if="rec">
      <!-- 品牌头 -->
      <div class="mb-5 flex items-center gap-2.5">
        <span class="relative grid size-8 place-items-center rounded-[10px] bg-ink-800 ring-1 ring-line">
          <span class="absolute size-5 rounded-full border border-signal/35"></span>
          <span class="size-2 rounded-full bg-signal shadow-[var(--signal-glow-shadow)]"></span>
        </span>
        <div class="flex flex-col leading-none">
          <span class="text-[13.5px] font-semibold tracking-tight">{{ t('common.appName') }}</span>
          <span class="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-mute">{{ t('share.subtitle') }}</span>
        </div>
      </div>

      <!-- 结论卡 -->
      <section class="panel mb-4 overflow-hidden">
        <div class="border-b border-line-soft px-5 py-4">
          <div class="label-xs">{{ t('share.requestModel') }}</div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 class="min-w-0 truncate font-mono text-[19px] font-semibold">{{ rec.model }}</h1>
            <StatusBadge :decision="rec.decision" :error="rec.error" :probability="rec.probability" />
          </div>
          <p class="mt-2 text-[12px] text-mute">{{ fmtTime(rec.time) }} · {{ rec.api }}</p>
        </div>

        <div class="px-5 py-4">
          <div class="label-xs">{{ t('share.identifiedAs') }}</div>
          <div class="mt-1.5 text-[17px] font-semibold">{{ rec.prediction_name || rec.prediction || '—' }}</div>
          <div v-if="rec.prediction" class="mt-0.5 font-mono text-[11.5px] text-mute">{{ rec.prediction }}</div>
          <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-mute">
            <span v-if="rec.family_prediction_name">{{ t('share.family') }} {{ rec.family_prediction_name }}</span>
            <span v-if="rec.ranking_score != null">score {{ rec.ranking_score.toFixed(3) }}</span>
            <span>{{ t('share.samples') }} {{ rec.used_outputs ?? '—' }}/3</span>
          </div>
        </div>

        <div v-if="rec.top?.length" class="border-t border-line-soft px-5 py-4">
          <div class="label-xs mb-2.5">{{ t('share.top') }}</div>
          <div class="space-y-2.5">
            <div v-for="(t, i) in rec.top" :key="t.model" class="flex items-center gap-3">
              <span class="w-4 shrink-0 font-mono text-[11px]" :class="i === 0 ? 'text-signal' : 'text-mute'">{{ i + 1 }}</span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px]">{{ t.display_name || t.model }}</div>
                <div class="truncate font-mono text-[10.5px] text-mute">{{ t.model }}</div>
              </div>
              <div class="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-ink-700">
                <div
                  class="h-full rounded-full"
                  :class="i === 0 ? 'bg-signal' : 'bg-sky/50'"
                  :style="{ width: Math.max(3, ((t.score || 0) / (rec.top[0].score || 1)) * 100) + '%' }"
                ></div>
              </div>
              <span class="w-12 shrink-0 text-right font-mono text-[11.5px]" :class="i === 0 ? 'text-signal' : 'text-chalk/70'">
                {{ t.score != null ? t.score.toFixed(3) : '—' }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 分享操作 -->
      <section class="panel mb-4 p-4">
        <div class="label-xs mb-2.5">{{ t('share.shareThis') }}</div>
        <div class="mb-3 flex gap-2">
          <input :value="shareLink" readonly class="field flex-1 !font-mono !text-[12px]" @focus="$event.target.select()" />
          <button class="btn btn-sm shrink-0" @click="copyLink">{{ t('common.copy') }}</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveImage">
            {{ saving ? t('share.saving') : t('share.saveImage') }}
          </button>
          <RouterLink :to="detectPath" class="btn btn-sm">{{ t('share.retest') }}</RouterLink>
        </div>
      </section>

      <!-- 请求信息 -->
      <section class="panel overflow-hidden">
        <div class="border-b border-line-soft px-5 py-3"><h2 class="label-xs">{{ t('share.requestInfo') }}</h2></div>
        <div class="grid grid-cols-1 gap-px bg-line-soft sm:grid-cols-2">
          <div class="bg-ink-850/60 px-5 py-3.5">
            <div class="label-xs">Base URL</div>
            <div class="mt-1 break-all font-mono text-[11.5px]">{{ rec.baseUrl || '—' }}</div>
          </div>
          <div class="bg-ink-850/60 px-5 py-3.5">
            <div class="label-xs">{{ t('detail.configProto') }}</div>
            <div class="mt-1 text-[12px]">{{ rec.configName || '—' }} · <span class="font-mono">{{ rec.api }}</span></div>
          </div>
        </div>
      </section>

      <p class="mt-5 text-center font-mono text-[11px] text-mute">
        {{ siteUrl }} · {{ t('share.disclaimer') }}
      </p>
    </template>
  </div>
</template>

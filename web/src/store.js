import { reactive, ref } from 'vue'
import { api, postJSON, putJSON, del, buildQuery, getToken, setToken, clearToken } from './api'
import { t } from './i18n'
import { listConfigs } from './configs'
import { isAccountMode } from './runtime'

// 便于视图层统一从 store 引入
export { api, postJSON, putJSON, del, buildQuery, getToken, setToken, clearToken }

// ---------- 全局状态 ----------
export const auth = reactive({ user: null, checked: false })
export const toasts = ref([])

export const configCache = reactive({ list: null, loading: false })
export const modelState = reactive({ configId: null, list: [], selected: [], loading: false })

// 检测任务：置于模块级，切换页面不中断
export const detectTask = reactive({
  running: false,
  stop: false,
  rows: [],      // { model, status: 'pending'|'running'|'done'|'fail', record, err }
  done: 0,
  total: 0,
  configId: null,
  configName: '',
  api: 'chat_completions',
  effort: '',
  strict: false,
  concurrency: 10,
  startedAt: 0,
  phase: 'idle', // idle | loading-data | running | done
})

let toastSeq = 0
export function toast(message, type = 'info', ms = 2800) {
  const id = ++toastSeq
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, ms)
}

// ---------- 认证 ----------
export async function ensureUser(force = false) {
  if (!getToken()) { auth.user = null; auth.checked = true; return null }
  if (auth.user && !force) return auth.user
  try {
    auth.user = await api('/api/auth/me')
  } catch {
    auth.user = null
  }
  auth.checked = true
  return auth.user
}

export async function login(username, password, turnstileToken) {
  const res = await postJSON('/api/auth/login', { username, password, turnstileToken })
  setToken(res.token)
  auth.user = res.user
  auth.checked = true
  configCache.list = null
  return res.user
}

export async function register(username, password, turnstileToken) {
  const res = await postJSON('/api/auth/register', { username, password, turnstileToken })
  setToken(res.token)
  auth.user = res.user
  auth.checked = true
  configCache.list = null
  return res.user
}

export function logout() {
  stopBatch()
  batchVersion++
  clearToken()
  auth.user = null
  configCache.list = null
  modelState.configId = null
  modelState.list = []
  modelState.selected = []
  detectTask.rows = []
  detectTask.running = false
  detectTask.phase = 'idle'
}

// ---------- 配置 ----------
export async function loadConfigs(force = false) {
  if (configCache.list && !force) return configCache.list
  configCache.loading = true
  try {
    configCache.list = await listConfigs()
    return configCache.list
  } finally {
    configCache.loading = false
  }
}

export function resetModels(configId) {
  modelState.configId = configId
  modelState.list = []
  modelState.selected = []
  modelState.loading = false
}

export async function fetchModels(config) {
  modelState.loading = true
  try {
    const res = await postJSON('/api/models', { baseUrl: config.baseUrl, apiKey: config.apiKey })
    modelState.list = res.models.map(m => m.id).sort((a, b) => a.localeCompare(b))
    modelState.selected = modelState.selected.filter(m => modelState.list.includes(m))
    return res
  } finally {
    modelState.loading = false
  }
}

export async function deleteAllConfigs() {
  if (detectTask.running) throw new Error(t('account.stopHint'))
  await del('/api/configs')
  configCache.list = []
  resetModels(null)
}

export async function deleteHistory(key) {
  if (detectTask.running) throw new Error(t('account.stopHint'))
  await del(key ? '/api/history/item/' + encodeURIComponent(key) : '/api/history')
  if (key) detectTask.rows = detectTask.rows.filter(row => row.record?.key !== key)
  else {
    detectTask.rows = []
    detectTask.phase = 'idle'
    detectTask.done = 0
    detectTask.total = 0
  }
}

// ---------- 批量检测 ----------
// SDK 的流式读取在上游「连上但永不结束」时会一直挂在 reader.read() 上：
// 首字节到达后它就把自己的超时定时器清掉了，之后没有任何兜底。因此这里必须
// 自己持有 AbortController，既能响应「停止」按钮，也能给单个模型设总时长上限。
const MODEL_TIMEOUT_MS = 180000 // 单个模型（3 个样本并行）的总时长上限

// 并发度上限：每个模型内部已经有 3 个样本并行，再叠加过多模型会同时打满
// 上游配额，反而更容易触发限流。10 是实践中的折中值。
export const CONCURRENCY_MAX = 20
export const CONCURRENCY_DEFAULT = 10

export function normalizeConcurrency(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v < 1) return CONCURRENCY_DEFAULT
  return Math.min(CONCURRENCY_MAX, v)
}

let batchAbort = null
let batchVersion = 0

export function stopBatch() {
  detectTask.stop = true
  batchAbort?.abort()
}

export async function runBatch({ config, models, apiProto, effort, strict, concurrency }) {
  if (detectTask.running) { toast(t('detect.inProgress'), 'warn'); return }
  if (!config) { toast(t('detect.needConfig'), 'warn'); return }
  if (!models.length) { toast(t('detect.needModels'), 'warn'); return }

  const version = ++batchVersion
  const limit = normalizeConcurrency(concurrency)

  Object.assign(detectTask, {
    running: true, stop: false,
    rows: models.map(m => ({ model: m, status: 'pending', record: null, err: null, samplesDone: 0 })),
    done: 0, total: models.length, concurrency: limit,
    configId: config.id, configName: config.name,
    api: apiProto, effort: effort || '', strict: !!strict,
    startedAt: Date.now(), phase: 'loading-data',
  })
  const controller = new AbortController()
  batchAbort = controller
  const rows = detectTask.rows

  let detector
  try {
    const mod = await import('./detector')
    detector = await mod.getDetector()
  } catch (e) {
    if (version !== batchVersion) return
    detectTask.running = false
    detectTask.phase = 'idle'
    toast(t('detect.dataLoadFailed', { msg: e.message }), 'error', 6000)
    return
  }

  if (version !== batchVersion) return
  detectTask.phase = 'running'
  // worker 池：limit 个 worker 从共享游标里取下一个模型，任一完成立刻补位。
  // 相比「按批切块」的做法，池子不会因为某个慢模型拖住整批。
  let cursor = 0
  const pendingSaves = []

  async function detectOne(row) {
    if (version !== batchVersion || controller.signal.aborted) return
    row.status = 'running'
    row.samplesDone = 0
    const finishedSamples = new Set()

    // 单个模型的看门狗：到点强制中止，避免上游「连上不结束」时永久挂起
    const modelAbort = new AbortController()
    let timedOut = false
    const watchdog = setTimeout(() => { timedOut = true; modelAbort.abort() }, MODEL_TIMEOUT_MS)
    const signal = AbortSignal.any([controller.signal, modelAbort.signal])
    try {
      const cfg = { baseUrl: config.baseUrl, apiKey: config.apiKey, model: row.model, api: apiProto }
      if (effort) cfg.effort = effort
      if (strict) cfg.strict = true
      const result = await detector.detect(cfg, {
        signal,
        // onSample 在样本流式过程中会反复回调，必须按索引去重，
        // 只统计进入终态的样本，否则计数会虚高。
        onSample: (index, sample) => {
          if (version !== batchVersion) return
          const state = sample?.state
          if (state && state !== 'queued' && state !== 'waiting' && state !== 'streaming') {
            finishedSamples.add(index)
            row.samplesDone = finishedSamples.size
          }
        },
      })
      if (version !== batchVersion) return
      const a = result.analysis || {}
      const record = {
        configId: config.id, configName: config.name, baseUrl: config.baseUrl,
        model: row.model, api: apiProto, effort: effort || null,
        error: result.error ?? null,
        decision: a.decision ?? null,
        prediction: a.prediction ?? null, prediction_name: a.prediction_name ?? null,
        family_prediction: a.family_prediction ?? null, family_prediction_name: a.family_prediction_name ?? null,
        ranking_score: a.ranking_score ?? null, probability: a.probability ?? null,
        probability_status: a.probability_status ?? null,
        used_outputs: a.used_outputs ?? null,
        evidence_label: a.evidence?.label ?? null, evidence_reason: a.evidence?.reason ?? null,
        top: (a.results || []).slice(0, 3).map(r => ({
          model: r.model, display_name: r.display_name, family: r.family,
          family_name: r.family_name, score: r.score, probability: r.probability,
        })),
        samples: (result.samples || []).map(s => ({
          state: s.state, count: s.count, expected_count: s.expected_count,
          first_byte_ms: s.first_byte_ms, response_model: s.response_model, error: s.error,
        })),
      }
      row.record = record
      row.status = record.error ? 'fail' : 'done'
      if (isAccountMode()) {
        pendingSaves.push(postJSON('/api/history', record)
          .then(saved => { if (version === batchVersion && saved?.key) row.record.key = saved.key })
          .catch(() => {}))
      }
    } catch (e) {
      if (version !== batchVersion) return
      row.status = 'fail'
      // 中止与超时要给出可区分的提示，否则用户只会看到一句莫名的 AbortError
      row.err = timedOut
        ? `超过 ${Math.round(MODEL_TIMEOUT_MS / 1000)} 秒未完成，已跳过该模型`
        : detectTask.stop ? t('detect.manualStop') : e.message
    } finally {
      clearTimeout(watchdog)
    }
    if (version === batchVersion) detectTask.done++
  }

  // 启动 limit 个 worker，各自从共享游标里领任务；谁先跑完谁接着领下一个。
  // 用一个同步自增的游标即可，JS 单线程下取任务不存在竞态。
  const workerCount = Math.min(limit, rows.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (version === batchVersion && !controller.signal.aborted && !detectTask.stop) {
      const index = cursor++
      if (index >= rows.length) break
      await detectOne(rows[index])
    }
  })
  await Promise.all(workers)
  // 删除入口只有在采样和已发出的历史保存均结束后才重新开放。
  await Promise.allSettled(pendingSaves)
  if (version !== batchVersion) return

  // 被跳过的行（停止时还没开始）要标成「已取消」，否则会永远停在等待中
  for (const row of detectTask.rows) {
    if (row.status === 'pending') {
      row.status = 'fail'
      row.err = t('detect.manualStop')
    }
  }

  const stopped = detectTask.stop
  detectTask.running = false
  detectTask.phase = 'done'
  batchAbort = null
  const scored = detectTask.rows.filter(r => r.record?.decision === 'scored').length
  const failed = detectTask.rows.filter(r => r.err || (r.record?.error && r.record?.decision !== 'not_model')).length
  const parts = [`${detectTask.done}/${detectTask.total} 完成`, `${scored} 个已评分`]
  if (failed) parts.push(`${failed} 个失败`)
  toast(`${stopped ? t('detect.stoppedSummary') : t('detect.done')}：${parts.join(' · ')}`, stopped ? 'warn' : 'ok', 4200)
}

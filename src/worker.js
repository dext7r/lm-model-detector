// LM 模型指纹检测工具 - Cloudflare Worker 后端
// 职责：静态资源 + 可选用户体系与 KV 存储；未绑定 KV 时仅提供无状态检测
//       + 模型列表代理 + 检测请求转发 + 参考数据代理
// 检测评分逻辑在浏览器端运行（web/src/vendor/lmfpd.browser.js）
import { injectSeo, robotsTxt, sitemapXml, rssXml, pickLang } from './seo.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // ---- SEO 站点文件：全部由请求域名动态生成，不写死 host ----
    if (request.method === 'GET') {
      if (url.pathname === '/robots.txt') {
        return new Response(robotsTxt(url), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        })
      }
      if (url.pathname === '/sitemap.xml') {
        return new Response(sitemapXml(url, await listShareKeys(env), Boolean(env.KV)), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        })
      }
      if (url.pathname === '/rss.xml') {
        const lang = pickLang(request.headers.get('Accept-Language') || '')
        return new Response(rssXml(url, await listRecentShares(env), lang), {
          headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
        })
      }
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url)
      } catch (e) {
        return json({ error: e?.status ? e.message : '服务端异常：' + (e?.message || String(e)), ...(e?.status === 409 ? { deleting: true } : {}) }, e?.status || 500)
      }
    }
    // 静态资源；未命中且为页面导航请求时回退到 index.html（单页应用路由）
    const res = await env.ASSETS.fetch(request)
    if (res.status === 404 && request.method === 'GET') {
      const accept = request.headers.get('Accept') || ''
      if (accept.includes('text/html') || !url.pathname.includes('.')) {
        return renderIndex(env, url, request)
      }
    }
    return res
  },
}

// 把 SPA 外壳与按路由生成的 TDK/OG 一起返回，保证爬虫拿到的是完整 head
async function renderIndex(env, url, request) {
  const indexUrl = new URL('/index.html', url)
  const shell = await env.ASSETS.fetch(new Request(indexUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'text/html' },
  }))
  if (!shell.ok) return shell
  const html = await shell.text()
  const lang = pickLang(request.headers.get('Accept-Language') || '')
  return new Response(injectSeo(html, url, lang), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 页面内容随域名变化，交给边缘缓存时带上 Vary，避免串域名
      'Vary': 'Accept',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}

// sitemap 只收录最近的分享，避免 KV 列表过长拖慢响应
async function listShareKeys(env) {
  if (!env.KV) return []
  try {
    const page = await env.KV.list({ prefix: 'share:', limit: 500 })
    return page.keys
  } catch { return [] }
}

async function listRecentShares(env) {
  if (!env.KV) return []
  try {
    const page = await env.KV.list({ prefix: 'share:', limit: 20 })
    const items = await Promise.all(page.keys.map(async k => {
      const raw = await env.KV.get(k.name)
      if (!raw) return null
      try {
        const v = JSON.parse(raw)
        return { id: k.name.slice('share:'.length), model: v.model, prediction: v.prediction,
          prediction_name: v.prediction_name, probability: v.probability,
          ranking_score: v.ranking_score, used_outputs: v.used_outputs, time: v.time }
      } catch { return null }
    }))
    return items.filter(Boolean)
  } catch { return [] }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000 // 会话有效期 30 天

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS, ...extra },
  })
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

// ---------- Cloudflare Turnstile 人机验证 ----------
// 三种状态，避免「密钥配错却静默放行」：
//   disabled       站点密钥与私钥都没配 —— 视为未启用（仅本地开发会用）
//   ready          两者齐备 —— 正常校验
//   misconfigured  只配了其中一个 —— 直接拒绝并报错，绝不静默放行
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function turnstileState(env) {
  const hasSecret = !!env.TURNSTILE_SECRET
  const hasSiteKey = !!(env.TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY_MAP)
  if (!hasSecret && !hasSiteKey) return 'disabled'
  if (hasSecret && hasSiteKey) return 'ready'
  return 'misconfigured'
}

/**
 * 按请求域名选择 sitekey。
 * 一个 Turnstile widget 可以登记多个 hostname（跨一级域名也可以），此时
 * 用 TURNSTILE_SITE_KEY 一个值即可。若某个域名需要独立 widget，可在
 * TURNSTILE_SITE_KEY_MAP 里用 JSON 覆盖：{"lm-detector.a.com":"0xAAA..."}
 * 这样新增域名时不必改动代码，也不会因为漏配白名单导致整站无法登录。
 */
function resolveSiteKey(env, url) {
  const host = url.hostname.toLowerCase()
  if (env.TURNSTILE_SITE_KEY_MAP) {
    try {
      const map = JSON.parse(env.TURNSTILE_SITE_KEY_MAP)
      if (map && typeof map === 'object' && map[host]) return String(map[host])
    } catch { /* 配置格式错误时回落默认值 */ }
  }
  return env.TURNSTILE_SITE_KEY || ''
}

/**
 * 校验前端提交的 Turnstile token。
 * @returns {Promise<{ok: boolean, error?: string, status?: number}>}
 */
async function verifyTurnstile(env, request, token) {
  const state = turnstileState(env)
  if (state === 'disabled') return { ok: true }
  // 配置不完整时宁可拒绝，也不让攻击者在密钥失效后长驱直入
  if (state === 'misconfigured') {
    return { ok: false, status: 500, error: '人机验证未完成配置，请联系管理员' }
  }
  if (!token) return { ok: false, status: 403, error: '请完成人机验证' }

  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET)
  form.append('response', String(token))
  // 带上真实来源 IP，提升风控准确度
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) form.append('remoteip', ip)

  try {
    const res = await fetchWithTimeout(TURNSTILE_VERIFY, { method: 'POST', body: form }, 10000)
    const data = await res.json().catch(() => ({}))
    if (data.success) return { ok: true }
    // 把 Cloudflare 返回的错误码透出，便于排查站点密钥/域名配置问题
    const codes = Array.isArray(data['error-codes']) ? data['error-codes'].join(', ') : 'unknown'
    return { ok: false, status: 403, error: `人机验证未通过（${codes}）` }
  } catch (e) {
    // 验证服务不可用时同样拒绝，避免通过打挂 siteverify 绕过校验
    return { ok: false, status: 503, error: '人机验证服务暂不可用，请稍后重试' }
  }
}

// ---------- 编码与加密工具 ----------
const enc = new TextEncoder()
function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}
async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 },
    key, 256)
  return b64url(new Uint8Array(bits))
}
function randId(prefix) {
  return prefix + Date.now().toString(36) + crypto.getRandomValues(new Uint8Array(4)).reduce((s, b) => s + b.toString(36).padStart(2, '0'), '')
}

// ---------- 会话令牌（HMAC 签名，无状态）----------
async function getSecret(env) {
  let s = await env.KV.get('auth_secret')
  if (!s) {
    s = b64url(crypto.getRandomValues(new Uint8Array(32)))
    await env.KV.put('auth_secret', s)
  }
  return s
}
async function issueToken(env, user) {
  const payload = b64url(enc.encode(JSON.stringify({ u: user.id, n: user.name, e: Date.now() + SESSION_TTL_MS })))
  const sig = b64url(await hmacSign(await getSecret(env), payload))
  return payload + '.' + sig
}
async function verifyToken(env, request) {
  // 代理转发场景下 Authorization 装的是上游 API Key，会话令牌另走 X-LMFPD-Session
  const direct = request.headers.get('X-LMFPD-Session') || ''
  const auth = request.headers.get('Authorization') || ''
  const token = direct || (auth.startsWith('Bearer ') ? auth.slice(7) : null)
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expect = b64url(await hmacSign(await getSecret(env), payload))
  if (expect !== sig) return null
  let data
  try { data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) } catch { return null }
  if (!data.u || !data.e || Date.now() > data.e || typeof data.n !== 'string') return null
  // 每次校验账户仍存在且 ID 相同，注销后不能继续使用旧签名令牌。
  const user = await readUser(env, data.n)
  if (!user || user.id !== data.u) return null
  return { userId: user.id, name: user.name, deleting: Boolean(user.deleting) }
}

// ---------- API 路由 ----------
async function handleApi(request, env, ctx, url) {
  const path = url.pathname
  const method = request.method
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  // 只以实际 KV 绑定选择模式。已绑定 KV 的故障不会切换为免登录。
  const accountMode = Boolean(env.KV)
  if (path === '/api/config' && method === 'GET') {
    return json({
      mode: accountMode ? 'account' : 'stateless',
      turnstileSiteKey: accountMode && turnstileState(env) === 'ready' ? resolveSiteKey(env, url) : '',
    })
  }

  if (!accountMode) {
    if (path.startsWith('/api/data/') && (method === 'GET' || method === 'HEAD')) {
      return handleDataProxy(request, ctx, url, false)
    }
    if (path === '/api/models' || path === '/api/proxy') {
      const origin = request.headers.get('Origin')
      if (origin ? origin !== url.origin : request.headers.get('Sec-Fetch-Site') !== 'same-origin') {
        return json({ error: '仅接受本站发起的请求' }, 403)
      }
      if (path === '/api/models' && method === 'POST') return handleModels(request, true)
      if (path === '/api/proxy' && ['GET', 'HEAD', 'POST'].includes(method)) return handleProxy(request, url, true)
    }
    return json({ error: '当前部署未启用账户、历史或云端分享' }, 404)
  }

  // ---- 认证（无需登录）----
  if (path === '/api/auth/register' && method === 'POST') return register(request, env)
  if (path === '/api/auth/login' && method === 'POST') return login(request, env)
  if (path === '/api/auth/me' && method === 'GET') {
    const sess = await verifyToken(env, request)
    if (!sess) return json({ error: '未登录或会话已过期' }, 401)
    return json({ userId: sess.userId, name: sess.name, deleting: sess.deleting })
  }

  // ---- 参考数据代理（公开）----
  if (path.startsWith('/api/data/')) return handleDataProxy(request, ctx, url)

  // ---- 分享内容读取（公开，无需登录）----
  {
    const shareRead = path.match(/^\/api\/share\/([\w-]{4,64})$/)
    if (shareRead && method === 'GET') {
      const raw = await env.KV.get('share:' + shareRead[1])
      if (!raw) return json({ error: '分享不存在或已失效' }, 404)
      return json(JSON.parse(raw))
    }
  }

  // ---- 以下均需登录 ----
  const sess = await verifyToken(env, request)
  if (!sess) return json({ error: '未登录或会话已过期' }, 401)
  const uid = sess.userId
  if (path === '/api/account' && method === 'DELETE') return deleteAccount(request, env, sess)
  if (sess.deleting) return json({ error: '账户注销尚未完成，请进入账户设置重试', deleting: true }, 409)

  // 模型列表代理
  if (path === '/api/models' && method === 'POST') return handleModels(request)

  // 检测请求转发
  if (path === '/api/proxy' && ['GET', 'HEAD', 'POST'].includes(method)) return handleProxy(request, url)

  // 配置管理（按用户隔离：ucfg:<uid>）
  if (path === '/api/configs' && method === 'GET') return json(await getConfigs(env, uid))
  if (path === '/api/configs' && method === 'DELETE') {
    await env.KV.delete('ucfg:' + uid)
    return json({ ok: true })
  }
  if (path === '/api/configs' && method === 'POST') {
    const { name, baseUrl, apiKey } = await readBody(request)
    if (!name || !baseUrl || !apiKey) return json({ error: 'name、baseUrl、apiKey 均必填' }, 400)
    const configs = await getConfigs(env, uid)
    const cfg = {
      id: randId('cfg_'),
      name: String(name).trim(), baseUrl: String(baseUrl).trim(), apiKey: String(apiKey).trim(),
      createdAt: new Date().toISOString(),
    }
    configs.push(cfg)
    await requireActiveAccount(env, sess)
    await env.KV.put('ucfg:' + uid, JSON.stringify(configs))
    return json(cfg)
  }
  {
    const m = path.match(/^\/api\/configs\/([^/]+)$/)
    if (m && method === 'PUT') {
      const { name, baseUrl, apiKey } = await readBody(request)
      const configs = await getConfigs(env, uid)
      const c = configs.find(x => x.id === m[1])
      if (!c) return json({ error: '配置不存在' }, 404)
      if (name) c.name = name
      if (baseUrl) c.baseUrl = String(baseUrl).trim()
      if (apiKey) c.apiKey = String(apiKey).trim()
      c.updatedAt = new Date().toISOString()
      await requireActiveAccount(env, sess)
      await env.KV.put('ucfg:' + uid, JSON.stringify(configs))
      return json(c)
    }
    if (m && method === 'DELETE') {
      const configs = await getConfigs(env, uid)
      const remaining = configs.filter(x => x.id !== m[1])
      if (remaining.length === configs.length) return json({ error: '配置不存在' }, 404)
      await requireActiveAccount(env, sess)
      if (remaining.length) await env.KV.put('ucfg:' + uid, JSON.stringify(remaining))
      else await env.KV.delete('ucfg:' + uid)
      return json({ ok: true })
    }
  }

  // 历史记录（按用户隔离：h:<uid>:<倒序时间戳>:<rand>）
  if (path === '/api/history' && method === 'POST') {
    const rec = await readBody(request)
    if (!rec || !rec.model) return json({ error: '记录缺少 model 字段' }, 400)
    rec.id = randId('det_')
    rec.time = new Date().toISOString()
    rec.userId = uid
    const key = historyKey(uid, rec.time, rec.id)
    // 对外只暴露 h:<uid>: 之后的片段，与列表接口保持一致；
    // 返回完整 KV key 会让详情接口再拼一次前缀，导致 404。
    rec.key = key.slice(`h:${uid}:`.length)
    await requireActiveAccount(env, sess)
    await env.KV.put(key, JSON.stringify(rec))
    return json(rec)
  }
  if (path === '/api/history' && method === 'GET') {
    return json(await listHistoryPage(env, uid, url.searchParams))
  }
  // 创建分享：把一条历史记录转成公开快照，避免把整个历史库暴露出去
  if (path === '/api/share' && method === 'POST') {
    const { key } = await readBody(request)
    if (!key) return json({ error: '缺少 key' }, 400)
    const fullKey = ownedHistoryKey(uid, String(key))
    if (!fullKey) return json({ error: '历史记录标识无效' }, 400)
    const raw = await env.KV.get(fullKey)
    if (!raw) return json({ error: '记录不存在' }, 404)

    let rec
    try { rec = JSON.parse(raw) } catch { return json({ error: '记录数据损坏' }, 500) }

    // 快照只保留展示所需字段：剔除 userId、KV key 等内部信息
    const snapshot = {
      model: rec.model, time: rec.time,
      decision: rec.decision, prediction: rec.prediction, prediction_name: rec.prediction_name,
      family_prediction: rec.family_prediction, family_prediction_name: rec.family_prediction_name,
      ranking_score: rec.ranking_score, probability: rec.probability,
      probability_status: rec.probability_status, used_outputs: rec.used_outputs,
      evidence_label: rec.evidence_label, evidence_reason: rec.evidence_reason,
      error: rec.error, api: rec.api, effort: rec.effort,
      configName: rec.configName, baseUrl: rec.baseUrl,
      top: Array.isArray(rec.top) ? rec.top.slice(0, 3) : [],
      samples: (Array.isArray(rec.samples) ? rec.samples : []).map(s => ({
        state: s.state, count: s.count, expected_count: s.expected_count,
        first_byte_ms: s.first_byte_ms, response_model: s.response_model, error: s.error,
      })),
    }

    const id = randId('s_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
    // 90 天后自动清理，避免 KV 无限增长
    await requireActiveAccount(env, sess)
    await env.KV.put('share:' + id, JSON.stringify(snapshot), {
      expirationTtl: 90 * 24 * 3600,
      metadata: { ownerId: uid, historyKey: fullKey.slice(`h:${uid}:`.length) },
    })
    return json({ id, key: id })
  }

  if (path === '/api/history' && method === 'DELETE') {
    await clearHistory(env, uid)
    return json({ ok: true })
  }
  if (path === '/api/history/export' && method === 'GET') {
    const records = await listHistoryPage(env, uid, new URLSearchParams('pageSize=1000'))
    return new Response(JSON.stringify(records.items, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lmfpd-history.json"',
      },
    })
  }
  {
    // 单条读取（详情页）
    const m = path.match(/^\/api\/history\/item\/(.+)$/)
    if (m && method === 'GET') {
      const key = ownedHistoryKey(uid, decodeURIComponent(m[1]))
      if (!key) return json({ error: '历史记录标识无效' }, 400)
      const raw = await env.KV.get(key)
      if (!raw) return json({ error: '记录不存在' }, 404)
      return json(JSON.parse(raw))
    }
    // 单条删除（key 为 h:<uid>: 之后的部分）
    if (m && method === 'DELETE') {
      const key = ownedHistoryKey(uid, decodeURIComponent(m[1]))
      if (!key) return json({ error: '历史记录标识无效' }, 400)
      await deleteHistoryItem(env, uid, key)
      return json({ ok: true })
    }
    // 兼容旧接口：/api/history/<id>
    const m2 = path.match(/^\/api\/history\/([^/]+)$/)
    if (m2 && method === 'DELETE') {
      const key = ownedHistoryKey(uid, decodeURIComponent(m2[1]))
      if (!key) return json({ error: '历史记录标识无效' }, 400)
      await deleteHistoryItem(env, uid, key)
      return json({ ok: true })
    }
  }

  return json({ error: 'Not Found: ' + path }, 404)
}

// ---------- 注册 / 登录 ----------
async function register(request, env) {
  const { username, password, turnstileToken } = await readBody(request)
  const captcha = await verifyTurnstile(env, request, turnstileToken)
  if (!captcha.ok) return json({ error: captcha.error }, captcha.status || 403)
  const name = String(username || '').trim()
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) return json({ error: '用户名需为 3-32 位字母、数字、下划线或中划线' }, 400)
  if (typeof password !== 'string' || password.length < 6) return json({ error: '密码至少 6 位' }, 400)
  const key = 'user:' + name.toLowerCase()
  if (await env.KV.get(key)) return json({ error: '该用户名已被注册' }, 400)
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const user = {
    id: randId('u_'), name,
    salt,
    hash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  }
  await env.KV.put(key, JSON.stringify(user))
  await migrateLegacyData(env, user)
  return json({ token: await issueToken(env, user), user: { userId: user.id, name: user.name } })
}

async function login(request, env) {
  const { username, password, turnstileToken } = await readBody(request)
  const captcha = await verifyTurnstile(env, request, turnstileToken)
  if (!captcha.ok) return json({ error: captcha.error }, captcha.status || 403)
  const key = 'user:' + String(username || '').trim().toLowerCase()
  const raw = await env.KV.get(key)
  if (!raw) return json({ error: '用户名或密码错误' }, 401)
  let user
  try { user = JSON.parse(raw) } catch { return json({ error: '用户数据损坏' }, 500) }
  const hash = await hashPassword(String(password || ''), user.salt || '')
  if (hash !== user.hash) return json({ error: '用户名或密码错误' }, 401)
  if (!user.deleting) await migrateLegacyData(env, user)
  return json({ token: await issueToken(env, user), user: { userId: user.id, name: user.name, deleting: Boolean(user.deleting) } })
}

// 旧版（无用户体系）数据迁移：第一个注册的用户继承原有配置与历史
async function migrateLegacyData(env, user) {
  if (await env.KV.get('legacy_migrated')) return
  const oldCfg = await env.KV.get('configs')
  if (oldCfg && !(await env.KV.get('ucfg:' + user.id))) {
    await env.KV.put('ucfg:' + user.id, oldCfg)
  }
  const keys = []
  let cursor
  do {
    const page = await env.KV.list({ prefix: 'hi:', cursor, limit: 1000 })
    keys.push(...page.keys.map(k => k.name))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  for (const k of keys) {
    const v = await env.KV.get(k)
    if (v) await env.KV.put(`h:${user.id}:` + k.slice(3), v)
    await env.KV.delete(k)
  }
  await env.KV.delete('configs')
  await env.KV.put('legacy_migrated', user.id)
}

class AccountError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function readUser(env, name) {
  const raw = await env.KV.get('user:' + name.toLowerCase())
  return raw ? JSON.parse(raw) : null
}

async function requireActiveAccount(env, session) {
  const user = await readUser(env, session.name)
  if (!user || user.id !== session.userId) throw new AccountError('账户不存在或会话已失效', 401)
  if (user.deleting) throw new AccountError('账户正在注销，请进入账户设置完成删除', 409)
  return user
}

async function deleteAccount(request, env, session) {
  const { password, confirmation } = await readBody(request)
  if (confirmation !== 'DELETE' || typeof password !== 'string' || !password) {
    return json({ error: '请输入当前密码，并输入 DELETE 确认注销' }, 400)
  }
  const user = await readUser(env, session.name)
  if (!user || user.id !== session.userId) return json({ error: '账户不存在或会话已失效' }, 401)
  if (await hashPassword(password, user.salt) !== user.hash) return json({ error: '当前密码不正确' }, 403)

  const accountKey = 'user:' + user.name.toLowerCase()
  // 中间状态仅阻止新增数据。失败后仍可用密码登录账户设置并重试；不视为注销成功。
  if (!user.deleting) await env.KV.put(accountKey, JSON.stringify({ ...user, deleting: true }))
  await clearHistory(env, user.id)
  await env.KV.delete('ucfg:' + user.id)
  if (await env.KV.get('legacy_migrated') === user.id) await env.KV.put('legacy_migrated', 'done')
  // 最后删除含密码摘要的账户记录；不能用标记替代实际删除。
  await env.KV.delete(accountKey)
  return json({ ok: true })
}

// ---------- 配置（按用户）----------
async function getConfigs(env, uid) {
  const raw = await env.KV.get('ucfg:' + uid)
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

// ---------- 历史（按用户、分页）----------
// key 采用倒序时间戳，使 KV 字典序即为「最新在前」
function historyKey(uid, isoTime, id) {
  const ts = new Date(isoTime).getTime() || Date.now()
  const inverted = String(9999999999999 - ts).padStart(13, '0')
  return `h:${uid}:${inverted}:${id}`
}

const MAX_SCAN = 600 // 单次最多扫描的历史条数

async function listHistoryPage(env, uid, params) {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '20', 10) || 20))
  const q = (params.get('q') || '').trim().toLowerCase()
  const configId = params.get('configId') || ''
  const prefix = `h:${uid}:`

  // 收集有序 key（最多 MAX_SCAN 条）
  const keys = []
  let cursor
  do {
    const p = await env.KV.list({ prefix, cursor, limit: 1000 })
    keys.push(...p.keys.map(k => k.name))
    cursor = p.list_complete ? undefined : p.cursor
  } while (cursor && keys.length < MAX_SCAN)
  keys.sort()

  const filtered = !!(q || configId)

  if (!filtered) {
    const total = keys.length
    const start = (page - 1) * pageSize
    const slice = keys.slice(start, start + pageSize)
    const items = (await Promise.all(slice.map(async k => {
      const v = await env.KV.get(k)
      if (!v) return null
      try { const r = JSON.parse(v); r.key = k.slice(prefix.length); return r } catch { return null }
    }))).filter(Boolean)
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), scanned: total }
  }

  // 带过滤：逐条扫描（上限 MAX_SCAN），收集后分页
  const matched = []
  const need = page * pageSize
  for (const k of keys) {
    const v = await env.KV.get(k)
    if (!v) continue
    let r
    try { r = JSON.parse(v) } catch { continue }
    r.key = k.slice(prefix.length)
    if (configId && r.configId !== configId) continue
    if (q) {
      const hay = [r.model, r.prediction, r.prediction_name, r.configName].join(' ').toLowerCase()
      if (!hay.includes(q)) continue
    }
    matched.push(r)
    if (matched.length >= need && matched.length > 200) break // 单次扫描保护
  }
  const start = (page - 1) * pageSize
  return {
    items: matched.slice(start, start + pageSize),
    total: matched.length,
    page, pageSize,
    totalPages: Math.max(1, Math.ceil(matched.length / pageSize)),
    scanned: keys.length,
  }
}

function ownedHistoryKey(uid, value) {
  const prefix = `h:${uid}:`
  const suffix = value.startsWith(prefix) ? value.slice(prefix.length) : value
  if (!suffix || suffix.startsWith('h:') || /[\u0000-\u001f]/.test(suffix)) return null
  return prefix + suffix
}

async function deleteMatchingKeys(env, prefix, matches = () => true) {
  // 先完成所有分页，再执行删除，避免删除改变分页位置而漏项。
  // 不使用历史列表的 MAX_SCAN，清理范围覆盖整个账户。
  const keys = []
  let cursor
  do {
    const page = await env.KV.list({ prefix, cursor, limit: 1000 })
    keys.push(...page.keys.filter(matches).map(key => key.name))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  for (let i = 0; i < keys.length; i += 32) {
    await Promise.all(keys.slice(i, i + 32).map(key => env.KV.delete(key)))
  }
}

async function deleteOwnedShares(env, uid, historySuffix) {
  await deleteMatchingKeys(env, 'share:', key => key.metadata?.ownerId === uid
    && (historySuffix === undefined || key.metadata.historyKey === historySuffix))
}

async function deleteHistoryItem(env, uid, key) {
  await deleteOwnedShares(env, uid, key.slice(`h:${uid}:`.length))
  await env.KV.delete(key)
}

async function clearHistory(env, uid) {
  await deleteOwnedShares(env, uid)
  await deleteMatchingKeys(env, `h:${uid}:`)
}

// ---------- 模型列表代理 ----------
async function handleModels(request, stateless = false) {
  const { baseUrl, apiKey } = await readBody(request)
  if (!baseUrl || !apiKey) return json({ error: 'baseUrl 和 apiKey 必填' }, 400)
  const endpoint = normalizeBase(String(baseUrl).trim()) + '/models'
  if (stateless && !isHttpsDomainTarget(endpoint)) return json({ error: '免登录模式仅支持 HTTPS 域名接口，不支持 IP 或本地名称' }, 400)
  try {
    const r = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${apiKey}` }, ...(stateless ? { redirect: 'manual' } : {}) }, 30000)
    const text = await r.text()
    if (!r.ok) return json({ error: `HTTP ${r.status}: ${text.slice(0, 500)}` }, r.status)
    let data
    try { data = JSON.parse(text) } catch { return json({ error: '响应不是 JSON：' + text.slice(0, 300) }, 502) }
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null
    if (!list) return json({ error: '无法从响应中解析模型列表', raw: text.slice(0, 500) }, 502)
    const models = list.map(m => ({
      id: m.id ?? m.model ?? m.name ?? String(m),
      owned_by: m.owned_by ?? null,
      created: m.created ?? null,
    })).filter(m => m.id)
    return json({ models, endpoint })
  } catch (e) {
    return json({ error: '请求失败：' + (e?.message || String(e)) }, 502)
  }
}

// ---------- 检测请求转发 ----------
const PROXY_ALLOWED_HEADERS = new Set([
  'authorization', 'content-type', 'accept', 'user-agent',
  'anthropic-version', 'anthropic-beta', 'x-api-key', 'openai-organization', 'openai-project',
])

async function handleProxy(request, url, stateless = false) {
  const target = url.searchParams.get('url')
  if (!target) return json({ error: '缺少 url 参数' }, 400)
  let targetUrl
  try { targetUrl = new URL(target) } catch { return json({ error: 'url 参数无效' }, 400) }
  if (!/^https?:$/.test(targetUrl.protocol)) return json({ error: '仅支持 http/https' }, 400)

  if (stateless && !isHttpsDomainTarget(targetUrl.href)) {
    return json({ error: '免登录模式仅支持 HTTPS 域名接口，不支持 IP 或本地名称' }, 400)
  }

  const headers = {}
  for (const [k, v] of request.headers.entries()) {
    if (PROXY_ALLOWED_HEADERS.has(k.toLowerCase())) headers[k] = v
  }
  if (!headers['content-type']) headers['content-type'] = 'application/json'

  // 保留原始请求方法：参考数据是静态 GET，如果一律按 POST 转发，CDN 会返回 405。
  // 读取类方法不携带 body，避免部分上游对 GET + body 直接报错。
  const method = /^(GET|HEAD)$/i.test(request.method) ? 'GET' : 'POST'
  try {
    const body = method === 'GET' ? undefined : await request.arrayBuffer()
    const upstream = await fetch(targetUrl.href, {
      method,
      headers,
      body: body?.byteLength ? body : undefined,
      ...(stateless ? { redirect: 'manual' } : {}),
    })
    if (stateless && upstream.status >= 300 && upstream.status < 400) {
      return json({ error: '免登录模式不跟随上游重定向，请填写最终接口地址' }, 502)
    }
    const respHeaders = new Headers()
    const ct = upstream.headers.get('content-type')
    if (ct) respHeaders.set('content-type', ct)
    respHeaders.set('Access-Control-Allow-Origin', '*')
    respHeaders.set('Cache-Control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  } catch (e) {
    return json({ error: '转发失败：' + (e?.message || String(e)) }, 502)
  }
}

// ---------- 参考数据代理（带边缘缓存）----------
const DATA_SOURCES = ['https://lm.ikale.io/data/', 'https://cdn.jsdmirror.com/npm/lmfpd-data@latest/']

async function handleDataProxy(request, ctx, url, cacheEnabled = true) {
  const rel = url.pathname.slice('/api/data/'.length)
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(rel)) return json({ error: '路径无效' }, 400)

  const cache = cacheEnabled ? caches.default : null
  const cacheKey = new Request(url.href, { method: 'GET' })
  let res = cache ? await cache.match(cacheKey) : null
  if (res) return res

  let lastErr
  for (const source of DATA_SOURCES) {
    try {
      const upstream = await fetchWithTimeout(source + rel, {}, 120000)
      if (!upstream.ok) { lastErr = new Error(`HTTP ${upstream.status}`); continue }
      res = new Response(upstream.body, upstream)
      res.headers.set('Cache-Control', cacheEnabled ? 'public, max-age=86400' : 'no-store')
      res.headers.set('Access-Control-Allow-Origin', '*')
      if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()))
      return res
    } catch (e) {
      lastErr = e
    }
  }
  return json({ error: '参考数据获取失败：' + (lastErr?.message || 'unknown') }, 502)
}

// 免登录代理不接受 IP 字面量、本地主机、内网名称或 URL 内嵌凭据。
// 不自动跟随重定向，避免已检查的目标被替换。
function isHttpsDomainTarget(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    return url.protocol === 'https:' && !url.username && !url.password
      && (!url.port || url.port === '443')
      && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*$/.test(host)
      && !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)
  } catch { return false }
}

// ---------- 工具 ----------
function normalizeBase(base) {
  base = base.replace(/\/+$/, '')
  try {
    const u = new URL(base)
    if (u.pathname === '' || u.pathname === '/') return base + '/v1'
    return base
  } catch { return base }
}

function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error('超时')), timeoutMs)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

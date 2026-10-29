// Cloudflare Turnstile 封装：按需加载官方脚本并渲染组件。
// 站点密钥由 /api/config 下发，未配置时该接口返回空串，整块逻辑自动跳过——
// 因此本地开发不需要任何额外配置。

import { loadRuntime, runtime } from './runtime'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let siteKeyPromise = null
let scriptPromise = null
let widgetId = null

/** 读取站点密钥；结果缓存，避免每页重复请求 */
export function getSiteKey() {
  if (!siteKeyPromise) {
    siteKeyPromise = loadRuntime().then(() => runtime.turnstileSiteKey)
  }
  return siteKeyPromise
}

function loadScript() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.defer = true
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile 加载失败')))
    el.onerror = () => reject(new Error('Turnstile 加载失败'))
    document.head.appendChild(el)
  })
  return scriptPromise
}

/**
 * 在指定容器里渲染验证组件。
 * @returns {Promise<string>} 返回 widget id，未启用时返回空串
 */
export async function renderTurnstile(container, handlers = {}) {
  if (!container) return ''
  const siteKey = await getSiteKey()
  if (!siteKey) return ''

  try {
    const turnstile = await loadScript()
    // 同一容器重复渲染时先清掉旧组件，避免出现两个
    if (widgetId !== null) {
      try { turnstile.remove(widgetId) } catch { /* 组件可能已被移除 */ }
      widgetId = null
    }
    container.innerHTML = ''
    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      language: document.documentElement.lang?.startsWith('en') ? 'en' : 'zh-cn',
      callback: (token) => handlers.onSuccess?.(token),
      'expired-callback': () => handlers.onExpire?.(),
      'error-callback': () => handlers.onError?.(),
    })
    return widgetId
  } catch (e) {
    handlers.onError?.(e)
    return ''
  }
}

/** 提交失败后重置，拿到新的 token（Turnstile 的 token 是一次性的） */
export function resetTurnstile() {
  if (widgetId !== null && window.turnstile) {
    try { window.turnstile.reset(widgetId) } catch { /* 忽略 */ }
  }
}

/** 当前是否启用了人机验证 */
export async function turnstileEnabled() {
  return !!(await getSiteKey())
}

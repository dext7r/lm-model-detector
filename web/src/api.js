const TOKEN_KEY = 'lmfpd_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token
  let res
  try {
    res = await fetch(path, { ...opts, headers })
  } catch {
    throw new Error('网络请求失败，请检查连接后重试')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearToken()
    onUnauthorized()
    throw new Error(data.error || '未登录或会话已过期')
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const postJSON = (path, body) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const putJSON = (path, body) =>
  api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const del = (path) => api(path, { method: 'DELETE' })

export function buildQuery(obj) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, v === true ? '1' : String(v))
  }
  const s = q.toString()
  return s ? '?' + s : ''
}

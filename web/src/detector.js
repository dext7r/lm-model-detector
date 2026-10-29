// 检测器封装：SDK 在浏览器运行；跨域请求经服务端 /api/proxy 转发

// SDK 产物由 `npm run build:sdk` (esbuild) 生成到 src/vendor/ 下，是标准的 ESM 模块。
// 之所以不放在 public/：public 里的文件不经过 Vite 的模块处理，dev 与 build 都只允许
// 通过 HTML 标签引用，源码里 import 会被直接拦截。放进 src 后走正常的依赖图，
// 既能被 tree-shaking / 压缩，也不需要任何 @vite-ignore 之类的绕过手段。
import { loadDetector, DEFAULT_DATA_URLS } from './vendor/lmfpd.browser.js'

let detectorPromise = null
const nativeFetch = window.fetch.bind(window)
if (!window.__lmfpdFetchPatched) {
  window.fetch = function (input, init = {}) {
    const raw = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
    if (/^https?:/i.test(raw)) {
      const u = new URL(raw, location.href)
      if (u.origin !== location.origin) {
        const headers = {}
        new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v })
        // 会话令牌单独走一个 header：原有的 Authorization 里装的是上游 API Key，
        // 若被复用去鉴权，服务端校验必然失败并返回 401。
        const token = localStorage.getItem('lmfpd_token')
        if (token) headers['X-LMFPD-Session'] = token
        // 默认方法必须是 GET：参考数据（bundle.json 等）是静态资源，被当成 POST 转发
        // 会被 CDN 判为 405。只有确实带了 body 或显式声明时才按 POST 走上游。
        const method = (init.method || (init.body ? 'POST' : 'GET')).toUpperCase()
        const isRead = method === 'GET' || method === 'HEAD'
        return nativeFetch('/api/proxy?url=' + encodeURIComponent(u.href), {
          method,
          headers,
          body: isRead ? undefined : init.body,
          signal: init.signal,
        })
      }
    }
    return nativeFetch(input, init)
  }
  window.__lmfpdFetchPatched = true
}

let dataReady = false

export async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = loadDetector({
      source: [location.origin + '/api/data/', ...DEFAULT_DATA_URLS],
    })
      .then(det => { dataReady = true; return det })
      .catch(err => {
        detectorPromise = null
        throw err
      })
  }
  return detectorPromise
}

export const isDataReady = () => dataReady

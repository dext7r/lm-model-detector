import { computed, reactive } from 'vue'

// 模式由服务端实际绑定决定；读取失败时保留 unknown，不猜测为免登录。
export const runtime = reactive({ mode: null, turnstileSiteKey: '' })
export const accountMode = computed(() => runtime.mode === 'account')
export const isAccountMode = () => accountMode.value

let pending
export function loadRuntime() {
  if (!pending) {
    pending = (async () => {
      const response = await fetch('/api/config', {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('Deployment configuration unavailable')
      const data = await response.json()
      if (!['account', 'stateless'].includes(data.mode)) {
        throw new Error('Invalid deployment mode')
      }
      runtime.mode = data.mode
      runtime.turnstileSiteKey = data.turnstileSiteKey || ''
    })().catch(error => {
      pending = null
      throw error
    })
  }
  return pending
}

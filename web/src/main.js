import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { setUnauthorizedHandler, setDeletionPendingHandler } from './api'
import { auth, stopBatch } from './store'
import { initTheme } from './theme'
import { initLocale, locale } from './i18n'
import { applySeo } from './seo'
import { watch } from 'vue'
import { loadRuntime, isAccountMode } from './runtime'
import { t } from './i18n'


// 语言切换后同步 head 里的标题与描述，避免界面与 SEO 文案不一致
watch(locale, () => applySeo(location.pathname))

setUnauthorizedHandler(() => {
  if (!isAccountMode()) return
  auth.user = null
  if (router.currentRoute.value.name !== 'login') router.replace({ name: 'login' })
})

setDeletionPendingHandler(() => {
  stopBatch()
  if (isAccountMode() && router.currentRoute.value.name !== 'account') router.replace({ name: 'account' })
})

async function start() {
  const root = document.getElementById('app')
  try {
    await loadRuntime()
    initTheme()
    initLocale()
    root.replaceChildren()
    createApp(App).use(router).mount(root)
  } catch {
    // 配置读取失败时不挂载业务页面，也不猜测部署模式。
    root.replaceChildren()
    const panel = document.createElement('div')
    panel.className = 'mx-auto max-w-xl p-8 text-center'
    const message = document.createElement('p')
    message.textContent = t('runtime.failed')
    const retry = document.createElement('button')
    retry.className = 'btn mt-4'
    retry.textContent = t('common.retry')
    retry.addEventListener('click', () => {
      retry.disabled = true
      void start()
    }, { once: true })
    panel.append(message, retry)
    root.append(panel)
  }
}

void start()

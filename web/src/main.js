import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { setUnauthorizedHandler } from './api'
import { auth } from './store'
import { initTheme } from './theme'
import { initLocale, locale } from './i18n'
import { applySeo } from './seo'
import { watch } from 'vue'

initTheme()
initLocale()

// 语言切换后同步 head 里的标题与描述，避免界面与 SEO 文案不一致
watch(locale, () => applySeo(location.pathname))

setUnauthorizedHandler(() => {
  auth.user = null
  if (router.currentRoute.value.name !== 'login') router.replace({ name: 'login' })
})

createApp(App).use(router).mount('#app')

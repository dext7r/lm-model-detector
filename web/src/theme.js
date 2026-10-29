import { ref } from 'vue'

// 主题只存在浏览器本地：它属于显示偏好，没必要同步到账户。
const STORAGE_KEY = 'lmfpd_theme'
const MODES = ['dark', 'light']

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (MODES.includes(v)) return v
  } catch { /* 隐私模式下 localStorage 可能抛错，忽略即可 */ }
  // 未显式选择过时跟随系统偏好
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const theme = ref(readStored())

export function applyTheme(mode) {
  const next = MODES.includes(mode) ? mode : 'dark'
  theme.value = next
  document.documentElement.dataset.theme = next
  // 让原生控件（滚动条、表单、日期选择器）跟随主题
  document.documentElement.style.colorScheme = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 忽略写入失败 */ }
}

export function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}

// 首次挂载时同步一次 DOM 状态；index.html 里的内联脚本已提前设好属性，
// 这里只负责把 Vue 的响应式状态与之一致，避免首屏闪一下。
export function initTheme() {
  document.documentElement.dataset.theme = theme.value
  document.documentElement.style.colorScheme = theme.value
}

// 前端路由级 SEO：SPA 内部跳转不会重新加载 HTML，需要手动更新 head。
// 所有绝对地址都取 location.origin，不写死域名，便于同产物多域名部署。

import { t, locale } from './i18n'
import { isAccountMode } from './runtime'

const SITE_KEYWORDS =
  '模型指纹检测,AI 模型识别,API 模型检测,LLM 指纹,模型指纹,接口模型识别,claude,gpt,大模型检测,model fingerprint,llm detection'

// 路由 → i18n 词条前缀，标题与描述跟随当前语言
const ROUTES = [
  { match: /^\/$/, key: 'seo.home' },
  { match: /^\/detect/, key: 'seo.detect' },
  { match: /^\/configs/, key: 'seo.configs' },
  { match: /^\/history/, key: 'seo.history' },
  { match: /^\/s\//, key: 'seo.share' },
  { match: /^\/login/, key: 'seo.login' },
]

function metaForPath(pathname) {
  const route = ROUTES.find(r => r.match.test(pathname)) || ROUTES[0]
  return {
    title: t(route.key + '.title'),
    description: !isAccountMode() && route.key === 'seo.configs' ? t('stateless.notice') : t(route.key + '.desc'),
  }
}

function upsert(selector, create) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  return el
}

function setMeta(name, content, attr = 'name') {
  if (!content) return
  const el = upsert(`meta[${attr}="${name}"]`, () => {
    const m = document.createElement('meta')
    m.setAttribute(attr, name)
    return m
  })
  el.setAttribute('content', content)
}

function setLink(rel, href) {
  const el = upsert(`link[rel="${rel}"]`, () => {
    const l = document.createElement('link')
    l.setAttribute('rel', rel)
    return l
  })
  el.setAttribute('href', href)
}

/** 按当前路由更新 title / description / canonical / OG 标签 */
export function applySeo(pathname = location.pathname) {
  const meta = metaForPath(pathname)
  const origin = location.origin
  const canonical = origin + pathname
  // 私有页面（历史详情、配置编辑）不参与索引
  const noindex = /^\/history\/|^\/configs\//.test(pathname)

  document.title = meta.title
  setMeta('description', meta.description)
  setMeta('keywords', SITE_KEYWORDS)
  setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
  setLink('canonical', canonical)

  setMeta('og:type', 'website', 'property')
  setMeta('og:site_name', t('common.appName'), 'property')
  setMeta('og:title', meta.title, 'property')
  setMeta('og:description', meta.description, 'property')
  setMeta('og:url', canonical, 'property')
  setMeta('og:image', origin + '/og.png', 'property')
  setMeta('og:locale', locale.value === 'zh' ? 'zh_CN' : 'en_US', 'property')

  setMeta('twitter:card', 'summary_large_image')
  setMeta('twitter:title', meta.title)
  setMeta('twitter:description', meta.description)
  setMeta('twitter:image', origin + '/og.png')

  setLink('alternate', origin + '/rss.xml')
}

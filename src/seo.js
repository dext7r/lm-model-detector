// SEO 支持：所有绝对地址都在运行时由请求的 origin 推导，不写死域名。
// 这样同一份产物可以同时挂在多个域名下（自定义域、workers.dev 子域等），
// canonical、sitemap、RSS 里的链接永远与访问者实际使用的域名一致。
// 文案按 Accept-Language 选择中英文，爬虫与用户看到一致的语言。

const SITE_KEYWORDS =
  '模型指纹检测,AI 模型识别,API 模型检测,LLM 指纹,模型指纹,接口模型识别,claude,gpt,大模型检测,model fingerprint,llm detection'

const DICT = {
  zh: {
    name: 'LM 模型指纹检测',
    desc: '通过采样接口返回的数字序列，识别 API 背后真实调用的语言模型。浏览器内计算评分，支持批量检测与可选的账户存储。',
    routes: [
      { match: /^\/$/, title: 'LM 模型指纹检测 · 识别 API 背后的真实模型', description: null },
      { match: /^\/detect/, title: '批量检测 · LM 模型指纹检测', description: '勾选模型后批量检测接口背后真实调用的模型，支持并发、严格模式与结果分享。' },
      { match: /^\/configs/, title: '配置管理 · LM 模型指纹检测', description: '保存多组 Base URL 与 API Key，检测时按需切换，配置按账户隔离。' },
      { match: /^\/history/, title: '历史记录 · LM 模型指纹检测', description: '查看、搜索并导出历次模型指纹检测结果。' },
      { match: /^\/s\//, title: '检测结果分享 · LM 模型指纹检测', description: '查看一份公开的模型指纹检测结果，包含识别结论与 Top 候选。' },
      { match: /^\/account/, title: '账户设置 · LM 模型指纹检测', description: '管理账户、删除已保存的数据或永久注销账户。' },
      { match: /^\/login/, title: '登录 · LM 模型指纹检测', description: '登录后即可使用模型指纹检测，配置与检测结果保存到你的账户。' },
    ],
  },
  en: {
    name: 'LM Fingerprint',
    desc: 'Sample the numeric sequences an endpoint returns to identify the language model actually serving it. Browser-based scoring, batch detection and optional account storage.',
    routes: [
      { match: /^\/$/, title: 'LM Fingerprint · See the real model behind any API', description: null },
      { match: /^\/detect/, title: 'Batch detect · LM Fingerprint', description: 'Select models and detect what each endpoint really runs, with concurrency, strict mode and shareable results.' },
      { match: /^\/configs/, title: 'Configs · LM Fingerprint', description: 'Store multiple Base URLs and API keys, switched as needed and isolated per account.' },
      { match: /^\/history/, title: 'History · LM Fingerprint', description: 'Browse, search and export past model fingerprint results.' },
      { match: /^\/s\//, title: 'Shared result · LM Fingerprint', description: 'A publicly shared model fingerprint result with verdict and top candidates.' },
      { match: /^\/account/, title: 'Account settings · LM Fingerprint', description: 'Manage your account, delete saved data or permanently close your account.' },
      { match: /^\/login/, title: 'Sign in · LM Fingerprint', description: 'Sign in to use model fingerprint detection. Configs and results are saved to your account.' },
    ],
  },
}

/** 从 Accept-Language 里挑语言：中文优先，其余回落英文 */
export function pickLang(acceptLanguage = '') {
  const v = String(acceptLanguage).toLowerCase()
  if (v.includes('zh')) return 'zh'
  if (v.includes('en')) return 'en'
  return 'zh'
}

/** 需要进 sitemap 的静态路由（登录 / 配置等私密页不收录） */
const PUBLIC_ROUTES = ['/', '/detect', '/login']

export function metaForPath(pathname, lang = 'zh') {
  const dict = DICT[lang] || DICT.zh
  const route = dict.routes.find(r => r.match.test(pathname)) || dict.routes[0]
  return {
    title: route.title,
    description: route.description || dict.desc,
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * 把 TDK / OG / canonical 注入到 index.html。
 * @param {string} html   构建产物
 * @param {URL} url       当前请求地址（取 origin 与 pathname）
 */
export function injectSeo(html, url, lang = 'zh') {
  const dict = DICT[lang] || DICT.zh
  const meta = metaForPath(url.pathname, lang)
  const title = escapeHtml(meta.title)
  const desc = escapeHtml(meta.description)
  const canonical = escapeHtml(url.origin + url.pathname)
  // 详情类页面（历史记录、分享）是用户私有或一次性内容，不参与索引
  const noindex = /^\/history\/|^\/configs\/|^\/account(?:\/|$)/.test(url.pathname)
  const robots = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'

  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<meta name="keywords" content="${escapeHtml(SITE_KEYWORDS)}" />`,
    `<meta http-equiv="content-language" content="${lang === 'zh' ? 'zh-CN' : 'en'}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(dict.name)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${escapeHtml(url.origin + '/og.png')}" />`,
    `<meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${escapeHtml(url.origin + '/og.png')}" />`,
    `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(dict.name)}" href="${escapeHtml(url.origin + '/rss.xml')}" />`,
  ].join('\n  ')

  // index.html 里以 <!--seo--> 作为占位；缺省时插到 </head> 前
  if (html.includes('<!--seo-->')) {
    // 先移除模板里的兜底 title/description，否则注入后会出现两个 title，
    // 爬虫可能取到错误的那一个。
    const cleaned = html
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
    return cleaned.replace('<!--seo-->', head)
  }
  return html.replace('</head>', `  ${head}\n</head>`)
}

export function robotsTxt(url) {
  return [
    'User-agent: *',
    'Allow: /$',
    'Allow: /detect',
    'Allow: /login',
    'Allow: /s/',
    'Disallow: /api/',
    'Disallow: /configs',
    'Disallow: /history',
    'Disallow: /account',
    '',
    `Sitemap: ${url.origin}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * sitemap：静态页 + 最近的公开分享页。
 * @param {URL} url
 * @param {Array<{name: string, metadata?: object}>} shareKeys KV list 得到的 key
 */
export function sitemapXml(url, shareKeys = [], accountMode = true) {
  const urls = [
    ...PUBLIC_ROUTES.filter(p => accountMode || p !== '/login').map(p => ({ loc: url.origin + p, priority: p === '/' ? '1.0' : '0.8' })),
    ...shareKeys.map(k => ({
      loc: `${url.origin}/s/${k.name.slice('share:'.length)}`,
      priority: '0.5',
      lastmod: k.metadata?.uploaded ? new Date(k.metadata.uploaded).toISOString().slice(0, 10) : undefined,
    })),
  ]

  const body = urls.map(u => [
    '  <url>',
    `    <loc>${escapeHtml(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`
}

/**
 * RSS：把最近的分享结果作为条目，方便被聚合器收录。
 * @param {URL} url
 * @param {Array<object>} shares 分享快照数组
 */
export function rssXml(url, shares = [], lang = 'zh') {
  const dict = DICT[lang] || DICT.zh
  const items = shares.map(s => {
    const link = `${url.origin}/s/${s.id}`
    const title = `${s.model} → ${s.prediction_name || s.prediction || '未识别'}`
    const desc = [
      s.probability != null ? `置信度 ${(s.probability * 100).toFixed(1)}%` : '',
      s.ranking_score != null ? `排名分 ${s.ranking_score.toFixed(3)}` : '',
      s.used_outputs != null ? `有效样本 ${s.used_outputs}/3` : '',
    ].filter(Boolean).join(' · ')
    const date = s.time ? new Date(s.time).toUTCString() : new Date().toUTCString()
    return [
      '    <item>',
      `      <title>${escapeHtml(title)}</title>`,
      `      <link>${escapeHtml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeHtml(link)}</guid>`,
      `      <description>${escapeHtml(desc)}</description>`,
      `      <pubDate>${date}</pubDate>`,
      '    </item>',
    ].join('\n')
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(dict.name)} · ${lang === 'zh' ? '检测结果' : 'Results'}</title>
    <link>${escapeHtml(url.origin)}</link>
    <description>${escapeHtml(dict.desc)}</description>
    <language>${lang === 'zh' ? 'zh-CN' : 'en'}</language>
    <atom:link href="${escapeHtml(url.origin + '/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`
}

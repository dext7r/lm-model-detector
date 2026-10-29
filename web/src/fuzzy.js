// 轻量模糊匹配：模型名这类短标识不需要引入 fuse.js 之类的依赖。
// 打分规则优先级：连续子串 > 词首命中 > 顺序散列命中；
// 多个关键词（空格分隔）视为「与」，每个词都必须命中，分数相加。

const BOUNDARY = /[-_./:@\s]/

/**
 * 单个关键词对目标串的打分。
 * @returns {number|null} null 表示不命中
 */
export function fuzzyScore(query, target) {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1
  if (!t) return null

  // 1. 连续子串：最符合直觉的匹配，位置越靠前越好
  const idx = t.indexOf(q)
  if (idx === 0) return 1000 + q.length
  if (idx > 0) {
    const bonus = BOUNDARY.test(t[idx - 1]) ? 120 : 0
    return 800 + q.length + bonus - Math.min(idx, 100)
  }

  // 2. 顺序散列匹配，逐字符扫描并累计连续性奖励
  let score = 0
  let ti = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    const at = t.indexOf(ch, ti)
    if (at === -1) return null
    const prev = at > 0 ? t[at - 1] : ''
    score += 10
    if (at === 0 || BOUNDARY.test(prev)) score += 25
    if (at === ti && streak > 0) score += 12 * Math.min(streak, 4)
    streak = at === ti ? streak + 1 : 0
    ti = at + 1
  }
  // 命中越紧凑、目标越短，越可能是用户想找的那条
  const spread = ti - (t.indexOf(q[0]) + 1)
  return score - Math.min(spread, 60) - Math.min(t.length / 4, 20)
}

/**
 * 过滤并按相关度排序；空关键词返回原列表。
 * @param {string[]} list
 * @param {string} query 空格分隔的多个关键词，全部命中才算匹配
 */
export function fuzzyFilter(list, query) {
  const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return list

  const scored = []
  for (const item of list) {
    let total = 0
    let ok = true
    for (const term of terms) {
      const s = fuzzyScore(term, item)
      if (s === null) { ok = false; break }
      total += s
    }
    if (ok) scored.push({ item, score: total })
  }
  // 同分时按名称排序，保证结果稳定（避免每次输入抖动）
  scored.sort((a, b) => b.score - a.score || a.item.localeCompare(b.item))
  return scored.map(s => s.item)
}

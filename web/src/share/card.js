// 分享卡片渲染：纯 canvas 手绘，不引入 html2canvas 之类的重型依赖。
// 输出 2x 分辨率 PNG，便于在微信/推特等场景下清晰显示。
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const COLOR = {
  bg: '#070b10',
  panel: '#0f161f',
  panelLine: '#1e2a38',
  chalk: '#e6edf5',
  mute: '#7d8b9e',
  signal: '#2fe3b0',
  sky: '#38bdf8',
  warn: '#f5b544',
  danger: '#f87171',
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function decisionLabel(rec) {
  if (rec.decision === 'scored') return { text: '已评分', color: COLOR.signal }
  if (rec.decision === 'partial') return { text: '部分有效', color: COLOR.warn }
  if (rec.decision === 'not_model') return { text: '非语言模型', color: COLOR.warn }
  if (rec.decision === 'unscorable') return { text: '无法评分', color: COLOR.danger }
  return { text: '无结果', color: COLOR.mute }
}

/**
 * 绘制分享卡片。
 * @param {object} rec   检测记录快照
 * @param {object} opts  { siteUrl, detectUrl }
 * @returns {Promise<Blob>} PNG blob
 */
export async function renderShareCard(rec, opts = {}) {
  const W = 720
  const PAD = 36
  const scale = 2
  const top = (rec.top || []).slice(0, 3)

  // 高度按内容动态计算，避免留白或多行被裁掉
  const H = 300 + top.length * 64 + 92

  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  // 背景
  ctx.fillStyle = COLOR.bg
  ctx.fillRect(0, 0, W, H)

  // 顶部光晕，呼应站点视觉
  const glow = ctx.createRadialGradient(W * 0.16, 0, 0, W * 0.16, 0, 460)
  glow.addColorStop(0, 'rgba(47,227,176,.16)')
  glow.addColorStop(1, 'rgba(47,227,176,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 240)

  // 品牌行
  ctx.fillStyle = COLOR.signal
  ctx.beginPath()
  ctx.arc(PAD + 5, PAD + 6, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = COLOR.chalk
  ctx.font = `600 15px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  ctx.fillText('模型指纹检测', PAD + 20, PAD + 6)

  ctx.fillStyle = COLOR.mute
  ctx.font = `11px ${MONO_STACK}`
  const brandRight = ctx.measureText('LM FINGERPRINT').width
  ctx.textAlign = 'right'
  ctx.fillText('LM FINGERPRINT', W - PAD, PAD + 6)
  ctx.textAlign = 'left'

  // 分隔线
  let y = PAD + 30
  ctx.strokeStyle = COLOR.panelLine
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()

  // 请求的模型
  y += 40
  ctx.fillStyle = COLOR.mute
  ctx.font = `11px ${FONT_STACK}`
  ctx.fillText('请求模型', PAD, y)

  y += 30
  ctx.fillStyle = COLOR.chalk
  ctx.font = `600 26px ${MONO_STACK}`
  ctx.fillText(truncate(ctx, rec.model || '—', W - PAD * 2), PAD, y)

  // 结论徽章
  const badge = decisionLabel(rec)
  ctx.font = `600 12px ${FONT_STACK}`
  const badgeText = badge.text + (rec.probability != null ? `  ${(rec.probability * 100).toFixed(1)}%` : '')
  const bw = ctx.measureText(badgeText).width + 24
  roundRect(ctx, W - PAD - bw, y - 14, bw, 28, 8)
  ctx.fillStyle = hexA(badge.color, 0.14)
  ctx.fill()
  ctx.strokeStyle = hexA(badge.color, 0.38)
  ctx.stroke()
  ctx.fillStyle = badge.color
  ctx.textAlign = 'right'
  ctx.fillText(badgeText, W - PAD - 12, y)
  ctx.textAlign = 'left'

  // 预测结果面板
  y += 34
  const panelH = 96
  roundRect(ctx, PAD, y, W - PAD * 2, panelH, 14)
  ctx.fillStyle = COLOR.panel
  ctx.fill()
  ctx.strokeStyle = COLOR.panelLine
  ctx.stroke()

  ctx.fillStyle = COLOR.mute
  ctx.font = `11px ${FONT_STACK}`
  ctx.fillText('识别为', PAD + 20, y + 26)

  ctx.fillStyle = COLOR.chalk
  ctx.font = `600 22px ${FONT_STACK}`
  ctx.fillText(truncate(ctx, rec.prediction_name || rec.prediction || '—', W - PAD * 2 - 40), PAD + 20, y + 56)

  if (rec.family_prediction_name || rec.family_prediction) {
    ctx.fillStyle = COLOR.mute
    ctx.font = `12px ${FONT_STACK}`
    ctx.fillText(`家族 ${rec.family_prediction_name || rec.family_prediction}`, PAD + 20, y + 78)
  }
  if (rec.ranking_score != null) {
    ctx.fillStyle = COLOR.mute
    ctx.font = `12px ${MONO_STACK}`
    ctx.textAlign = 'right'
    ctx.fillText(`score ${rec.ranking_score.toFixed(3)}`, W - PAD - 20, y + 78)
    ctx.textAlign = 'left'
  }

  // Top 候选
  y += panelH + 28
  if (top.length) {
    ctx.fillStyle = COLOR.mute
    ctx.font = `11px ${FONT_STACK}`
    ctx.fillText('TOP 候选', PAD, y)
    y += 18

    const maxScore = Math.max(...top.map(t => t.score || 0), 0.0001)
    for (const [i, t] of top.entries()) {
      const rowY = y + i * 64

      ctx.fillStyle = i === 0 ? COLOR.signal : COLOR.mute
      ctx.font = `600 13px ${MONO_STACK}`
      ctx.fillText(String(i + 1), PAD + 2, rowY + 12)

      ctx.fillStyle = COLOR.chalk
      ctx.font = `500 14px ${FONT_STACK}`
      ctx.fillText(truncate(ctx, t.display_name || t.model, W - PAD * 2 - 150), PAD + 24, rowY + 8)

      ctx.fillStyle = COLOR.mute
      ctx.font = `11px ${MONO_STACK}`
      ctx.fillText(truncate(ctx, t.model, W - PAD * 2 - 150), PAD + 24, rowY + 26)

      // 条形按「相对最高分」归一，避免出现 248% 这种误导性数字
      const ratio = Math.max(0.02, (t.score || 0) / maxScore)
      const barX = W - PAD - 150
      const barW = 110
      roundRect(ctx, barX, rowY + 6, barW, 6, 3)
      ctx.fillStyle = '#16202e'
      ctx.fill()
      roundRect(ctx, barX, rowY + 6, barW * ratio, 6, 3)
      ctx.fillStyle = i === 0 ? COLOR.signal : hexA(COLOR.sky, 0.55)
      ctx.fill()

      ctx.fillStyle = i === 0 ? COLOR.signal : COLOR.chalk
      ctx.font = `600 12px ${MONO_STACK}`
      ctx.textAlign = 'right'
      ctx.fillText(t.score != null ? t.score.toFixed(3) : '—', W - PAD, rowY + 12)
      ctx.textAlign = 'left'
    }
    y += top.length * 64
  }

  // 页脚：时间 + 站点地址 + 检测站地址
  y += 16
  ctx.strokeStyle = COLOR.panelLine
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()

  y += 26
  ctx.fillStyle = COLOR.mute
  ctx.font = `11px ${MONO_STACK}`
  ctx.fillText(fmtTime(rec.time), PAD, y)

  if (opts.siteUrl) {
    y += 20
    ctx.fillStyle = hexA(COLOR.signal, 0.85)
    ctx.font = `11px ${MONO_STACK}`
    ctx.fillText(truncate(ctx, '检测站 ' + opts.siteUrl, W - PAD * 2), PAD, y)
  }
  if (opts.detectUrl) {
    ctx.fillStyle = hexA(COLOR.mute, 0.9)
    ctx.font = `10.5px ${MONO_STACK}`
    ctx.fillText(truncate(ctx, '复现检测 ' + opts.detectUrl, W - PAD * 2), PAD, y + 18)
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('图片生成失败'))), 'image/png')
  })
}

function truncate(ctx, text, maxWidth) {
  const s = String(text ?? '')
  if (ctx.measureText(s).width <= maxWidth) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, lo) + '…'
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 触发浏览器下载；支持 share target 的环境优先走系统分享面板 */
export async function downloadOrShareImage(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      // 用户取消不算错误，继续走下载
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
  return 'downloaded'
}

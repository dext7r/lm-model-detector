// 生成 OG 分享图：不引入 canvas/sharp 之类的依赖，直接用 zlib 手写 PNG。
// 画面只包含品牌几何元素（深底 + 网格 + 信号圆环），不依赖字体渲染，
// 因此在任何环境下生成的产物都一致。
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 1200
const H = 630

const INK = [7, 11, 16]
const GRID = [255, 255, 255]
const SIGNAL = [47, 227, 176]
const SKY = [56, 189, 248]

const px = new Uint8Array(W * H * 3)

function setPx(x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 3
  px[i] = px[i] * (1 - a) + r * a
  px[i + 1] = px[i + 1] * (1 - a) + g * a
  px[i + 2] = px[i + 2] * (1 - a) + b * a
}

// 底色
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    px[i] = INK[0]
    px[i + 1] = INK[1]
    px[i + 2] = INK[2]
  }
}

// 左上/右上的品牌光晕
function glow(cx, cy, radius, color, strength) {
  for (let y = Math.max(0, cy - radius); y < Math.min(H, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x < Math.min(W, cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy) / radius
      if (d >= 1) continue
      const a = strength * (1 - d) ** 2
      setPx(x, y, color[0], color[1], color[2], a)
    }
  }
}
glow(140, -40, 760, SIGNAL, 0.22)
glow(1080, -60, 640, SKY, 0.16)

// 44px 网格
for (let y = 0; y < H; y += 44) {
  for (let x = 0; x < W; x++) setPx(x, y, GRID[0], GRID[1], GRID[2], 0.022)
}
for (let x = 0; x < W; x += 44) {
  for (let y = 0; y < H; y++) setPx(x, y, GRID[0], GRID[1], GRID[2], 0.022)
}

// 信号圆环 + 核心点
const cx = W / 2
const cy = H / 2 - 30
function ring(r, thickness, color, alpha) {
  for (let y = cy - r - thickness; y <= cy + r + thickness; y++) {
    for (let x = cx - r - thickness; x <= cx + r + thickness; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (Math.abs(d - r) <= thickness) {
        const edge = 1 - Math.abs(d - r) / thickness
        setPx(x, y, color[0], color[1], color[2], alpha * edge)
      }
    }
  }
}
ring(150, 2.5, SIGNAL, 0.45)
ring(96, 1.5, SIGNAL, 0.22)
ring(210, 1.5, SKY, 0.12)

for (let y = cy - 26; y <= cy + 26; y++) {
  for (let x = cx - 26; x <= cx + 26; x++) {
    const d = Math.hypot(x - cx, y - cy)
    if (d <= 26) setPx(x, y, SIGNAL[0], SIGNAL[1], SIGNAL[2], Math.min(1, (26 - d) / 2))
  }
}

// 扫描横线
for (let y = cy - 150; y < cy + 150; y++) {
  const a = 0.05 * (1 - Math.abs(y - cy) / 150)
  for (let x = 0; x < W; x++) setPx(x, y, SIGNAL[0], SIGNAL[1], SIGNAL[2], a * 0.3)
}

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8      // bit depth
ihdr[9] = 2      // color type: truecolor

// 每行前置一个 filter 字节（0 = None）
const raw = Buffer.alloc((W * 3 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../web/public/og.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`已生成 ${out} (${W}x${H}, ${(png.length / 1024).toFixed(1)} KB)`)

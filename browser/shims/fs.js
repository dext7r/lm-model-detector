// 内存 fs shim：让 lmfpd-sdk 在浏览器中运行
// readCache 失败 -> 触发在线下载；writeCache 失败被 SDK 内部捕获，无副作用
const mem = new Map()

export async function mkdir() {}
export async function rename() {}
export async function rm() {}
export async function utimes() {}
export async function writeFile(path, data) {
  mem.set(String(path), data instanceof Uint8Array ? data : new TextEncoder().encode(String(data)))
}
export async function readFile(path) {
  const data = mem.get(String(path))
  if (!data) {
    const err = new Error(`ENOENT: ${path}`)
    err.code = 'ENOENT'
    throw err
  }
  return data
}
export async function stat(path) {
  const data = await readFile(path)
  return { mtimeMs: Date.now(), size: data.length }
}

// 供宿主环境预填充内存缓存（可选）
export function __setMemFile(path, data) {
  mem.set(String(path), data)
}
export function __getMemFile(path) {
  return mem.get(String(path))
}

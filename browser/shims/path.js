function join(...parts) {
  const joined = parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/')
  return joined
}
function dirname(p) {
  const i = String(p).lastIndexOf('/')
  return i <= 0 ? '/' : String(p).slice(0, i)
}
function basename(p) {
  return String(p).split('/').pop()
}
function resolve(...parts) {
  return join(...parts)
}
export { join, dirname, basename, resolve }
export default { join, dirname, basename, resolve }

function noop() {}
const util = new Proxy({}, {
  get: (t, k) => {
    if (k === 'inspect') return (v) => String(v)
    if (k === 'promisify') return (fn) => fn
    return noop
  },
})
export { util as default }
export const inspect = (v) => String(v)
export const promisify = (fn) => fn
export const format = (...a) => a.map(String).join(' ')
export const debuglog = () => noop
export function stripVTControlCharacters(s) {
  return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

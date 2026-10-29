import { api, postJSON, putJSON, del } from './api'
import { isAccountMode } from './runtime'

// 每个页面实例单独持有配置，不发往配置 API，也不写入浏览器存储。
const temporaryConfigs = new Map()
const copyConfig = config => ({ ...config })

export async function listConfigs() {
  if (isAccountMode()) return api('/api/configs')
  return Array.from(temporaryConfigs.values(), copyConfig)
}

export async function saveConfig(input, id) {
  const body = {
    name: input.name.trim(), baseUrl: input.baseUrl.trim(), apiKey: input.apiKey.trim(),
  }
  if (isAccountMode()) {
    return id
      ? putJSON('/api/configs/' + encodeURIComponent(id), body)
      : postJSON('/api/configs', body)
  }
  const existing = id ? temporaryConfigs.get(id) : null
  if (id && !existing) throw new Error('配置不存在 / Config not found')
  const config = {
    ...body, id: id || 'cfg_' + crypto.randomUUID(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  }
  temporaryConfigs.set(config.id, config)
  return copyConfig(config)
}

export async function removeConfig(id) {
  if (isAccountMode()) return del('/api/configs/' + encodeURIComponent(id))
  temporaryConfigs.delete(id)
}

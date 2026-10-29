<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadConfigs, configCache, postJSON, toast, resetModels, modelState, detectTask } from '../store'
import { saveConfig, removeConfig } from '../configs'
import { accountMode } from '../runtime'
import { t } from '../i18n'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => route.params.id === 'new' || route.name === 'config-new')
const form = ref({ name: '', baseUrl: '', apiKey: '' })
const showKey = ref(false)
const saving = ref(false)
const deleting = ref(false)
const testing = ref(false)
const testResult = ref(null)
const notFound = ref(false)
const loading = ref(true)

async function save() {
  if (!form.value.name.trim() || !form.value.baseUrl.trim() || !form.value.apiKey.trim()) {
    return toast(t('configForm.needAll'), 'warn')
  }
  if (!/^https?:\/\//i.test(form.value.baseUrl.trim())) {
    return toast(t('configForm.needHttp'), 'warn')
  }
  saving.value = true
  try {
    const body = {
      name: form.value.name.trim(),
      baseUrl: form.value.baseUrl.trim(),
      apiKey: form.value.apiKey.trim(),
    }
    const saved = await saveConfig(body, isNew.value ? undefined : route.params.id)
    configCache.list = null
    if (resetModels) resetModels(null)
    toast(t(isNew.value ? 'configForm.saved' : 'configForm.updated'), 'ok')
    const back = route.query.return
    router.replace(back ? `${back}${back.includes('?') ? '&' : '?'}config=${encodeURIComponent(saved.id)}` : '/configs')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function test() {
  if (!form.value.baseUrl.trim() || !form.value.apiKey.trim()) {
    return toast(t('configForm.needUrlKey'), 'warn')
  }
  testing.value = true
  testResult.value = null
  try {
    const res = await postJSON('/api/models', {
      baseUrl: form.value.baseUrl.trim(),
      apiKey: form.value.apiKey.trim(),
    })
    testResult.value = { ok: true, text: `${t('configForm.testOk')} · ${t('configForm.testOkDesc', { n: res.models.length })}`, endpoint: res.endpoint }
  } catch (e) {
    testResult.value = { ok: false, text: e.message }
  } finally {
    testing.value = false
  }
}

async function remove() {
  if (deleting.value || detectTask.running) return
  if (!confirm(t(accountMode.value ? 'configForm.deleteHint' : 'stateless.deleteConfirm'))) return
  deleting.value = true
  try {
    await removeConfig(route.params.id)
    if (modelState.configId === route.params.id) resetModels(null)
    configCache.list = null
    toast(t('configs.deleted'), 'ok')
    router.replace('/configs')
  } catch (e) {
    toast(e.message, 'error')
  } finally { deleting.value = false }
}

onMounted(async () => {
  try {
    const list = await loadConfigs()
    if (!isNew.value) {
      const cfg = list.find(c => c.id === route.params.id)
      if (!cfg) { notFound.value = true; return }
      form.value = { name: cfg.name, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-1.5 text-[12px] text-mute">
      <RouterLink to="/configs" class="hover:text-chalk">{{ t('configs.heading') }}</RouterLink>
      <span class="text-line">/</span>
      <span>{{ isNew ? t('configForm.new') : t('configForm.edit') }}</span>
    </div>

    <div v-if="loading" class="panel h-64 animate-pulse"></div>

    <div v-else-if="notFound" class="panel">
      <div class="flex flex-col items-center px-6 py-14 text-center">
        <div class="mb-3 text-[13px] text-warn">{{ t('configForm.notFoundDesc') }}</div>
        <RouterLink to="/configs" class="btn btn-sm">{{ t('configForm.backToList') }}</RouterLink>
      </div>
    </div>

    <template v-else>
      <div class="mb-5">
        <h1 class="text-[19px] font-semibold tracking-tight">{{ isNew ? t('configForm.new') : t('configForm.edit') }}</h1>
        <p class="mt-1 text-[12.5px] text-mute">{{ t(accountMode ? 'configForm.baseUrlHint' : 'stateless.urlHint') }}</p>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start">
        <form class="panel p-5" autocomplete="off" @submit.prevent="save">
          <label class="label-xs mb-1.5 block">{{ t('configForm.name') }}</label>
          <input v-model="form.name" class="field" maxlength="60" :placeholder="t('configForm.namePlaceholder')" />

          <label class="label-xs mb-1.5 mt-4 block">Base URL</label>
          <input v-model="form.baseUrl" class="field font-mono" spellcheck="false" autocapitalize="off"
                 :placeholder="t('configForm.baseUrlPlaceholder')" />

          <label class="label-xs mb-1.5 mt-4 block">API Key</label>
          <div class="relative">
            <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" class="field pr-16 font-mono"
                   spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="sk-..." />
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11.5px] text-mute hover:text-chalk"
                    @click="showKey = !showKey">{{ showKey ? t('configForm.hide') : t('configForm.show') }}</button>
          </div>
          <p class="mt-2 text-[11.5px] text-mute">{{ t(accountMode ? 'configForm.keyHint' : 'stateless.notice') }}</p>

          <div class="mt-5 flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary flex-1" :disabled="saving || deleting">
              <span v-if="saving" class="size-3.5 animate-spin rounded-full border-2 border-on-signal/40 border-t-on-signal"></span>
              {{ saving ? t('common.saving') : (isNew ? t('configForm.save') : t('configForm.saveEdit')) }}
            </button>
            <button type="button" class="btn flex-1" :disabled="testing" @click="test">
              <span v-if="testing" class="size-3.5 animate-spin rounded-full border-2 border-mute/40 border-t-mute"></span>
              {{ testing ? t('configForm.testing') : t('configForm.test') }}
            </button>
            <RouterLink :to="route.query.return || '/configs'" class="btn btn-ghost">{{ t('common.cancel') }}</RouterLink>
          </div>

          <div v-if="testResult" class="mt-3 rounded-lg border px-3 py-2 text-[12px]"
               :class="testResult.ok ? 'border-signal/35 bg-signal/8 text-signal' : 'border-danger/35 bg-danger/8 text-danger'">
            <div class="flex items-center gap-2">
              <span class="size-1.5 rounded-full bg-current"></span>{{ testResult.text }}
            </div>
            <div v-if="testResult.endpoint" class="mt-1 truncate font-mono text-[11px] opacity-70">{{ testResult.endpoint }}</div>
          </div>
        </form>

        <div class="space-y-4">
          <section class="panel p-4">
            <h2 class="label-xs mb-2.5">检测前须知</h2>
            <ul class="space-y-2 text-[12px] leading-relaxed text-mute">
              <li class="flex gap-2"><span class="text-signal">·</span>检测会向该接口发送 3 个随机整数任务，每次消耗少量 token。</li>
              <li class="flex gap-2"><span class="text-signal">·</span>建议先用「测试连接」确认 Key 与地址可用。</li>
              <li class="flex gap-2"><span class="text-signal">·</span>不同协议的接口（OpenAI / Anthropic）可在检测页切换。</li>
            </ul>
          </section>

          <section v-if="!isNew" class="panel border-danger/25 p-4">
            <h2 class="label-xs mb-2.5 text-danger/80">{{ t('configForm.danger') }}</h2>
            <button class="btn btn-danger btn-sm" :disabled="deleting || saving || detectTask.running" @click="remove">{{ t(deleting ? 'account.deleting' : 'configForm.deleteThis') }}</button>
            <p class="mt-2 text-[11.5px] text-mute">{{ t(accountMode ? 'configForm.deleteHint' : 'stateless.deleteConfirm') }}</p>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

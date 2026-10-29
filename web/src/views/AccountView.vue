<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, ensureUser, detectTask, deleteAllConfigs, deleteHistory, stopBatch, logout, toast } from '../store'
import { api } from '../api'
import { t } from '../i18n'

const router = useRouter()
const password = ref('')
const confirmation = ref('')
const busy = ref('')
const error = ref('')
const blocked = computed(() => Boolean(busy.value) || detectTask.running)

onMounted(() => ensureUser(true))

async function clean(kind) {
  if (blocked.value || !confirm(t(kind === 'configs' ? 'account.clearConfigsConfirm' : 'history.clearConfirm'))) return
  busy.value = kind
  error.value = ''
  try {
    if (kind === 'configs') await deleteAllConfigs()
    else await deleteHistory()
    toast(t(kind === 'configs' ? 'account.configsDeleted' : 'history.cleared'), 'ok')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function closeAccount() {
  if (blocked.value || !password.value || confirmation.value !== 'DELETE') return
  busy.value = 'account'
  error.value = ''
  try {
    await api('/api/account', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value, confirmation: confirmation.value }),
    })
    password.value = ''
    logout()
    toast(t('account.deleted'), 'ok', 5000)
    await router.replace('/')
  } catch (e) {
    error.value = e.message
    // 服务端可能已开始清理；保留会话和输入，让用户重试剩余步骤。
    await ensureUser(true)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-signal"></span>
          <h1 class="text-[19px] font-semibold tracking-tight">{{ t('account.heading') }}</h1>
        </div>
        <p class="mt-1 text-[12.5px] text-mute">
          <span v-if="auth.user?.name">{{ auth.user.name }} · </span>{{ t('account.desc') }}
        </p>
      </div>
    </div>

    <div v-if="detectTask.running" role="status" class="panel mb-4 flex flex-wrap items-center gap-3 p-4">
      <p class="min-w-0 flex-1 text-[12.5px] leading-relaxed text-warn">{{ t('account.stopHint') }}</p>
      <button class="btn btn-danger btn-sm" @click="stopBatch">{{ t('detect.stop') }}</button>
    </div>
    <p v-if="auth.user?.deleting" role="status" class="panel mb-4 border-warn/30 p-4 text-[12.5px] leading-relaxed text-warn">{{ t('account.pending') }}</p>
    <p v-if="error" role="alert" class="panel mb-4 border-danger/25 p-4 text-[12.5px] leading-relaxed text-danger">{{ error }}</p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start">
      <section class="panel min-w-0 border-danger/25 p-5">
        <h2 class="label-xs text-danger/80">{{ t('account.close') }}</h2>
        <p class="mt-2 text-[12.5px] leading-relaxed text-mute">{{ t('account.closeHint') }}</p>
        <p class="mt-2 text-[11.5px] leading-relaxed text-warn">{{ t('account.legacyShares') }}</p>

        <form class="mt-5" @submit.prevent="closeAccount">
          <label for="account-password" class="label-xs mb-1.5 block">{{ t('account.password') }}</label>
          <input id="account-password" v-model="password" type="password" autocomplete="current-password" class="field" required :disabled="blocked" />

          <label for="account-confirmation" class="label-xs mb-1.5 mt-4 block">{{ t('account.confirmation') }}</label>
          <input id="account-confirmation" v-model="confirmation" autocomplete="off" spellcheck="false" class="field font-mono" placeholder="DELETE" required :disabled="blocked" />

          <div class="mt-5 flex flex-wrap gap-2">
            <button type="submit" class="btn btn-danger w-full sm:w-auto" :disabled="blocked || !password || confirmation !== 'DELETE'">{{ t(busy === 'account' ? 'account.deleting' : 'account.close') }}</button>
          </div>
        </form>
      </section>

      <section class="panel min-w-0 p-4">
        <h2 class="label-xs mb-2.5">{{ t('account.cleanup') }}</h2>
        <p class="text-[12px] leading-relaxed text-mute">{{ t('account.cleanupHint') }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-danger btn-sm" :disabled="blocked || auth.user?.deleting" @click="clean('configs')">{{ t(busy === 'configs' ? 'account.deleting' : 'account.clearConfigs') }}</button>
          <button class="btn btn-danger btn-sm" :disabled="blocked || auth.user?.deleting" @click="clean('history')">{{ t(busy === 'history' ? 'account.deleting' : 'history.clear') }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

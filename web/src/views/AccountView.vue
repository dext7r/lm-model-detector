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
  <div class="mx-auto max-w-2xl space-y-5">
    <div>
      <h1 class="text-[19px] font-semibold">{{ t('account.heading') }}</h1>
      <p class="mt-1 text-[12.5px] text-mute">{{ auth.user?.name }} · {{ t('account.desc') }}</p>
    </div>

    <p v-if="detectTask.running" role="status" class="panel p-4 text-[13px] text-warn">
      {{ t('account.stopHint') }}
      <button class="btn btn-danger btn-sm ml-2" @click="stopBatch">{{ t('detect.stop') }}</button>
    </p>
    <p v-if="auth.user?.deleting" role="status" class="panel border-warn/30 p-4 text-[13px] text-warn">{{ t('account.pending') }}</p>
    <p v-if="error" role="alert" class="panel border-danger/30 p-4 text-[13px] text-danger">{{ error }}</p>

    <section class="panel space-y-4 p-5">
      <h2 class="text-[15px] font-semibold">{{ t('account.cleanup') }}</h2>
      <p class="text-[12.5px] leading-relaxed text-mute">{{ t('account.cleanupHint') }}</p>
      <div class="flex flex-wrap gap-3">
        <button class="btn btn-danger btn-sm" :disabled="blocked || auth.user?.deleting" @click="clean('configs')">{{ t(busy === 'configs' ? 'account.deleting' : 'account.clearConfigs') }}</button>
        <button class="btn btn-danger btn-sm" :disabled="blocked || auth.user?.deleting" @click="clean('history')">{{ t(busy === 'history' ? 'account.deleting' : 'history.clear') }}</button>
      </div>
    </section>

    <section class="panel border-danger/30 p-5">
      <h2 class="text-[15px] font-semibold text-danger">{{ t('account.close') }}</h2>
      <p class="mt-2 text-[12.5px] leading-relaxed text-mute">{{ t('account.closeHint') }}</p>
      <p class="mt-2 text-[12px] leading-relaxed text-warn">{{ t('account.legacyShares') }}</p>
      <form class="mt-5 space-y-4" @submit.prevent="closeAccount">
        <div>
          <label for="account-password" class="label-xs mb-1.5 block">{{ t('account.password') }}</label>
          <input id="account-password" v-model="password" type="password" autocomplete="current-password" class="field" required :disabled="blocked" />
        </div>
        <div>
          <label for="account-confirmation" class="label-xs mb-1.5 block">{{ t('account.confirmation') }}</label>
          <input id="account-confirmation" v-model="confirmation" autocomplete="off" spellcheck="false" class="field font-mono" placeholder="DELETE" required :disabled="blocked" />
        </div>
        <button type="submit" class="btn btn-danger" :disabled="blocked || !password || confirmation !== 'DELETE'">{{ t(busy === 'account' ? 'account.deleting' : 'account.close') }}</button>
      </form>
    </section>
  </div>
</template>

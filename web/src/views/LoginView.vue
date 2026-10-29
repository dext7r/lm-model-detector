<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login, register, toast } from '../store'
import { t, locale, toggleLocale } from '../i18n'
import { renderTurnstile, resetTurnstile, turnstileEnabled } from '../turnstile'

const route = useRoute()
const router = useRouter()
const mode = ref('login')
const username = ref('')
const password = ref('')
const showPass = ref(false)
const err = ref('')
const busy = ref(false)
const tsContainer = ref(null)
const tsToken = ref('')
const captchaOn = ref(false)

const submitLabel = computed(() => (mode.value === 'login' ? t('login.submit') : t('login.registerSubmit')))

function switchMode(m) {
  mode.value = m
  err.value = ''
}

async function submit() {
  err.value = ''
  if (!username.value.trim() || !password.value) {
    err.value = t('login.needBoth')
    return
  }
  // 启用验证时必须先拿到 token，否则直接拦下，省一次无效请求
  if (captchaOn.value && !tsToken.value) {
    err.value = t('login.captchaRequired')
    return
  }
  busy.value = true
  try {
    const user = mode.value === 'login'
      ? await login(username.value.trim(), password.value, tsToken.value || undefined)
      : await register(username.value.trim(), password.value, tsToken.value || undefined)
    toast(t(mode.value === 'login' ? 'login.welcomeBack' : 'login.registered', { name: user.name }), 'ok')
    router.replace(route.query.next || '/detect')
  } catch (e) {
    err.value = e.message
    // token 一次性，失败后必须换新的，否则重试必然再次被拒
    tsToken.value = ''
    resetTurnstile()
  } finally {
    busy.value = false
  }
}

async function mountCaptcha() {
  captchaOn.value = await turnstileEnabled()
  if (!captchaOn.value || !tsContainer.value) return
  await renderTurnstile(tsContainer.value, {
    onSuccess: (token) => { tsToken.value = token; err.value = '' },
    onExpire: () => { tsToken.value = '' },
    onError: () => { tsToken.value = '' },
  })
}

onMounted(async () => {
  if (route.query.mode === 'register') mode.value = 'register'
  await mountCaptcha()
})
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center px-4 py-10">
    <!-- 装饰网格光晕 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-1/2 top-0 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/8 blur-3xl"></div>
      <div class="absolute bottom-0 right-0 size-[420px] rounded-full bg-sky/6 blur-3xl"></div>
    </div>

    <button
      class="btn btn-ghost btn-sm absolute right-4 top-4 font-mono text-[11px] font-semibold uppercase"
      :title="t('lang.switch')" @click="toggleLocale"
    >{{ locale === 'zh' ? 'EN' : '中' }}</button>

    <div class="relative w-full max-w-[400px] fade-up">
      <div class="mb-8 flex flex-col items-center text-center">
        <div class="relative mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-ink-850">
          <span class="absolute size-9 rounded-full border border-signal/30"></span>
          <span class="absolute size-5 rounded-full border border-signal/20"></span>
          <span class="size-2 rounded-full bg-signal shadow-[var(--signal-glow-shadow)]"></span>
        </div>
        <h1 class="text-[19px] font-semibold tracking-tight">{{ t('common.appName') }}</h1>
        <p class="mt-1.5 text-[12.5px] text-mute">{{ t('login.subtitle') }}</p>
      </div>

      <div class="panel p-6 shadow-[var(--pop-shadow-lg)]">
        <div class="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink-850 p-1">
          <button
            v-for="m in [{ k: 'login', label: t('login.tabLogin') }, { k: 'register', label: t('login.tabRegister') }]" :key="m.k"
            class="rounded-md py-2 text-[13px] font-medium transition-colors"
            :class="mode === m.k ? 'bg-ink-700 text-chalk shadow-sm' : 'text-mute hover:text-chalk'"
            @click="switchMode(m.k)"
          >{{ m.label }}</button>
        </div>

        <form @submit.prevent="submit">
          <label class="label-xs mb-1.5 block">{{ t('login.username') }}</label>
          <input
            v-model="username" class="field font-mono" autocomplete="username"
            autocapitalize="off" spellcheck="false" :placeholder="t('login.usernamePlaceholder')"
          />

          <label class="label-xs mb-1.5 mt-4 block">{{ t('login.password') }}</label>
          <div class="relative">
            <input
              v-model="password" :type="showPass ? 'text' : 'password'" class="field pr-16"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :placeholder="t('login.passwordPlaceholder')"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11.5px] text-mute hover:text-chalk"
              @click="showPass = !showPass"
            >{{ showPass ? t('configForm.hide') : t('configForm.show') }}</button>
          </div>

          <!-- Cloudflare Turnstile；未配置密钥时不渲染任何内容 -->
          <div v-show="captchaOn" ref="tsContainer" class="mt-4 flex justify-center"></div>

          <div v-if="err" class="mt-4 flex items-start gap-2 rounded-lg border border-danger/35 bg-danger/8 px-3 py-2 text-[12.5px] text-danger">
            <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-current"></span>{{ err }}
          </div>

          <button type="submit" class="btn btn-primary mt-5 w-full" :disabled="busy">
            <span v-if="busy" class="size-3.5 animate-spin rounded-full border-2 border-on-signal/40 border-t-on-signal"></span>
            {{ busy ? t('login.processing') : submitLabel }}
          </button>
        </form>
      </div>

      <p class="mt-5 text-center text-[11.5px] leading-relaxed text-mute/80">
        {{ t('login.dataNote') }}<br />
        {{ t('footer.note') }}
      </p>
    </div>
  </div>
</template>

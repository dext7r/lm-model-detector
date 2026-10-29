<script setup>
import { computed, onMounted } from 'vue'
import { auth, ensureUser } from '../store'
import { t, locale, toggleLocale } from '../i18n'
import { accountMode } from '../runtime'

const loggedIn = computed(() => !!auth.user)
const initial = computed(() => (auth.user?.name || '?').slice(0, 1).toUpperCase())
const enterTo = computed(() => (!accountMode.value || loggedIn.value ? '/detect' : '/login'))
const enterLabel = computed(() => !accountMode.value ? t('stateless.enter') : t(loggedIn.value ? 'home.enterAuthed' : 'home.enter'))

// 已登录用户进首页时补一次会话校验，拿到用户名用于顶栏展示
onMounted(() => { ensureUser() })

const features = computed(() => [
  { titleKey: 'home.f1t', descKey: 'home.f1d', icon: 'samples' },
  { titleKey: 'home.f2t', descKey: 'home.f2d', icon: 'bulk' },
  { titleKey: 'home.f3t', descKey: 'home.f3d', icon: 'local' },
  { titleKey: accountMode.value ? 'home.f4t' : 'stateless.featureTitle', descKey: accountMode.value ? 'home.f4d' : 'stateless.notice', icon: 'share' },
])

const steps = computed(() => [
  { n: '01', titleKey: 'home.s1t', descKey: 'home.s1d' },
  { n: '02', titleKey: 'home.s2t', descKey: 'home.s2d' },
  { n: '03', titleKey: 'home.s3t', descKey: accountMode.value ? 'home.s3d' : 'stateless.results' },
])
</script>

<template>
  <div class="relative overflow-hidden">
    <!-- 背景光晕 -->
    <div class="pointer-events-none absolute inset-0 -z-10">
      <div class="absolute left-1/2 top-[-18rem] size-[42rem] -translate-x-1/2 rounded-full bg-signal/10 blur-[120px]"></div>
      <div class="absolute right-[-10rem] top-[18rem] size-[30rem] rounded-full bg-sky/8 blur-[110px]"></div>
    </div>

    <div class="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <!-- 顶部导航 -->
      <header class="flex items-center gap-3 py-6">
        <div class="relative grid size-9 place-items-center rounded-[11px] border border-line bg-ink-850">
          <span class="absolute size-6 rounded-full border border-signal/30"></span>
          <span class="size-2 rounded-full bg-signal shadow-[var(--signal-glow-shadow)]"></span>
        </div>
        <div class="flex flex-col leading-none">
          <span class="text-[14px] font-semibold tracking-tight">{{ t('common.appName') }}</span>
          <span class="mt-1 font-mono text-[10px] uppercase tracking-[.18em] text-mute">{{ t('common.brandSub') }}</span>
        </div>
        <nav class="ml-auto flex items-center gap-2">
          <button
            class="btn btn-ghost btn-sm font-mono text-[11px] font-semibold uppercase"
            :title="t('lang.switch')" @click="toggleLocale"
          >{{ locale === 'zh' ? 'EN' : '中' }}</button>
          <RouterLink v-if="!loggedIn" :to="enterTo" class="btn btn-primary btn-sm">{{ enterLabel }}</RouterLink>

          <!-- 已登录：展示头像与用户名，点击进入工作台 -->
          <RouterLink
            v-else to="/detect"
            class="flex items-center gap-2 rounded-full border border-line bg-ink-850/80 py-1 pl-1 pr-3 transition-colors hover:border-line-strong"
            :title="t('home.enterAuthed')"
          >
            <span class="grid size-6 place-items-center rounded-full bg-signal/12 text-[11px] font-bold text-signal">
              {{ initial }}
            </span>
            <span class="max-w-[110px] truncate text-[12.5px] text-chalk/90">{{ auth.user.name }}</span>
          </RouterLink>
        </nav>
      </header>

      <!-- Hero -->
      <section class="pb-16 pt-10 sm:pb-24 sm:pt-16">
        <div class="flex flex-col items-start gap-10 lg:flex-row lg:items-center">
          <div class="min-w-0 flex-1 fade-up">
            <div class="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-ink-850/70 px-3 py-1.5">
              <span class="pulse-dot size-1.5 rounded-full bg-signal text-signal"></span>
              <span class="font-mono text-[11px] tracking-wide text-mute">{{ t('home.badge') }}</span>
            </div>

            <h1 class="text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-[46px]">
              {{ t('home.title1') }}<br class="hidden sm:block" />
              <span class="text-signal">{{ t('home.title2') }}</span>
            </h1>

            <p class="mt-5 max-w-xl text-[14.5px] leading-relaxed text-mute sm:text-[15px]">
              {{ t('home.desc') }}
            </p>

            <div class="mt-8 flex flex-wrap items-center gap-3">
              <RouterLink :to="enterTo" class="btn btn-primary">{{ enterLabel }}</RouterLink>
              <RouterLink v-if="accountMode" to="/login?mode=register" class="btn">{{ t('home.register') }}</RouterLink>
            </div>

            <dl class="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line-soft pt-6">
              <div>
                <dt class="label-xs">{{ t('home.stat.samples') }}</dt>
                <dd class="mt-1.5 font-mono text-[19px] font-semibold">{{ t('home.stat.samplesValue') }}<span class="text-[12px] text-mute">{{ t('home.stat.samplesUnit') }}</span></dd>
              </div>
              <div>
                <dt class="label-xs">{{ t('home.stat.concurrency') }}</dt>
                <dd class="mt-1.5 font-mono text-[19px] font-semibold">10<span class="text-[12px] text-mute">{{ t('home.stat.concurrencyUnit') }}</span></dd>
              </div>
              <div>
                <dt class="label-xs">{{ t('home.stat.local') }}</dt>
                <dd class="mt-1.5 font-mono text-[19px] font-semibold">{{ t('home.stat.localValue') }}</dd>
              </div>
            </dl>
          </div>

          <!-- 视觉：扫描环 -->
          <div class="relative mx-auto hidden w-[300px] shrink-0 lg:block">
            <div class="relative grid size-[300px] place-items-center">
              <span class="absolute size-[300px] rounded-full border border-line/70"></span>
              <span class="absolute size-[228px] rounded-full border border-line"></span>
              <span class="absolute size-[156px] rounded-full border border-signal/25"></span>
              <span class="absolute size-[156px] rounded-full border border-signal/10 scanline overflow-hidden"></span>
              <div class="relative grid size-[86px] place-items-center rounded-2xl border border-line bg-ink-850/90 backdrop-blur">
                <span class="absolute size-14 rounded-full border border-signal/25"></span>
                <span class="size-3 rounded-full bg-signal shadow-[var(--signal-glow-shadow)]"></span>
              </div>

              <!-- 环绕标签 -->
              <div class="absolute left-0 top-6 rounded-lg border border-line bg-ink-850/85 px-2.5 py-1.5 backdrop-blur">
                <div class="font-mono text-[10px] text-mute">{{ t('home.tag.request') }}</div>
                <div class="font-mono text-[11.5px] text-chalk/85">claude-sonnet-5</div>
              </div>
              <div class="absolute bottom-8 right-0 rounded-lg border border-signal/35 bg-signal/10 px-2.5 py-1.5 backdrop-blur">
                <div class="font-mono text-[10px] text-signal/80">{{ t('home.tag.identified') }}</div>
                <div class="font-mono text-[11.5px] font-semibold text-signal">gpt-4o-mini</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 能力 -->
      <section class="border-t border-line-soft py-14">
        <div class="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-[20px] font-semibold tracking-tight">{{ t('home.featuresTitle') }}</h2>
            <p class="mt-1.5 text-[13px] text-mute">{{ t('home.featuresDesc') }}</p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <article
            v-for="f in features" :key="f.titleKey"
            class="panel panel-hover p-5 transition-colors"
          >
            <div class="mb-3 grid size-9 place-items-center rounded-[10px] border border-line bg-ink-800">
              <svg v-if="f.icon === 'samples'" viewBox="0 0 20 20" class="size-4 text-signal" fill="none" stroke="currentColor" stroke-width="1.6">
                <rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" />
                <rect x="3" y="11" width="6" height="6" rx="1.5" /><path d="M11 14h6" stroke-linecap="round" />
              </svg>
              <svg v-else-if="f.icon === 'bulk'" viewBox="0 0 20 20" class="size-4 text-signal" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M3 5h14M3 10h14M3 15h9" stroke-linecap="round" />
              </svg>
              <svg v-else-if="f.icon === 'local'" viewBox="0 0 20 20" class="size-4 text-signal" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M10 2.5 16 5v5.5c0 3.4-2.4 6-6 7-3.6-1-6-3.6-6-7V5l6-2.5Z" stroke-linejoin="round" />
                <path d="M7.5 9.8 9.4 11.7 12.8 8.3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else viewBox="0 0 20 20" class="size-4 text-signal" fill="none" stroke="currentColor" stroke-width="1.6">
                <circle cx="6" cy="10" r="2.4" /><circle cx="14" cy="5.5" r="2.4" /><circle cx="14" cy="14.5" r="2.4" />
                <path d="M8.2 8.8 11.8 6.5M8.2 11.2l3.6 2.3" stroke-linecap="round" />
              </svg>
            </div>
            <h3 class="text-[14.5px] font-semibold">{{ t(f.titleKey) }}</h3>
            <p class="mt-1.5 text-[12.5px] leading-relaxed text-mute">{{ t(f.descKey) }}</p>
          </article>
        </div>
      </section>

      <!-- 三步 -->
      <section class="border-t border-line-soft py-14">
        <h2 class="text-[20px] font-semibold tracking-tight">{{ t('home.stepsTitle') }}</h2>
        <div class="mt-7 grid gap-4 sm:grid-cols-3">
          <div v-for="s in steps" :key="s.n" class="relative">
            <div class="mb-2 font-mono text-[11px] tracking-[.14em] text-signal/70">{{ s.n }}</div>
            <h3 class="text-[14px] font-semibold">{{ t(s.titleKey) }}</h3>
            <p class="mt-1.5 text-[12.5px] leading-relaxed text-mute">{{ t(s.descKey) }}</p>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="pb-20">
        <div class="panel relative overflow-hidden p-6 sm:p-8">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-signal/8 via-transparent to-sky/8"></div>
          <div class="relative flex flex-wrap items-center gap-4">
            <div class="min-w-0">
              <h2 class="text-[18px] font-semibold tracking-tight">{{ t('home.ctaTitle') }}</h2>
              <p class="mt-1.5 text-[12.5px] text-mute">{{ t(accountMode ? 'home.ctaDesc' : 'stateless.notice') }}</p>
            </div>
            <div class="ml-auto flex flex-wrap gap-2">
              <RouterLink :to="enterTo" class="btn btn-primary">{{ enterLabel }}</RouterLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from './components/TopBar.vue'
import TabBar from './components/TabBar.vue'
import ToastStack from './components/ToastStack.vue'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()
// 登录页与分享页都是独立版式：不需要顶栏/底栏导航
const isBarePage = computed(() => route.name === 'login' || route.name === 'share')
// 首页自带完整的页头页脚版式，避免与外层公共组件重复
const isHome = computed(() => route.name === 'home')
</script>

<template>
  <div class="min-h-screen scan-bg">
    <TopBar v-if="!isBarePage && !isHome" />
    <main
      class="mx-auto w-full max-w-6xl px-4 sm:px-6"
      :class="isBarePage || isHome ? 'py-0' : 'pb-10 pt-5 sm:pb-14'"
    >
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <SiteFooter v-if="!isBarePage" :class="isHome ? '' : 'pb-20 sm:pb-0'" />
    <TabBar v-if="!isBarePage && !isHome" />
    <ToastStack />
  </div>
</template>

<style>
.page-enter-active, .page-leave-active { transition: opacity .18s ease, transform .18s ease; }
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-leave-to { opacity: 0; }
</style>

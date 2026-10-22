<script setup lang="ts">
import { ref } from 'vue'
import FgTabbar from '@/tabbar/index.vue'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'
import { hasPrivacyConsent } from '@/tire/app/privacy'
// #ifdef APP-PLUS
import TPrivacyGate from '@/components/tire/TPrivacyGate.vue'
// #endif

const isCurrentPageTabbar = ref(true)
/** 安卓首次启动：未同意隐私政策前挡住页面，不初始化地图等第三方 SDK */
const privacyGateVisible = ref(false)
// #ifdef APP-PLUS
privacyGateVisible.value = !hasPrivacyConsent()
// #endif

onShow(() => {
  const { path } = currRoute()
  isCurrentPageTabbar.value = path === '/' ? true : isPageTabbar(path)
})
</script>

<template>
  <view>
    <KuRootView />
    <FgTabbar v-if="isCurrentPageTabbar" />
    <!-- #ifdef APP-PLUS -->
    <TPrivacyGate v-if="privacyGateVisible" @agree="privacyGateVisible = false" />
    <!-- #endif -->
  </view>
</template>

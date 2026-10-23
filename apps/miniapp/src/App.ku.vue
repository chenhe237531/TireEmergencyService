<script setup lang="ts">
import { ref } from 'vue'
import FgTabbar from '@/tabbar/index.vue'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'
import { hasPrivacyConsent } from '@/tire/app/privacy'
// #ifdef APP-PLUS
import TPrivacyGate from '@/components/tire/TPrivacyGate.vue'
import { runStartupUpdateCheck } from '@/tire/app/update'
// #endif

const isCurrentPageTabbar = ref(true)
/** 安卓首次启动：未同意隐私政策前挡住页面，不初始化地图等第三方 SDK */
const privacyGateVisible = ref(false)
// #ifdef APP-PLUS
privacyGateVisible.value = !hasPrivacyConsent()
// #endif

// #ifdef APP-PLUS
function onPrivacyAgreed() {
  privacyGateVisible.value = false
  runStartupUpdateCheck()
}
// #endif

onShow(() => {
  const { path } = currRoute()
  isCurrentPageTabbar.value = path === '/' ? true : isPageTabbar(path)
  // #ifdef APP-PLUS
  // 启动与回到前台时检查应用内更新（24 小时内只拉取一次，失败静默）；
  // 首启隐私弹窗展示期间不打扰，同意后再查
  if (!privacyGateVisible.value)
    runStartupUpdateCheck()
  // #endif
})
</script>

<template>
  <view>
    <KuRootView />
    <FgTabbar v-if="isCurrentPageTabbar" />
    <!-- #ifdef APP-PLUS -->
    <TPrivacyGate v-if="privacyGateVisible" @agree="onPrivacyAgreed" />
    <!-- #endif -->
  </view>
</template>

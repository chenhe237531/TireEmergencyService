<script setup lang="ts">
import { customTabbarEnable, needHideNativeTabbar, tabbarCacheEnable } from './config'
import { tabbarList, tabbarStore } from './store'

// #ifdef MP-WEIXIN
defineOptions({ virtualHost: true })
// #endif

function handleClick(index: number) {
  if (index === tabbarStore.curIdx && tabbarStore.isCurrentRouteTabbarItem(index)) return
  const list = tabbarList.value
  if (!list[index]) return
  const url = list[index].pagePath
  const prevIdx = tabbarStore.curIdx
  tabbarStore.setCurIdx(index)
  const ok = () => tabbarStore.syncCurIdxByCurrentPageAsync()
  const fail = () => tabbarStore.setCurIdx(prevIdx)
  if (tabbarCacheEnable) uni.switchTab({ url, success: ok, fail })
  else uni.navigateTo({ url, success: ok, fail })
}
// #ifndef MP-WEIXIN || MP-ALIPAY
onLoad(() => {
  needHideNativeTabbar && uni.hideTabBar({ fail() {} })
})
// #endif
</script>

<template>
  <view v-if="customTabbarEnable" class="tabbar-holder">
    <view class="tabbar" @touchmove.stop.prevent>
      <view class="items">
        <view v-for="(item, index) in tabbarList" :key="index" class="item" :class="{ on: tabbarStore.curIdx === index }" @click="handleClick(index)">
          <view :class="[tabbarStore.curIdx === index && item.iconActive ? item.iconActive : item.icon]" class="ic" />
          <text class="label">{{ item.text }}</text>
        </view>
      </view>
      <view class="safe" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.tabbar-holder { height: 60px; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; background: rgba(255, 255, 255, 0.97); box-shadow: 0 -1px 0 #f0ede8, 0 -8px 24px rgba(40, 36, 30, 0.06); }
.items { height: 60px; display: flex; }
.item { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #9a948c; transition: color 0.15s; }
.item .ic { font-size: 24px; }
.item .label { font-size: 11px; }
/* 选中态：实心图标 + 小蚂蚁品牌橙 */
.item.on { color: #e8721c; }
.item.on .label { font-weight: 700; }
.safe { padding-bottom: env(safe-area-inset-bottom); }
</style>

<script setup lang="ts">
import { customTabbarEnable, needHideNativeTabbar, tabbarCacheEnable } from './config'
import { tabbarList, tabbarStore } from './store'

// #ifdef MP-WEIXIN
defineOptions({ virtualHost: true })
// #endif

function handleClick(index: number) {
  if (index === tabbarStore.curIdx && tabbarStore.isCurrentRouteTabbarItem(index))
    return
  const list = tabbarList.value
  if (!list[index])
    return
  const url = list[index].pagePath
  const prevIdx = tabbarStore.curIdx
  tabbarStore.setCurIdx(index)
  const ok = () => tabbarStore.syncCurIdxByCurrentPageAsync()
  const fail = () => tabbarStore.setCurIdx(prevIdx)
  if (tabbarCacheEnable)
    uni.switchTab({ url, success: ok, fail })
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
/* 悬浮胶囊 tabbar：与页面留出空隙、顶部圆角 + 柔和投影，安全区由 bottom 偏移承担 */
.tabbar-holder {
  height: 64px;
}
.tabbar {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: calc(env(safe-area-inset-bottom) + 8px);
  z-index: 1000;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  box-shadow:
    0 0 0 1px rgba(38, 34, 29, 0.05),
    0 10px 26px -12px rgba(38, 34, 29, 0.28);
}
.items {
  height: 56px;
  display: flex;
  align-items: center;
}
.item {
  position: relative;
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #9a948c;
  transition: color 0.15s;
}
/* 选中态：图标落在浅橙胶囊里，文案加粗变品牌橙 */
.item .ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 26px;
  border-radius: 13px;
  font-size: 21px;
  transition:
    background-color 0.18s,
    color 0.18s;
}
.item .label {
  font-size: 11px;
  line-height: 1;
}
.item.on {
  color: var(--brand);
}
.item.on .ic {
  background: var(--brand-soft);
  color: var(--brand);
}
.item.on .label {
  font-weight: 700;
}
.item:active .ic {
  background: #f4f1ec;
}
.safe {
  display: none;
}

/* H5 宽屏：tabbar 跟版心同宽居中 */
/* #ifdef H5 */
@media (min-width: 640px) {
  .tabbar {
    left: 50%;
    right: auto;
    width: calc(var(--shell-max) - 20px);
    transform: translateX(-50%);
  }
}
/* #endif */
</style>

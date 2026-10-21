<script setup lang="ts">
/**
 * 骨架屏：首屏与切换分类时占位，避免白屏或布局跳动。
 * variant: store 门店卡 / text 段落 / profile 资料头
 */
withDefaults(defineProps<{
  variant?: 'store' | 'text' | 'profile'
  rows?: number
}>(), {
  variant: 'store',
  rows: 3,
})
</script>

<template>
  <view v-if="variant === 'store'" class="flex flex-col gap-3">
    <view v-for="i in rows" :key="i" class="t-card p-4">
      <view class="flex items-center justify-between">
        <view class="t-sk h-4 w-40" />
        <view class="t-sk h-5 w-14 rounded-full" />
      </view>
      <view class="mt-3 flex items-center gap-2">
        <view class="t-sk h-3 w-16" />
        <view class="t-sk h-3 w-24" />
      </view>
      <view class="mt-3 flex gap-2">
        <view class="t-sk h-5 w-16 rounded-md" />
        <view class="t-sk h-5 w-20 rounded-md" />
        <view class="t-sk h-5 w-14 rounded-md" />
      </view>
    </view>
  </view>

  <view v-else-if="variant === 'profile'" class="flex items-center gap-3">
    <view class="t-sk h-14 w-14 rounded-full" />
    <view class="flex-1">
      <view class="t-sk h-4 w-28" />
      <view class="t-sk mt-2 h-3 w-40" />
    </view>
  </view>

  <view v-else class="flex flex-col gap-2">
    <view v-for="i in rows" :key="i" class="t-sk h-3" :style="{ width: i % 3 === 0 ? '62%' : '100%' }" />
  </view>
</template>

<script setup lang="ts">
/**
 * 页面级状态块：加载中 / 空 / 出错（可重试）。
 * 三种状态共用同一套留白与字号，切换时不跳动。
 */
import TButton from './TButton.vue'

withDefaults(defineProps<{
  type: 'loading' | 'empty' | 'error'
  title?: string
  desc?: string
  /** 有值时显示底部按钮，如「重新加载」 */
  actionText?: string
}>(), {
  title: '',
  desc: '',
  actionText: '',
})

const emit = defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <view class="t-state">
    <template v-if="type === 'loading'">
      <view class="t-state__ico">
        <view class="t-inline-loading__dot !h-5 !w-5" />
      </view>
      <view class="t-state__title">
        {{ title || '正在加载' }}
      </view>
      <view v-if="desc" class="t-state__desc">
        {{ desc }}
      </view>
    </template>

    <template v-else-if="type === 'error'">
      <view class="t-state__ico t-state__ico--error">
        <text class="i-tabler-cloud-off" />
      </view>
      <view class="t-state__title">
        {{ title || '加载失败' }}
      </view>
      <view class="t-state__desc">
        {{ desc || '网络好像不太稳定，稍后再试试' }}
      </view>
    </template>

    <template v-else>
      <view class="t-state__ico">
        <text class="i-tabler-inbox" />
      </view>
      <view class="t-state__title">
        {{ title || '暂时没有内容' }}
      </view>
      <view v-if="desc" class="t-state__desc">
        {{ desc }}
      </view>
    </template>

    <view v-if="actionText" class="mt-2">
      <TButton :type="type === 'error' ? 'soft' : 'ghost'" size="sm" @click="emit('action')">
        {{ actionText }}
      </TButton>
    </view>
  </view>
</template>

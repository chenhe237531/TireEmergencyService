<script setup lang="ts">
/**
 * 表单字段容器：标签（含必填星号）+ 右侧操作 + 内容 + 错误/提示文案。
 * 错误态统一走 error 属性，页面不用自己拼红字。
 */
withDefaults(defineProps<{
  label: string
  required?: boolean
  /** 错误提示，有值即进入错误态 */
  error?: string
  /** 正常态下的辅助说明 */
  hint?: string
}>(), {
  required: false,
  error: '',
  hint: '',
})
</script>

<template>
  <view class="t-field">
    <view class="t-field__hd">
      <text class="t-label" :class="{ 't-label--req': required }">{{ label }}</text>
      <slot name="aside" />
    </view>
    <slot />
    <view v-if="error" class="t-field__err">
      <text class="i-tabler-alert-circle text-[13px]" />
      <text>{{ error }}</text>
    </view>
    <view v-else-if="hint" class="t-hint mt-1">
      {{ hint }}
    </view>
  </view>
</template>

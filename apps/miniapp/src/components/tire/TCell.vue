<script setup lang="ts">
/** 列表单元：图标 + 标题 + 右侧值 + 箭头，用于「我的」菜单与设置项 */
withDefaults(defineProps<{
  title: string
  /** 左侧图标类名 */
  icon?: string
  value?: string
  /** 显示右箭头 */
  arrow?: boolean
  /** 右侧自定义内容（如状态标签），优先级高于 value */
  showTag?: boolean
}>(), {
  icon: '',
  value: '',
  arrow: true,
  showTag: false,
})

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <view class="t-cell" @click="emit('click')">
    <view v-if="icon" class="t-cell__ico">
      <text :class="icon" />
    </view>
    <text class="t-cell__title">{{ title }}</text>
    <view v-if="showTag" class="flex items-center">
      <slot name="tag" />
    </view>
    <text v-else-if="value" class="t-cell__value">{{ value }}</text>
    <text v-if="arrow" class="t-cell__arrow i-tabler-chevron-right" />
  </view>
</template>

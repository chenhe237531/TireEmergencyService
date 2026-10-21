<script setup lang="ts">
/**
 * 通用按钮：把「默认 / 按下 / 加载 / 禁用」四种状态收在一处，
 * 页面只传 type / loading / disabled，不再各自写按钮样式。
 */
const props = withDefaults(defineProps<{
  type?: 'primary' | 'rescue' | 'soft' | 'ghost' | 'text' | 'danger'
  size?: 'lg' | 'md' | 'sm'
  /** 占满一行 */
  block?: boolean
  /** 请求中：显示转圈、屏蔽重复点击 */
  loading?: boolean
  disabled?: boolean
  /** 左侧图标类名，如 i-tabler-phone-call */
  icon?: string
  /** 纯文字按钮（不传则用默认插槽） */
  label?: string
}>(), {
  type: 'primary',
  size: 'md',
  block: false,
  loading: false,
  disabled: false,
  icon: '',
  label: '',
})

const emit = defineEmits<{ (e: 'click'): void }>()

function onTap() {
  if (props.disabled || props.loading)
    return
  emit('click')
}
</script>

<template>
  <view
    class="t-btn"
    :class="[
      `t-btn--${type}`,
      `t-btn--${size}`,
      { 't-btn--block': block, 'is-loading': loading, 'is-disabled': disabled },
    ]"
    :hover-class="disabled || loading ? 'none' : ''"
    @click="onTap"
  >
    <view class="t-btn__label">
      <text v-if="icon" :class="icon" class="mr-1 text-[16px] leading-none" />
      <slot>{{ label }}</slot>
    </view>
    <view v-if="loading" class="t-btn__spin" />
  </view>
</template>

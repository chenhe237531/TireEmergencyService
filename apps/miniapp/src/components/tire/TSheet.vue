<script setup lang="ts">
/**
 * 底部弹层：确认 / 输入补充信息统一用它，
 * 支持 v-model:show，确认按钮可进入 loading 与禁用态。
 */
import TButton from './TButton.vue'

const props = withDefaults(defineProps<{
  show: boolean
  title: string
  desc?: string
  confirmText?: string
  cancelText?: string
  confirmLoading?: boolean
  confirmDisabled?: boolean
  /** 只做提示时隐藏取消按钮 */
  hideCancel?: boolean
  /** 内部已有主操作按钮（如微信手机号授权）时隐藏底部确认按钮 */
  showConfirm?: boolean
}>(), {
  desc: '',
  confirmText: '确认',
  cancelText: '取消',
  confirmLoading: false,
  confirmDisabled: false,
  hideCancel: false,
  showConfirm: true,
})

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function close() {
  if (props.confirmLoading)
    return
  emit('update:show', false)
  emit('cancel')
}
</script>

<template>
  <view v-if="show" class="t-mask" @click="close" @touchmove.stop.prevent />
  <view v-if="show" class="t-sheet" @touchmove.stop.prevent>
    <view class="t-sheet__grab" />
    <view class="t-sheet__title">
      {{ title }}
    </view>
    <view v-if="desc" class="t-sheet__desc">
      {{ desc }}
    </view>
    <view class="t-sheet__body">
      <slot />
    </view>
    <view class="t-sheet__ft">
      <TButton v-if="!hideCancel" type="ghost" size="lg" :disabled="confirmLoading" @click="close">
        {{ cancelText }}
      </TButton>
      <TButton v-if="showConfirm" size="lg" :loading="confirmLoading" :disabled="confirmDisabled" @click="emit('confirm')">
        {{ confirmText }}
      </TButton>
    </view>
  </view>
</template>

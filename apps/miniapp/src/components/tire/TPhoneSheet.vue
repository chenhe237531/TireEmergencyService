<script setup lang="ts">
/**
 * 绑定 / 更换手机号弹层：首页（救援前置）、我的、个人资料共用。
 *
 * 演示环境：手动输入 11 位手机号；
 * 真实微信环境：getPhoneNumber 快速验证（条件编译保证 H5 不渲染微信按钮）。
 * 绑定成功后全局 me 已刷新，并向外发 bound 事件做页面级后续动作。
 */
import { watch } from 'vue'
import TSheet from './TSheet.vue'
import { usePhoneBind } from '@/tire/phone'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  desc?: string
  confirmText?: string
  boundToast?: string
}>(), {
  title: '绑定手机号',
  desc: '救援时客服通过这个号码联系你，请填写常用号码。',
  confirmText: '保存',
  boundToast: '手机号已绑定',
})

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'bound'): void
  (e: 'cancel'): void
}>()

const { phoneVal, phoneErr, phoneLoading, demoLogin, prepare, bindManual, onWxPhone } = usePhoneBind({
  boundToast: props.boundToast,
  onBound: () => {
    emit('update:show', false)
    emit('bound')
  },
})

watch(() => props.show, (v) => {
  if (v)
    prepare()
})

function onCancel() {
  emit('update:show', false)
  emit('cancel')
}
</script>

<template>
  <TSheet
    :show="show"
    :title="title"
    :desc="desc"
    :confirm-text="confirmText"
    :show-confirm="demoLogin"
    :confirm-loading="phoneLoading"
    @confirm="bindManual"
    @cancel="onCancel"
  >
    <!-- #ifdef MP-WEIXIN -->
    <view v-if="!demoLogin" class="t-field" style="border-bottom: none; padding-top: 0">
      <button
        class="t-btn t-btn--primary t-btn--lg t-btn--block"
        style="border: none"
        open-type="getPhoneNumber"
        @getphonenumber="onWxPhone"
      >
        微信手机号快捷绑定
      </button>
      <view class="t-hint mt-2">
        微信授权后自动绑定，无需手动输入
      </view>
    </view>
    <!-- #endif -->

    <view v-if="demoLogin" class="t-field" style="border-bottom: none; padding-top: 0">
      <view class="t-field__hd">
        <text class="t-label t-label--req">手机号</text>
      </view>
      <input v-model="phoneVal" class="t-input" :class="{ 'is-error': phoneErr }" type="number" :maxlength="11" placeholder="请输入 11 位手机号">
      <view v-if="phoneErr" class="t-field__err">
        <text class="i-tabler-alert-circle text-[13px]" />
        <text>{{ phoneErr }}</text>
      </view>
      <view v-else class="t-hint mt-1">
        仅用于救援联系，不会对外展示
      </view>
    </view>
    <!-- #ifndef MP-WEIXIN -->
    <view v-if="!demoLogin" class="t-hint">
      当前环境不支持微信手机号授权，请在小程序内完成绑定
    </view>
    <!-- #endif -->
  </TSheet>
</template>

<script setup lang="ts">
/**
 * 账号注销（pkg-me，issue #10 / ADR-0006）。
 *
 * 流程：注销影响说明 → 绑定手机号短信二次验证（scene=delete，登录验证码不可复用）
 * → 二次确认弹窗 → DELETE /app/account → 本地数据清理并回到首页。
 * 注销后同一手机号可重新注册，但历史工单保留在匿名化账号上，不关联新账号。
 */
import { computed, onUnmounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TField from '@/components/tire/TField.vue'
import { http } from '@/tire/request'
import { useTire } from '@/tire/store'
import { cleanupAccountStorage } from '@/tire/app/account-cleanup'
import { go, toast } from '@/tire/utils'

const tire = useTire()

const code = ref('')
const sending = ref(false)
const submitting = ref(false)
const errMsg = ref('')
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

onShow(async () => {
  // 资料可能刚在其他页改过（如绑定手机号），进页刷新一次
  if (tire.loggedIn)
    await tire.loadMe()
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

/** 未绑定手机号无法接收注销验证码：引导先去绑定 */
const needPhone = computed(() => tire.loggedIn && !tire.me?.phone)

const phoneText = computed(() => {
  const p = tire.me?.phone || ''
  return p ? `${p.slice(0, 3)}****${p.slice(7)}` : ''
})

const codeValid = computed(() => /^\d{6}$/.test(code.value))

function startCountdown() {
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

async function sendSms() {
  if (sending.value || countdown.value > 0)
    return
  sending.value = true
  errMsg.value = ''
  try {
    // scene=delete：注销专用验证码，登录验证码不能复用（ADR-0006 二次验证）
    const data = await http.post<{ sent: boolean, demoCode?: string }>(
      '/app/auth/sms/send',
      { phone: tire.me?.phone, scene: 'delete' },
      { silent: true },
    )
    // 本地演示模式服务端回传固定验证码，直接填入便于联调
    if (data?.demoCode)
      code.value = data.demoCode
    toast(data?.demoCode ? `演示验证码：${data.demoCode}` : '验证码已发送')
    startCountdown()
  }
  catch (e: any) {
    errMsg.value = e?.message || '验证码发送失败，请稍后重试'
  }
  finally {
    sending.value = false
  }
}

/** 提交注销：验证码 → 二次确认（红色）→ 服务端匿名化 → 本地清理 */
function submitDelete() {
  if (submitting.value)
    return
  if (!codeValid.value) {
    errMsg.value = '请输入 6 位验证码'
    return
  }
  uni.showModal({
    title: '确认注销账号',
    content: '注销后个人信息将被清除且无法恢复，历史救援与咨询仅保留统计骨架。确定注销吗？',
    confirmText: '确认注销',
    confirmColor: '#D93025',
    success: (r) => {
      if (r.confirm)
        doDelete()
    },
  })
}

async function doDelete() {
  submitting.value = true
  errMsg.value = ''
  try {
    await http.del('/app/account', { code: code.value }, { silent: true })
    // 服务端已匿名化：本地令牌、草稿、幂等键等账号级数据一并清理（保留设备级状态）
    tire.logout()
    cleanupAccountStorage()
    uni.reLaunch({ url: '/pages/index/index' })
    setTimeout(() => toast('账号已注销，感谢使用'), 300)
  }
  catch (e: any) {
    // 40021 验证码错误 / 42900 频控：留在页面让司机重试或重新获取
    errMsg.value = e?.message || '注销没有成功，请稍后重试'
  }
  finally {
    submitting.value = false
  }
}

function goBindPhone() {
  go('/pkg-me/profile')
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "注销账号",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2"
  }
}
</route>

<template>
  <view class="t-shell t-shell--plain t-page-pad">
    <!-- 注销影响说明：让司机在验证前清楚知道会失去什么 -->
    <view class="t-card p-5">
      <view class="text-[17px] text-[#26221D] font-bold">
        注销后将发生什么
      </view>
      <view class="mt-3 flex flex-col gap-2 text-[13px] text-[#8F8981] leading-relaxed">
        <view>· 手机号、微信绑定、昵称头像等个人信息将被清除</view>
        <view>· 历史救援工单与咨询仅保留状态与时间用于运营统计，车牌、位置、描述、照片全部清空</view>
        <view>· 浏览痕迹与上传的现场图片将被删除</view>
        <view>· 同一手机号之后可重新注册，但新账号不会找回历史记录</view>
        <view class="text-[#D93025]">· 注销不可恢复，进行中的救援请先与客服确认完成</view>
      </view>
    </view>

    <!-- 未绑定手机号：注销需要短信验证，先引导绑定 -->
    <view v-if="needPhone" class="t-card mt-4 p-5">
      <view class="text-[15px] text-[#26221D] font-semibold">
        需要先绑定手机号
      </view>
      <view class="mt-1 text-[13px] text-[#8F8981] leading-relaxed">
        注销前需要通过短信验证确认是本人操作，请先在个人资料中绑定手机号。
      </view>
      <view class="mt-4">
        <TButton block size="lg" @click="goBindPhone">
          去绑定手机号
        </TButton>
      </view>
    </view>

    <!-- 短信二次验证 -->
    <view v-else class="t-card mt-4 p-5">
      <view class="text-[15px] text-[#26221D] font-semibold">
        短信验证
      </view>
      <view class="mt-1 text-[13px] text-[#8F8981] leading-relaxed">
        验证码将发送到 {{ phoneText || '绑定手机号' }}
      </view>

      <view class="mt-4">
        <TField label="验证码" required>
          <view class="flex items-center gap-2">
            <input v-model="code" class="t-input min-w-0 flex-1" type="number" :maxlength="6" placeholder="请输入 6 位验证码">
            <TButton size="sm" type="ghost" :loading="sending" :disabled="countdown > 0" @click="sendSms">
              {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
            </TButton>
          </view>
        </TField>
      </view>

      <view v-if="errMsg" class="mt-3">
        <view class="t-readout t-readout--error">
          <text class="i-tabler-alert-triangle text-[15px]" />
          <text class="flex-1">{{ errMsg }}</text>
        </view>
      </view>

      <view class="mt-5">
        <TButton block size="lg" type="danger" :loading="submitting" :disabled="!codeValid" @click="submitDelete">
          {{ submitting ? '正在注销' : '确认注销账号' }}
        </TButton>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TIRE-M1 · 登录授权 + 全局用户态
 *
 * 两步走，同页切换，不做多余跳转：
 *   ① 授权：微信一键登录（H5 用设备标识走演示登录）
 *   ② 完善：选身份 → 勾协议 → 写入 profile → 回首页
 *
 * 交互状态：按钮 loading / 协议未勾 shake / 身份未选提示 / 登录失败内联重试。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TBrand from '@/components/tire/TBrand.vue'
import TButton from '@/components/tire/TButton.vue'
import { http } from '@/tire/request'
import { DRIVER_ROLE_OPTIONS, useTire } from '@/tire/store'
import { deviceId, errCode, errText, go, toast } from '@/tire/utils'
import type { PageQuery } from '@/tire/types'

const tire = useTire()

/** 1 = 授权登录；2 = 完善身份 */
const step = ref<1 | 2>(1)
const loading = ref(false)
const saving = ref(false)
/** 登录失败的内联错误（不用 toast，方便用户看清原因后重试） */
const errMsg = ref('')

const role = ref('')
const agreed = ref(false)
const agreeShake = ref(false)
const roleShake = ref(false)
/** 登录来源页：带 redirect 参数时回跳，否则回首页 */
const redirect = ref('')

/** 身份选项与文案统一取自全局字典，资料页与这里保持一致 */
const ROLES = DRIVER_ROLE_OPTIONS

const roleName = computed(() => ROLES.find(r => r.value === role.value)?.label || '')
/** 仅用于按钮下方的提示文案；按钮本身保持可点，点了才做 shake 校验 */
const ready = computed(() => !!role.value && agreed.value)

onLoad((options: PageQuery = {}) => {
  redirect.value = options?.redirect ? decodeURIComponent(options.redirect) : ''
  // 已登录：本地 me 可能还没拉回来，先刷新再决定停在第一步还是直接进站
  if (tire.loggedIn)
    initLoggedIn()
})

/** 已登录但身份没选：直接进第二步，只补身份 */
async function initLoggedIn() {
  await tire.loadMe()
  if (tire.me?.role)
    jumpIn()
  else step.value = 2
}

function jumpIn() {
  if (redirect.value) {
    go(redirect.value)
    return
  }
  uni.switchTab({ url: '/pages/index/index' })
}

/** 取微信登录 code：MP 走 uni.login；H5 演示模式用设备标识保持同一账号 */
function getLoginCode(): Promise<string> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: 'weixin',
      success: r => resolve(r.code || deviceId()),
      fail: () => resolve(deviceId()),
    })
    return
    // #endif
    // #ifndef MP-WEIXIN
    resolve(deviceId())
    // #endif
  })
}

async function login() {
  if (loading.value)
    return
  loading.value = true
  errMsg.value = ''
  try {
    const code = await getLoginCode()
    const data = await http.post<{ accessToken: string }>('/app/auth/login', { code }, { silent: true })
    tire.setToken(data.accessToken)
    await tire.loadMe()
    if (tire.me?.role) {
      toast('欢迎回来')
      setTimeout(jumpIn, 400)
    }
    else {
      step.value = 2
    }
  }
  catch (e) {
    errMsg.value = errText(e, '登录没有成功，请检查网络后重试')
  }
  finally {
    loading.value = false
  }
}

/** 未勾协议：抖一下并在复选框旁给出原因，比只弹 toast 更容易定位 */
function requireAgree() {
  agreeShake.value = true
  toast('请先阅读并同意协议')
  setTimeout(() => {
    agreeShake.value = false
  }, 400)
}

function pickRole(v: string) {
  role.value = v
  roleShake.value = false
}

async function submit() {
  if (saving.value)
    return
  if (!role.value) {
    roleShake.value = true
    toast('请选择你的身份')
    setTimeout(() => {
      roleShake.value = false
    }, 400)
    return
  }
  if (!agreed.value) {
    requireAgree()
    return
  }
  saving.value = true
  try {
    await http.patch('/app/profile', { role: role.value }, { silent: true })
    await tire.loadMe()
    toast(`已按「${roleName.value}」为你服务`)
    setTimeout(jumpIn, 500)
  }
  catch (e) {
    if (errCode(e) === 40001) {
      step.value = 1
      errMsg.value = '登录已过期，请重新授权'
    }
    else {
      toast(errText(e, '保存失败，请稍后再试'))
    }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="t-shell t-shell--plain">
    <!-- 品牌头图：纯 CSS 渐变 + 轮胎纹理 -->
    <view class="t-hero pt-10">
      <view class="t-hero__inner">
        <TBrand size="lg" light sub="TIRE RESCUE" />
        <view class="t-hero__title mt-5">
          轮胎出问题
          <br>
          先找小蚂蚁
        </view>
        <view class="t-hero__sub">
          24 小时轮胎救援 · 平台就近调度 · 线下门店服务
        </view>
        <view class="t-hero__chips">
          <view class="t-hero__chip">
            <text class="i-tabler-clock text-[13px]" />
            <text>24 小时响应</text>
          </view>
          <view class="t-hero__chip">
            <text class="i-tabler-map-pin text-[13px]" />
            <text>就近派单</text>
          </view>
          <view class="t-hero__chip">
            <text class="i-tabler-shield-check text-[13px]" />
            <text>平台客服跟进</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 步骤条：让用户知道「还差几步」 -->
    <view class="mx-4 -mt-5">
      <view class="t-card flex items-center px-4 py-3">
        <view class="flex items-center gap-2">
          <view class="h-6 w-6 flex items-center justify-center rounded-full text-[12px] font-bold" :class="step >= 1 ? 'bg-[#E8721C] text-white' : 'bg-[#EEEAE3] text-[#A8A199]'">
            1
          </view>
          <text class="text-[13px]" :class="step >= 1 ? 'font-semibold text-[#26221D]' : 'text-[#8F8981]'">授权登录</text>
        </view>
        <view class="mx-2 h-[1px] flex-1 bg-[#EEEAE3]" />
        <view class="flex items-center gap-2">
          <view class="h-6 w-6 flex items-center justify-center rounded-full text-[12px] font-bold" :class="step >= 2 ? 'bg-[#E8721C] text-white' : 'bg-[#EEEAE3] text-[#A8A199]'">
            2
          </view>
          <text class="text-[13px]" :class="step >= 2 ? 'font-semibold text-[#26221D]' : 'text-[#8F8981]'">完善身份</text>
        </view>
      </view>
    </view>

    <!-- 第一步：授权登录 -->
    <view v-if="step === 1" class="t-page-pad mt-4">
      <view class="t-card p-5">
        <view class="text-[17px] text-[#26221D] font-bold">
          微信一键登录
        </view>
        <view class="mt-1 text-[13px] text-[#8F8981] leading-relaxed">
          登录后才能提交救援、查看服务进度。仅用于账号识别，不会发布任何内容。
        </view>

        <view class="mt-5">
          <TButton block size="lg" icon="i-tabler-brand-wechat" :loading="loading" @click="login">
            {{ loading ? '正在登录' : '微信一键登录' }}
          </TButton>
        </view>

        <!-- 登录失败：内联说明 + 重试，不用弹窗打断 -->
        <view v-if="errMsg" class="mt-3">
          <view class="t-readout t-readout--error">
            <text class="i-tabler-alert-triangle text-[15px]" />
            <text class="flex-1">{{ errMsg }}</text>
            <text class="font-semibold underline" @click="login">重试</text>
          </view>
        </view>

        <view class="mt-4 rounded-xl bg-[#FBF8F3] px-3 py-2.5">
          <view class="flex items-start gap-2 text-[12px] text-[#8F8981] leading-relaxed">
            <text class="i-tabler-info-circle mt-[2px] text-[14px]" />
            <text>开发演示模式：同一设备自动保持同一账号，换设备即为新用户。</text>
          </view>
        </view>
      </view>

      <view class="mt-4 text-center text-[12px] text-[#A8A199] leading-relaxed">
        遇到爆胎、扎钉、缺气，可先点「故障找救援」
        <br>
        平台客服会电话联系你确认位置
      </view>
    </view>

    <!-- 第二步：选身份 + 协议 -->
    <view v-else class="t-page-pad mt-4">
      <view class="t-card p-5">
        <view class="text-[17px] text-[#26221D] font-bold">
          你是哪类用户
        </view>
        <view class="mt-1 text-[13px] text-[#8F8981]">
          方便平台安排合适的门店与报价方式，之后可在「我的」里修改。
        </view>

        <view class="mt-4 flex flex-col gap-2.5" :class="{ 't-shake': roleShake }">
          <view
            v-for="r in ROLES"
            :key="r.value"
            class="t-choice flex items-center gap-3 px-4 py-3.5"
            :class="{ 'is-active': role === r.value }"
            @click="pickRole(r.value)"
          >
            <view
              class="h-10 w-10 flex flex-shrink-0 items-center justify-center rounded-xl text-[20px]"
              :class="role === r.value ? 'bg-[#E8721C] text-white' : 'bg-[#F1EEE8] text-[#55504A]'"
            >
              <text :class="r.icon" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="text-[15px] text-[#26221D] font-semibold">
                {{ r.label }}
              </view>
              <view class="mt-0.5 text-[12px] text-[#8F8981] leading-snug">
                {{ r.desc }}
              </view>
            </view>
            <view v-if="role === r.value" class="t-choice__tick">
              <text class="i-tabler-check" />
            </view>
          </view>
        </view>

        <!-- 协议：未勾选时描红并抖动 -->
        <view class="t-check mt-5" :class="{ 'is-error': agreeShake }" @click="agreed = !agreed">
          <view class="t-check__box" :class="{ 'is-on': agreed }">
            <text v-if="agreed" class="i-tabler-check" />
          </view>
          <view class="flex-1">
            <text>我已阅读并同意</text>
            <text class="t-link" @click.stop="go('/pkg-me/about?tab=agreement')">《用户协议》</text>
            <text>与</text>
            <text class="t-link" @click.stop="go('/pkg-me/about?tab=privacy')">《隐私政策》</text>
          </view>
        </view>

        <view class="mt-5">
          <TButton block size="lg" :loading="saving" :disabled="saving" @click="submit">
            {{ saving ? '正在保存' : '完成，进入首页' }}
          </TButton>
        </view>

        <view v-if="!ready && !saving" class="mt-2 text-center text-[12px] text-[#A8A199]">
          {{ !role ? '请先选择身份' : '请勾选协议后继续' }}
        </view>
      </view>

      <view class="mt-4 flex items-center justify-center gap-1 text-[12px] text-[#A8A199]">
        <text class="i-tabler-lock text-[13px]" />
        <text>手机号仅在提交救援后由客服联系使用</text>
      </view>
    </view>
  </view>
</template>

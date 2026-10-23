<script setup lang="ts">
/**
 * TIRE-M4 · 我的（tabbar）
 *
 * 资料头 + 菜单 + 退出。游客也能看 FAQ / 客服 / 关于，
 * 涉及个人数据的入口（资料 / 海报）先引导登录。
 * 司机身份（私人车主 / 车队 / 服务门店）未完善时持续展示高亮引导条，直到选完身份。
 */
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TCell from '@/components/tire/TCell.vue'
import TPhoneSheet from '@/components/tire/TPhoneSheet.vue'
import { http } from '@/tire/request'
import { useShare } from '@/tire/share'
import { DRIVER_ROLE_NAMES, useTire } from '@/tire/store'
import { absUrl, call, go, toast } from '@/tire/utils'
import type { AppSettings } from '@/tire/types'

const tire = useTire()

/** 微信小程序：转发 / 朋友圈标题取后台「分享标题」 */
useShare()

const loading = ref(false)
const servicePhone = ref('')

const avatar = computed(() => {
  const u = tire.me?.avatarUrl
  return u ? absUrl(u) : '/static/images/default-avatar.png'
})
const nickname = computed(() => tire.me?.nickname || (tire.loggedIn ? '微信用户' : '未登录'))
const roleName = computed(() => (tire.me?.role ? DRIVER_ROLE_NAMES[tire.me.role] || '已认证' : ''))
const phoneText = computed(() => tire.me?.phone || '点击绑定')
/** 司机身份未完善：资料已加载且 role 为空，持续展示引导条（issue #9） */
const roleGuide = computed(() => tire.loggedIn && !!tire.me && !tire.me.role)

/** 绑手机号弹层（演示输入 / 微信快捷验证由 TPhoneSheet 统一处理） */
const phoneSheet = ref(false)

onShow(async () => {
  if (!tire.loggedIn)
    return
  loading.value = true
  await tire.loadMe()
  loading.value = false
})

async function loadPhoneSetting() {
  if (servicePhone.value)
    return
  try {
    const s = await http.get<Partial<AppSettings>>('/app/settings', undefined, { silent: true })
    servicePhone.value = s?.servicePhone || ''
  }
  catch {
    // 客服电话拿不到时，菜单里仍然可以进入「联系客服」页查看
  }
}

loadPhoneSetting()

function requireLogin(): boolean {
  if (tire.loggedIn)
    return true
  go('/pkg-auth/login')
  return false
}

function openProfile() {
  if (!requireLogin())
    return
  go('/pkg-me/profile')
}

function openPoster() {
  if (!requireLogin())
    return
  go('/pkg-share/poster')
}

function openRecords() {
  if (!requireLogin())
    return
  go('/pkg-me/records')
}

function openPhoneSheet() {
  if (!requireLogin())
    return
  phoneSheet.value = true
}

function onCallService() {
  if (servicePhone.value) {
    call(servicePhone.value)
    return
  }
  go('/pkg-me/contact')
}

/** 账号注销入口：进入注销流程页（影响说明 + 短信二次验证，issue #10） */
function onAccountDelete() {
  if (!tire.loggedIn) {
    toast('请先登录后再注销账号')
    return
  }
  go('/pkg-me/account-delete')
}

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后需要重新授权才能提交救援，确定退出吗？',
    confirmText: '退出',
    confirmColor: '#D93025',
    success: (r) => {
      if (!r.confirm)
        return
      tire.logout()
      uni.switchTab({ url: '/pages/index/index' })
      setTimeout(() => toast('已退出登录'), 300)
    },
  })
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "我的",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2"
  }
}
</route>

<template>
  <view class="t-shell">
    <!-- 资料头 -->
    <view class="t-hero me-hero">
      <view class="t-hero__inner">
        <view v-if="loading && !tire.me" class="me-loading">
          <view class="me-avatar me-avatar--ph" />
          <view class="flex-1">
            <view class="t-sk h-4 w-28" />
            <view class="t-sk mt-2 h-3 w-40" />
          </view>
        </view>

        <view v-else class="flex items-center gap-3">
          <image class="me-avatar" :src="avatar" mode="aspectFill" />
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="me-name">{{ nickname }}</text>
              <view v-if="roleName" class="me-role">
                <text>{{ roleName }}</text>
              </view>
            </view>
            <view class="me-phone" @click.stop="tire.loggedIn ? openPhoneSheet() : go('/pkg-auth/login')">
              <text class="i-tabler-phone text-[12px]" />
              <text>{{ tire.loggedIn ? phoneText : '登录后提交救援' }}</text>
              <text v-if="tire.loggedIn && !tire.me?.phone" class="me-phone__bind">去绑定</text>
            </view>
          </view>
          <view class="me-edit" @click="openProfile">
            <text class="i-tabler-settings" />
          </view>
        </view>

        <!-- 快捷入口：把最常用的两件事提到头部 -->
        <view class="me-quick">
          <view class="me-quick__item" @click="openProfile">
            <text class="i-tabler-user-circle me-quick__ico" />
            <view>
              <view class="me-quick__t">
                个人资料
              </view>
              <view class="me-quick__d">
                昵称 · 头像 · 身份
              </view>
            </view>
          </view>
          <view class="me-quick__line" />
          <view class="me-quick__item" @click="onCallService">
            <text class="i-tabler-headset me-quick__ico" />
            <view>
              <view class="me-quick__t">
                联系客服
              </view>
              <view class="me-quick__d">
                {{ servicePhone || '电话 / 微信' }}
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="t-page-pad -mt-4">
      <!-- 未登录引导 -->
      <view v-if="!tire.loggedIn" class="t-card p-4">
        <view class="flex items-center gap-3">
          <view class="h-10 w-10 flex items-center justify-center rounded-xl bg-[#FDF0E4] text-[20px] text-[#C85E0F]">
            <text class="i-tabler-user-question" />
          </view>
          <view class="flex-1">
            <view class="text-[15px] font-semibold">
              登录后提交救援更快
            </view>
            <view class="mt-0.5 text-[12px] text-[#8F8981]">
              一键登录，自动带出手机号与历史信息
            </view>
          </view>
          <TButton size="sm" @click="go('/pkg-auth/login')">
            去登录
          </TButton>
        </view>
      </view>

      <!-- 司机身份未完善：高亮引导，选完身份（私人车主/车队/服务门店）后自动消失 -->
      <view v-if="roleGuide" class="t-card mt-3 role-guide" @click="openProfile">
        <view class="flex items-center gap-3">
          <view class="h-10 w-10 flex flex-shrink-0 items-center justify-center rounded-xl bg-[#E8721C] text-[20px] text-white">
            <text class="i-tabler-user-cog" />
          </view>
          <view class="min-w-0 flex-1">
            <view class="text-[15px] font-semibold">
              完善司机身份
            </view>
            <view class="mt-0.5 text-[12px] text-[#8F8981]">
              选择私人车主 / 车队 / 服务门店，平台才能安排合适的门店
            </view>
          </view>
          <view class="role-guide__btn">
            去完善
          </view>
        </view>
      </view>

      <!-- 菜单 -->
      <view class="t-cell-group mt-3">
        <TCell title="个人资料" icon="i-tabler-id" @click="openProfile" />
        <TCell title="我的记录" icon="i-tabler-clipboard-list" value="救援 / 咨询进度" @click="openRecords" />
        <TCell title="分享海报" icon="i-tabler-share" @click="openPoster" />
        <TCell title="常见问题" icon="i-tabler-help-circle" @click="go('/pkg-me/faq')" />
        <TCell title="联系客服" icon="i-tabler-headset" :value="servicePhone || '电话 / 微信'" @click="go('/pkg-me/contact')" />
        <TCell title="关于我们" icon="i-tabler-info-circle" @click="go('/pkg-me/about')" />
      </view>

      <!-- 账号与安全 -->
      <view class="mt-4 px-1">
        <view class="t-section-title">
          账号与安全
        </view>
      </view>
      <view class="t-cell-group mt-2">
        <TCell title="账号注销" icon="i-tabler-user-minus" @click="onAccountDelete" />
      </view>

      <!-- 服务承诺：给「为什么要留手机号」一个可信解释 -->
      <view class="t-card mt-3 p-4">
        <view class="t-section-title">
          平台服务说明
        </view>
        <view class="mt-2 flex flex-col gap-2">
          <view class="me-note">
            <text class="i-tabler-clock me-note__ico" />
            <text>24 小时接单，夜间与节假日照常调度</text>
          </view>
          <view class="me-note">
            <text class="i-tabler-shield-check me-note__ico" />
            <text>门店信息平台核验，报价由客服电话确认</text>
          </view>
          <view class="me-note">
            <text class="i-tabler-phone me-note__ico" />
            <text>手机号仅用于本次服务联系，不做营销外呼</text>
          </view>
        </view>
      </view>

      <!-- 退出登录 -->
      <view v-if="tire.loggedIn" class="mt-4">
        <TButton block type="ghost" size="md" icon="i-tabler-logout" @click="logout">
          退出登录
        </TButton>
      </view>

      <view class="py-5 text-center text-[11px] text-[#A8A199]">
        小蚂蚁轮胎救援 · 平台调度 · 线下服务
      </view>
    </view>

    <!-- 绑定 / 改绑手机号 -->
    <TPhoneSheet
      v-model:show="phoneSheet"
      :title="tire.me?.phone ? '更换手机号' : '绑定手机号'"
      :bound-toast="tire.me?.phone ? '手机号已更新' : '手机号已绑定'"
    />
  </view>
</template>

<style scoped lang="scss">
.me-hero {
  padding-top: 18px;
  padding-bottom: 30px;
}

.me-avatar {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.3);
}

/* 资料加载中的头像占位：玻璃底 + 内圈 */
.me-avatar--ph {
  box-shadow: inset 0 0 0 6px rgba(255, 255, 255, 0.16);
}

.me-loading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.me-name {
  max-width: 160px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 19px;
  font-weight: 800;
  color: #fff;
}

.me-role {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.me-phone {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.me-phone__bind {
  margin-left: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #7a3406;
  background: #ffe0bf;
}

.me-edit {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 17px;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.26);
}

.me-edit:active {
  background: rgba(255, 255, 255, 0.3);
}

/* 头部快捷入口：玻璃卡片并排 */
.me-quick {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding: 10px 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
}

.me-quick__item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px;
}

.me-quick__item:active {
  opacity: 0.8;
}

.me-quick__line {
  width: 1px;
  height: 26px;
  background: rgba(255, 255, 255, 0.25);
}

.me-quick__ico {
  font-size: 20px;
  color: #fff;
}

.me-quick__t {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.me-quick__d {
  margin-top: 1px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.82);
}

.me-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}

.me-note__ico {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 14px;
  color: var(--brand);
}

/* 身份未完善引导：品牌橙描边卡片，吸引用户点进资料页完成选择 */
.role-guide {
  padding: 14px 16px;
  border: 1px solid rgba(232, 114, 28, 0.35);
  background: linear-gradient(135deg, #fff8f1, #ffffff);
}

.role-guide__btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
  box-shadow: 0 6px 12px -6px rgba(232, 114, 28, 0.7);
}
</style>

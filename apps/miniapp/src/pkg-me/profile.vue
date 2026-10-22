<script setup lang="ts">
/**
 * 个人资料（pkg-me）
 *
 * 头像先上传拿到 /uploads 路径，保存时随昵称/身份一起 PATCH，成功后 loadMe 同步全局，
 * 这样首页、我的页拿到的都是最新资料。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TField from '@/components/tire/TField.vue'
import TSheet from '@/components/tire/TSheet.vue'
import TState from '@/components/tire/TState.vue'
import { http, uploadImage } from '@/tire/request'
import { DRIVER_ROLE_NAMES, useTire } from '@/tire/store'
import { absUrl, back, go, toast } from '@/tire/utils'

const tire = useTire()

const ROLES = [
  { value: 'private_owner', label: '私人车主', desc: '小车 / 私家车为主', icon: 'i-tabler-car' },
  { value: 'fleet', label: '车队', desc: '多车统一调度', icon: 'i-tabler-truck' },
  { value: 'store', label: '服务门店', desc: '接收平台派单', icon: 'i-tabler-building-store' },
]

const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)

const nickname = ref('')
const avatarUrl = ref('')
const role = ref('')
const phone = ref('')

/** 保存前的快照，用于判断「有没有改动」 */
const snapshot = ref('')

const phoneSheet = ref(false)
const phoneVal = ref('')
const phoneErr = ref('')
const phoneLoading = ref(false)
const demoLogin = ref(true)

const avatarSrc = computed(() => (avatarUrl.value ? absUrl(avatarUrl.value) : '/static/images/default-avatar.png'))
const roleName = computed(() => (role.value ? DRIVER_ROLE_NAMES[role.value] || '未设置' : '未设置'))
const dirty = computed(() => JSON.stringify([nickname.value.trim(), avatarUrl.value, role.value]) !== snapshot.value)

async function loadDemoFlag() {
  try {
    const s = await http.get('/app/settings', undefined, { silent: true })
    demoLogin.value = s?.demoLogin !== false
  }
  catch {
    // 设置读取失败不影响资料编辑，手机号绑定会由后端再次校验
  }
}

onLoad(async () => {
  if (!tire.loggedIn) {
    loading.value = false
    return
  }
  loadDemoFlag()
  await tire.loadMe()
  const me = tire.me || {}
  nickname.value = me.nickname || ''
  avatarUrl.value = me.avatarUrl || ''
  role.value = me.role || ''
  phone.value = me.phone || ''
  snapshot.value = JSON.stringify([nickname.value.trim(), avatarUrl.value, role.value])
  loading.value = false
})

/** 头像：选一张 → 上传 → 拿到服务端路径（保存时才写入资料） */
function chooseAvatar() {
  if (uploading.value)
    return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const path = (res.tempFilePaths || [])[0]
      if (!path)
        return
      uploading.value = true
      try {
        const r = await uploadImage(path)
        avatarUrl.value = r.url
        toast('头像已就绪，记得点保存')
      }
      catch {
        toast('头像上传失败，请重试')
      }
      finally {
        uploading.value = false
      }
    },
  })
}

function pickRole(v: string) {
  role.value = v
}

function openPhoneSheet() {
  phoneVal.value = phone.value
  phoneErr.value = ''
  phoneSheet.value = true
}

async function finishBind(next: string) {
  phone.value = next
  await tire.loadMe()
  phoneSheet.value = false
  toast('手机号已更新')
}

async function bindPhone() {
  if (!demoLogin.value) {
    phoneErr.value = '请使用微信手机号快捷绑定'
    return
  }
  const v = phoneVal.value.trim()
  if (!/^1\d{10}$/.test(v)) {
    phoneErr.value = '请输入 11 位手机号'
    return
  }
  if (phoneLoading.value)
    return
  phoneLoading.value = true
  phoneErr.value = ''
  try {
    await http.post('/app/auth/phone', { phone: v }, { silent: true })
    await finishBind(v)
  }
  catch (e: any) {
    phoneErr.value = e?.message || '更新失败，请稍后再试'
  }
  finally {
    phoneLoading.value = false
  }
}

/** 微信手机号快捷验证 */
async function onWxPhone(e: any) {
  const code = e?.detail?.code
  if (!code) {
    phoneErr.value = '未授权手机号，请重试'
    return
  }
  if (phoneLoading.value)
    return
  phoneLoading.value = true
  phoneErr.value = ''
  try {
    await http.post('/app/auth/phone', { wxPhoneCode: code }, { silent: true })
    const me = await tire.loadMe()
    await finishBind(me?.phone || phone.value)
  }
  catch (err: any) {
    phoneErr.value = err?.message || '手机号验证失败，请稍后再试'
  }
  finally {
    phoneLoading.value = false
  }
}

async function save() {
  if (!nickname.value.trim()) {
    toast('昵称不能为空')
    return
  }
  if (!role.value) {
    toast('请选择身份')
    return
  }
  if (saving.value)
    return
  saving.value = true
  try {
    await http.patch('/app/profile', {
      nickname: nickname.value.trim(),
      avatarUrl: avatarUrl.value,
      role: role.value,
    }, { silent: true })
    await tire.loadMe()
    snapshot.value = JSON.stringify([nickname.value.trim(), avatarUrl.value, role.value])
    toast('已保存')
    setTimeout(() => back('/pages/me/index'), 500)
  }
  catch (e: any) {
    if (e?.code === 40001) {
      toast('登录已过期，请重新登录')
      go('/pkg-auth/login')
    }
    else {
      toast(e?.message || '保存失败，请稍后再试')
    }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="t-shell t-shell--plain">
    <!-- 未登录 -->
    <view v-if="!tire.loggedIn && !loading" class="t-page-pad pt-6">
      <view class="t-card">
        <TState
          type="empty"
          title="登录后查看个人资料"
          desc="登录即可维护昵称、头像与身份，救援时自动带出联系方式。"
          action-text="去登录"
          @action="go('/pkg-auth/login')"
        />
      </view>
    </view>

    <template v-else>
      <!-- 头像 -->
      <view class="t-page-pad pt-4">
        <view class="t-card flex items-center gap-4 p-4">
          <view class="avatar" @click="chooseAvatar">
            <image class="avatar__img" :src="avatarSrc" mode="aspectFill" />
            <view class="avatar__badge">
              <text :class="uploading ? 'i-tabler-loader-2' : 'i-tabler-camera'" />
            </view>
            <view v-if="uploading" class="avatar__mask">
              <view class="t-photo__spin" />
            </view>
          </view>
          <view class="flex-1">
            <view class="text-[15px] font-semibold">
              头像
            </view>
            <view class="mt-1 text-[12px] text-[#8F8981] leading-relaxed">
              {{ uploading ? '上传中，请稍候' : '点击更换，建议使用清晰的正方形照片' }}
            </view>
          </view>
        </view>
      </view>

      <!-- 基本资料 -->
      <view class="t-page-pad mt-3">
        <view class="t-card px-4 py-1">
          <TField label="昵称" required>
            <input v-model="nickname" class="t-input" placeholder="怎么称呼你" :maxlength="20">
          </TField>

          <TField label="手机号" hint="救援时客服通过该号码联系你">
            <template #aside>
              <text class="t-field__aside" @click="openPhoneSheet">
                <text class="i-tabler-edit text-[13px]" />
                {{ phone ? '更换' : '绑定' }}
              </text>
            </template>
            <view class="t-readout" :class="{ 't-readout--muted': !phone }">
              <text class="i-tabler-phone text-[15px]" />
              <text class="flex-1">{{ phone || '还未绑定手机号' }}</text>
            </view>
          </TField>
        </view>
      </view>

      <!-- 身份 -->
      <view class="t-page-pad mt-3">
        <view class="t-card p-4">
          <view class="flex items-center justify-between">
            <view class="t-section-title">
              身份
            </view>
            <text class="text-[12px] text-[#8F8981]">当前：{{ roleName }}</text>
          </view>
          <view class="t-hint mt-1">
            影响平台给你安排的门店类型与报价方式
          </view>

          <view class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="r in ROLES"
              :key="r.value"
              class="t-choice flex items-center gap-3 px-4 py-3"
              :class="{ 'is-active': role === r.value }"
              @click="pickRole(r.value)"
            >
              <view
                class="h-9 w-9 flex flex-shrink-0 items-center justify-center rounded-xl text-[18px]"
                :class="role === r.value ? 'bg-[#E8721C] text-white' : 'bg-[#F1EEE8] text-[#55504A]'"
              >
                <text :class="r.icon" />
              </view>
              <view class="flex-1">
                <view class="text-[14px] font-semibold">
                  {{ r.label }}
                </view>
                <view class="text-[11px] text-[#8F8981]">
                  {{ r.desc }}
                </view>
              </view>
              <view v-if="role === r.value" class="t-choice__tick">
                <text class="i-tabler-check" />
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 保存 -->
      <view class="t-page-pad mt-4 pb-6">
        <TButton block size="lg" :loading="saving" :disabled="!dirty || uploading" @click="save">
          {{ saving ? '保存中' : dirty ? '保存修改' : '资料已是最新' }}
        </TButton>
      </view>
    </template>

    <!-- 手机号绑定 -->
    <TSheet
      v-model:show="phoneSheet"
      :title="phone ? '更换手机号' : '绑定手机号'"
      desc="请填写常用号码，客服联系不上会影响救援派单。"
      confirm-text="保存"
      :show-confirm="demoLogin"
      :confirm-loading="phoneLoading"
      @confirm="bindPhone"
    >
      <!-- #ifdef MP-WEIXIN -->
      <view v-if="!demoLogin" class="t-field" style="border-bottom: none; padding-top: 0">
        <button
          class="t-btn t-btn--primary t-btn--lg t-btn--block"
          style="border: none"
          open-type="getPhoneNumber"
          @getphonenumber="onWxPhone"
        >
          {{ phone ? '微信手机号快捷更换' : '微信手机号快捷绑定' }}
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
      </view>
      <!-- #ifndef MP-WEIXIN -->
      <view v-if="!demoLogin" class="t-hint">
        当前环境不支持微信手机号授权，请在小程序内完成绑定
      </view>
      <!-- #endif -->
    </TSheet>
  </view>
</template>

<style scoped lang="scss">
.avatar {
  position: relative;
  width: 68px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--placeholder);
}

.avatar__img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.avatar__badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  color: #fff;
  background: var(--brand);
  border: 2px solid #fff;
}

.avatar__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(24, 21, 18, 0.42);
}
</style>

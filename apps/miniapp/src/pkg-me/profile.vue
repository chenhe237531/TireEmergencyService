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
import TPhoneSheet from '@/components/tire/TPhoneSheet.vue'
import TState from '@/components/tire/TState.vue'
import { http, uploadImage } from '@/tire/request'
import { DRIVER_ROLE_NAMES, DRIVER_ROLE_OPTIONS, useTire } from '@/tire/store'
import { absUrl, back, errCode, errText, go, toast } from '@/tire/utils'

const tire = useTire()

/** 身份选项与文案统一取自全局字典，登录页与这里保持一致 */
const ROLES = DRIVER_ROLE_OPTIONS

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

const avatarSrc = computed(() => (avatarUrl.value ? absUrl(avatarUrl.value) : '/static/images/default-avatar.png'))
const roleName = computed(() => (role.value ? DRIVER_ROLE_NAMES[role.value] || '未设置' : '未设置'))
const dirty = computed(() => JSON.stringify([nickname.value.trim(), avatarUrl.value, role.value]) !== snapshot.value)

onLoad(async () => {
  if (!tire.loggedIn) {
    loading.value = false
    return
  }
  const me = await tire.loadMe()
  nickname.value = me?.nickname || ''
  avatarUrl.value = me?.avatarUrl || ''
  role.value = me?.role || ''
  phone.value = me?.phone || ''
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
  phoneSheet.value = true
}

/** 绑定成功后同步页面上的手机号展示（含账号合并换发令牌，由 TPhoneSheet/usePhoneBind 处理） */
function onPhoneBound() {
  phone.value = tire.me?.phone || phone.value
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
  catch (e) {
    if (errCode(e) === 40001) {
      toast('登录已过期，请重新登录')
      go('/pkg-auth/login')
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
    <TPhoneSheet
      v-model:show="phoneSheet"
      :title="phone ? '更换手机号' : '绑定手机号'"
      bound-toast="手机号已更新"
      @bound="onPhoneBound"
    />
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

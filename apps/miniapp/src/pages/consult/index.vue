<script setup lang="ts">
/**
 * TIRE-M3 · 救援咨询表单（tabbar）
 *
 * 分组：车辆信息 / 当前位置 / 故障描述 / 现场照片 / 联系方式。
 * 校验即时提示 + 提交时定位到第一个错误字段；照片最多 9 张、单张 5MB、超 2MB 先压缩，
 * 逐张独立上传（弱网各自退避重试），失败照片保留本地副本进入待上传队列，
 * 不阻塞文字提交；文字提交成功后失败照片挂到记录，在「我的记录」里补传。
 */
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TBrand from '@/components/tire/TBrand.vue'
import TButton from '@/components/tire/TButton.vue'
import TField from '@/components/tire/TField.vue'
import { http, uploadImage } from '@/tire/request'
import { clearConsultDraft, loadConsultDraft, saveConsultDraft } from '@/tire/app/draft'
import { PHOTO_MAX_BYTES, PHOTO_MAX_COUNT, planPhoto, preparePhoto } from '@/tire/app/photo'
import { addPendingPhoto, attachPendingPhotosToConsult, pendingFormPhotos, persistPhotoCopy, removePendingPhotos } from '@/tire/app/photoQueue'
import { isNetworkError, retryWithBackoff } from '@/tire/app/retry'
import { canInitThirdPartySdk } from '@/tire/app/privacy'
import { useShare } from '@/tire/share'
import { useTire } from '@/tire/store'
import { errCode, errText, go, isValidPlate, submitRequestId, toast } from '@/tire/utils'
import type { Coords } from '@/tire/types'

interface Photo { temp: string, url: string, status: 'uploading' | 'done' | 'fail', size: number }

const tire = useTire()

/** 微信小程序：转发 / 朋友圈标题取后台「分享标题」 */
useShare()

const plateNo = ref('')
const carModel = ref('')
const description = ref('')
const contactName = ref('')
const contactPhone = ref('')
const photos = ref<Photo[]>([])

const locState = ref<'locating' | 'ok' | 'fail'>('locating')
const locDesc = ref('')
const coords = ref<Coords | null>(null)

const submitting = ref(false)
/** 提交过一次后才把校验错误显示出来，避免一进页面满屏红字 */
const touched = ref(false)
const focused = ref('')

const MAX_PHOTO = PHOTO_MAX_COUNT
const MAX_PHOTO_MB = PHOTO_MAX_BYTES / 1024 / 1024

/** 文字提交的弱网自动重试进度：0 表示未在重试，>0 为当前第几次重试（共 3 次） */
const submitRetryCount = ref(0)
const submitRetryTip = computed(() =>
  submitRetryCount.value > 0 ? `网络不稳，正在自动重试（${submitRetryCount.value}/3），请稍候…` : '',
)

const errors = computed(() => ({
  plateNo: !isValidPlate(plateNo.value.trim()) ? '车牌号格式不对，如 豫A8K2F6' : '',
  description: !description.value.trim() ? '请描述一下故障情况' : '',
  contactName: !contactName.value.trim() ? '请填写联系人姓名' : '',
  contactPhone: !/^1\d{10}$/.test(contactPhone.value.trim())
    ? (contactPhone.value.trim() ? '手机号格式不对，需要 11 位' : '请填写联系电话')
    : '',
}))

/** 失败照片不阻塞文字提交；上传中的照片稍等出结果（成功带上 / 失败进队列） */
const canSubmit = computed(() => Object.values(errors.value).every(v => !v) && !photos.value.some(p => p.status === 'uploading'))

// 文字字段每次变更写入本地草稿（提交成功或内容清空后由 saveConsultDraft 删除）：
// 退出页面或杀进程后内容仍在，幂等键也随草稿保留，重试不会重复建单
watch([plateNo, carModel, locDesc, description, contactName, contactPhone], ([p, m, loc, desc, name, phone]) => {
  saveConsultDraft({
    plateNo: p,
    carModel: m,
    locationDesc: loc,
    description: desc,
    contactName: name,
    contactPhone: phone,
  })
})

onLoad(async () => {
  locate()
  restoreDraft()
  restorePendingPhotos()
  if (tire.loggedIn) {
    const me = await tire.loadMe()
    if (me) {
      contactName.value = contactName.value || me.nickname || ''
      contactPhone.value = contactPhone.value || me.phone || ''
    }
  }
})

/** 恢复草稿：上次没提交成功的文字内容原样找回（幂等键与草稿同生命周期） */
function restoreDraft() {
  const d = loadConsultDraft()
  if (!d)
    return
  plateNo.value = d.plateNo
  carModel.value = d.carModel
  locDesc.value = d.locationDesc
  description.value = d.description
  contactName.value = d.contactName
  contactPhone.value = d.contactPhone
}

/**
 * 恢复待上传照片：上次选图后上传失败、且文字还没提交成功的（队列里未关联记录的条目），
 * 重新放回表单并自动重试；已提交成功记录的失败照片在「我的记录」里补传，不回表单。
 */
function restorePendingPhotos() {
  for (const p of pendingFormPhotos()) {
    photos.value.push({ temp: p.path, url: '', status: 'uploading', size: 0 })
    const item = photos.value[photos.value.length - 1]
    uploadPhoto(item)
  }
}

function locate() {
  // #ifdef APP-PLUS
  // 未同意隐私政策前不初始化高德定位 / 地图 SDK
  if (!canInitThirdPartySdk()) {
    locState.value = 'fail'
    return
  }
  // #endif
  locState.value = 'locating'
  uni.getLocation({
    type: 'gcj02',
    success: (res) => {
      coords.value = { lat: res.latitude, lng: res.longitude }
      locState.value = 'ok'
    },
    fail: () => {
      locState.value = 'fail'
    },
  })
}

/** 选图：张数与单张大小校验 → 超 2MB 先压缩 → 逐张独立上传（失败不阻塞其他照片） */
function choosePhoto() {
  const remain = MAX_PHOTO - photos.value.length
  if (remain <= 0) {
    toast(`最多上传 ${MAX_PHOTO} 张`)
    return
  }
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const files = (res.tempFiles || []) as Array<{ path: string, size: number }>
      // 张数双保险：选择器已按剩余额度限制，H5 一次多选仍可能超量
      const usable = files.filter(f => f.path).slice(0, MAX_PHOTO - photos.value.length)
      if (files.length > usable.length)
        toast(`最多上传 ${MAX_PHOTO} 张`)
      const rejected = usable.filter(f => planPhoto(f.size) === 'reject').length
      if (rejected)
        toast(`单张照片不能超过 ${MAX_PHOTO_MB}MB，已跳过 ${rejected} 张`)
      for (const f of usable) {
        if (planPhoto(f.size) === 'reject')
          continue
        photos.value.push({ temp: f.path, url: '', status: 'uploading', size: f.size })
        const item = photos.value[photos.value.length - 1]
        prepareAndUpload(item)
      }
    },
  })
}

/** 压缩（原图超 2MB 时）后上传 */
async function prepareAndUpload(item: Photo) {
  if (planPhoto(item.size) === 'compress') {
    const prepared = await preparePhoto(item.temp, item.size)
    item.temp = prepared.path
    item.size = prepared.size
  }
  await uploadPhoto(item)
}

/** 单张上传：网络错误按 1s / 3s / 9s 退避各自重试；仍失败则保留本地副本进入待上传队列 */
async function uploadPhoto(item: Photo) {
  item.status = 'uploading'
  try {
    const r = await retryWithBackoff(() => uploadImage(item.temp, { silent: true }))
    item.url = r.url
    item.status = 'done'
    // 此前失败入过队的照片重试成功：出队（本地副本由系统清理）
    removePendingPhotos([item.temp])
  }
  catch {
    item.status = 'fail'
    // 保留本地副本再入队：临时路径退出页面 / 杀进程后失效，saveFile 后的路径可持久重试
    const saved = await persistPhotoCopy(item.temp)
    item.temp = saved
    addPendingPhoto(saved)
  }
}

function removePhoto(idx: number) {
  const p = photos.value[idx]
  if (p)
    removePendingPhotos([p.temp])
  photos.value.splice(idx, 1)
}

function retryPhoto(idx: number) {
  const p = photos.value[idx]
  if (!p || p.status === 'uploading')
    return
  uploadPhoto(p)
}

/** 预览大图（已上传的走 absUrl 由 image 组件加载） */
function previewPhoto(idx: number) {
  const urls = photos.value.filter(p => p.status === 'done').map(p => p.url)
  const current = photos.value[idx]?.url || photos.value[idx]?.temp
  if (!current)
    return
  uni.previewImage({ current, urls: urls.length ? urls : [current] })
}

function onFieldFocus(key: string) {
  focused.value = key
}

/**
 * App 端提交前先引导登录（ADR-0007：游客提交咨询 driverId 为空，幂等键不生效，
 * 弱网重试会产生重复记录）；小程序 / H5 保持游客可提交（服务端支持）。
 */
function ensureLogin(): boolean {
  // #ifdef APP-PLUS
  if (!tire.loggedIn) {
    go(`/pkg-auth/login?redirect=${encodeURIComponent('/pages/consult/index')}`)
    return false
  }
  // #endif
  return true
}

/** 提交时对失败照片做一轮自动重试（并发、各自退避），返回仍失败的数量 */
async function retryFailedPhotos(): Promise<number> {
  const failed = photos.value.filter(p => p.status === 'fail')
  if (failed.length)
    await Promise.all(failed.map(p => uploadPhoto(p)))
  return photos.value.filter(p => p.status === 'fail').length
}

async function submit() {
  touched.value = true
  if (!canSubmit.value) {
    if (photos.value.some(p => p.status === 'uploading')) {
      toast('照片还在上传，稍等一下')
      return
    }
    const first = errors.value.plateNo
      ? 'plateNo'
      : errors.value.description
        ? 'description'
        : errors.value.contactName
          ? 'contactName'
          : 'contactPhone'
    focused.value = first
    toast(errors.value[first as keyof typeof errors.value] || '请把必填信息补充完整')
    return
  }
  if (!ensureLogin())
    return
  if (submitting.value)
    return
  submitting.value = true
  submitRetryCount.value = 0
  try {
    // 文字不等待图片：先重试一轮失败照片，仍失败的挂在记录上后续补传
    const failedCount = await retryFailedPhotos()
    const res = await retryWithBackoff(
      () => http.post<{ id: number, status: string }>('/app/consult', {
        plateNo: plateNo.value.trim(),
        carModel: carModel.value.trim(),
        lat: coords.value?.lat ?? null,
        lng: coords.value?.lng ?? null,
        locationDesc: locDesc.value.trim(),
        description: description.value.trim(),
        images: photos.value.filter(p => p.status === 'done').map(p => p.url),
        contactName: contactName.value.trim(),
        contactPhone: contactPhone.value.trim(),
        // 弱网重试复用同一个键，登录司机不会重复建单
        clientRequestId: submitRequestId('consult'),
      }, { silent: true }),
      {
        onRetry: (attempt) => {
          submitRetryCount.value = attempt
        },
      },
    )
    // 失败照片挂到新记录（我的记录里补传）；草稿与幂等键一并删除，下一次提交是全新意图
    if (failedCount > 0)
      attachPendingPhotosToConsult(res.id)
    clearConsultDraft()
    uni.showModal({
      title: '已提交',
      content: failedCount > 0
        ? `平台客服将尽快与您电话联系。另有 ${failedCount} 张照片未上传成功，可在「我的 - 我的记录」中补传。`
        : '平台客服将尽快与您电话联系，请保持手机畅通。',
      showCancel: false,
      confirmText: '知道了',
    })
    resetForm()
  }
  catch (e) {
    const code = errCode(e)
    if (code === 40001) {
      // 登录态失效：请求层已清 token；草稿与照片队列保留在本地，重新登录后可继续提交
      go('/pkg-auth/login')
    }
    else if (isNetworkError(e)) {
      // 自动重试耗尽：草稿与幂等键保留，再点「提交咨询」仍复用同一个键，不会重复建单
      toast('网络不太好，自动重试 3 次仍未成功；请检查网络后再次提交，不会重复提交')
    }
    else {
      toast(errText(e, '提交失败，请稍后再试'))
    }
  }
  finally {
    submitting.value = false
    submitRetryCount.value = 0
  }
}

function resetForm() {
  plateNo.value = ''
  carModel.value = ''
  description.value = ''
  locDesc.value = ''
  photos.value = []
  touched.value = false
  focused.value = ''
  // 联系方式保留：同一个人大概率继续用同一个号码
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "救援咨询",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2"
  }
}
</route>

<template>
  <view class="t-shell">
    <!-- 顶部说明：这页是「留信息等客服联系」，和首页一键呼救区分开 -->
    <view class="t-hero consult-hero">
      <view class="t-hero__inner">
        <TBrand light size="sm" />
        <view class="mt-3 text-[20px] font-extrabold leading-tight">
          说清故障，客服跟进
        </view>
        <view class="mt-1.5 text-[12px] text-white/85 leading-relaxed">
          提交后平台客服会电话确认位置与报价，不需要你逐个联系门店。
        </view>
      </view>
    </view>

    <view class="t-page-pad -mt-4">
      <!-- 车辆信息 -->
      <view class="t-card px-4 py-1">
        <TField
          label="车牌号"
          hint="不记得可不填，客服会电话确认"
          :error="touched ? errors.plateNo : ''"
        >
          <input
            v-model="plateNo"
            class="t-input"
            :class="{ 'is-error': touched && errors.plateNo, 'is-focus': focused === 'plateNo' }"
            placeholder="如 豫A8K2F6 / 豫AD12345"
            :maxlength="12"
            :cursor-spacing="90"
            @focus="onFieldFocus('plateNo')"
            @blur="focused = ''"
          >
        </TField>
        <TField label="车型">
          <input
            v-model="carModel"
            class="t-input"
            :class="{ 'is-focus': focused === 'carModel' }"
            placeholder="如 解放J6 重卡 / 大众迈腾"
            :maxlength="30"
            :cursor-spacing="90"
            @focus="onFieldFocus('carModel')"
            @blur="focused = ''"
          >
        </TField>
      </view>

      <!-- 当前位置 -->
      <view class="t-card mt-3 px-4 py-1">
        <TField label="当前位置">
          <template #aside>
            <text v-if="locState !== 'locating'" class="t-field__aside" @click="locate">
              <text class="i-tabler-refresh text-[13px]" />
              重新定位
            </text>
          </template>

          <view
            class="t-readout"
            :class="{ 't-readout--muted': locState === 'fail' }"
          >
            <text
              class="text-[15px]"
              :class="locState === 'ok' ? 'i-tabler-map-pin-filled' : locState === 'locating' ? 'i-tabler-loader-2' : 'i-tabler-map-pin-off'"
            />
            <text v-if="locState === 'locating'" class="flex-1">正在获取定位…</text>
            <text v-else-if="locState === 'ok'" class="flex-1">已定位，可在下方补充具体位置</text>
            <text v-else class="flex-1">未获取到定位，请在下方手动描述位置</text>
          </view>

          <view class="mt-2">
            <input
              v-model="locDesc"
              class="t-input"
              :class="{ 'is-focus': focused === 'locDesc' }"
              placeholder="补充位置：如 京港澳高速 K680 应急车道 / 郑州东站南广场"
              :maxlength="60"
              :cursor-spacing="90"
              @focus="onFieldFocus('locDesc')"
              @blur="focused = ''"
            >
          </view>
        </TField>
      </view>

      <!-- 故障描述 -->
      <view class="t-card mt-3 px-4 py-1">
        <TField
          label="故障描述"
          required
          :error="touched ? errors.description : ''"
          hint="写清哪个轮子、有没有漏气、车辆是否满载，能帮门店带对工具"
        >
          <textarea
            v-model="description"
            class="t-textarea"
            :class="{ 'is-error': touched && errors.description, 'is-focus': focused === 'description' }"
            placeholder="示例：右前轮爆胎，车满载停在高速应急车道，需要上门换胎"
            :maxlength="500"
            :auto-height="false"
            :cursor-spacing="110"
            :show-confirm-bar="false"
            @focus="onFieldFocus('description')"
            @blur="focused = ''"
          />
          <view class="mt-1 text-right text-[11px] text-[#A8A199]">
            {{ description.length }}/500
          </view>
        </TField>
      </view>

      <!-- 现场照片 -->
      <view class="t-card mt-3 px-4 py-4">
        <view class="flex items-center justify-between">
          <view class="t-section-title">
            现场照片
          </view>
          <text class="text-[11px] text-[#A8A199]">{{ photos.length }}/{{ MAX_PHOTO }}</text>
        </view>
        <view class="t-hint mt-1">
          拍清轮胎与周边环境，门店能提前判断需要带的配件；单张不超过 {{ MAX_PHOTO_MB }}MB
        </view>

        <view class="t-photos mt-3">
          <view v-for="(p, i) in photos" :key="p.temp" class="t-photo">
            <image class="t-photo__img" :src="p.url || p.temp" mode="aspectFill" @click="previewPhoto(i)" />
            <view v-if="p.status === 'uploading'" class="t-photo__mask">
              <view class="t-photo__spin" />
            </view>
            <view v-else-if="p.status === 'fail'" class="t-photo__mask" @click="retryPhoto(i)">
              <text class="i-tabler-refresh text-[18px] text-white" />
            </view>
            <view class="t-photo__del" @click.stop="removePhoto(i)">
              <text class="i-tabler-x" />
            </view>
          </view>

          <view v-if="photos.length < MAX_PHOTO" class="t-photo t-photo--add" @click="choosePhoto">
            <text class="i-tabler-camera text-[22px]" />
            <text>添加照片</text>
          </view>
        </view>
      </view>

      <!-- 联系方式 -->
      <view class="t-card mt-3 px-4 py-1">
        <TField label="联系人" required :error="touched ? errors.contactName : ''">
          <input
            v-model="contactName"
            class="t-input"
            :class="{ 'is-error': touched && errors.contactName, 'is-focus': focused === 'contactName' }"
            placeholder="怎么称呼你"
            :maxlength="20"
            :cursor-spacing="90"
            @focus="onFieldFocus('contactName')"
            @blur="focused = ''"
          >
        </TField>
        <TField label="手机号" required :error="touched ? errors.contactPhone : ''" hint="客服只通过这个号码联系你">
          <input
            v-model="contactPhone"
            class="t-input"
            :class="{ 'is-error': touched && errors.contactPhone, 'is-focus': focused === 'contactPhone' }"
            type="number"
            :maxlength="11"
            :cursor-spacing="90"
            placeholder="11 位手机号"
            @focus="onFieldFocus('contactPhone')"
            @blur="focused = ''"
          >
        </TField>
      </view>

      <!-- 弱网自动重试提示：只在文字提交重试期间展示 -->
      <view v-if="submitRetryTip" class="t-readout t-readout--muted mt-3">
        <text class="i-tabler-refresh text-[15px]" />
        <text class="flex-1">{{ submitRetryTip }}</text>
      </view>

      <view class="mt-3 flex items-start gap-1.5 px-1 text-[11px] text-[#A8A199] leading-relaxed">
        <text class="i-tabler-shield-check text-[13px]" />
        <text>提交即表示同意平台为本次服务联系你；登录后可在「我的 - 我的记录」查看进度与补传照片。</text>
      </view>
    </view>

    <!-- 底部提交条：吸在 tabbar 上方 -->
    <view class="consult-ft">
      <view class="consult-ft__inner">
        <view class="flex-1">
          <view class="text-[12px] font-semibold" :class="canSubmit ? 'text-[#2F7D4F]' : 'text-[#8F8981]'">
            {{ canSubmit ? '信息已填好，可以提交' : '带 * 的为必填项' }}
          </view>
          <view class="text-[11px] text-[#A8A199]">
            提交后客服电话跟进，不额外收费
          </view>
        </view>
        <TButton size="lg" :loading="submitting" :disabled="!canSubmit || submitting" @click="submit">
          {{ submitting ? '提交中' : '提交咨询' }}
        </TButton>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.consult-hero {
  padding-top: 18px;
  padding-bottom: 30px;
}

.t-shell {
  /* 底部提交条 + tabbar 的双重占位 */
  padding-bottom: calc(60px + env(safe-area-inset-bottom) + 92px);
}

.consult-ft {
  position: fixed;
  left: 0;
  right: 0;
  /* 悬浮 tabbar 顶部在 64px，这里再留 4px 空隙，避免压住圆角 */
  bottom: calc(68px + env(safe-area-inset-bottom));
  z-index: 890;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.97);
  border-top: 1px solid var(--line);
  box-shadow: 0 -6px 18px -14px rgba(38, 34, 29, 0.4);
}

.consult-ft__inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* H5 宽屏：与版心同宽居中 */
/* #ifdef H5 */
@media (min-width: 640px) {
  .consult-ft {
    left: 50%;
    right: auto;
    width: var(--shell-max);
    transform: translateX(-50%);
  }
}
/* #endif */
</style>

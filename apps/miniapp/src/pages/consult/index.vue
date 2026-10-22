<script setup lang="ts">
/**
 * TIRE-M3 · 救援咨询表单（tabbar）
 *
 * 分组：车辆信息 / 当前位置 / 故障描述 / 现场照片 / 联系方式。
 * 校验即时提示 + 提交时定位到第一个错误字段；图片逐张上传，失败可单独重试。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TBrand from '@/components/tire/TBrand.vue'
import TButton from '@/components/tire/TButton.vue'
import TField from '@/components/tire/TField.vue'
import { http, uploadImage } from '@/tire/request'
import { canInitThirdPartySdk } from '@/tire/app/privacy'
import { useShare } from '@/tire/share'
import { useTire } from '@/tire/store'
import { toast } from '@/tire/utils'

interface Photo { temp: string, url: string, status: 'uploading' | 'done' | 'fail' }

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
const coords = ref<{ lat: number, lng: number } | null>(null)

const submitting = ref(false)
/** 提交过一次后才把校验错误显示出来，避免一进页面满屏红字 */
const touched = ref(false)
const focused = ref('')

const MAX_PHOTO = 6

const errors = computed(() => ({
  description: !description.value.trim() ? '请描述一下故障情况' : '',
  contactName: !contactName.value.trim() ? '请填写联系人姓名' : '',
  contactPhone: !/^1\d{10}$/.test(contactPhone.value.trim())
    ? (contactPhone.value.trim() ? '手机号格式不对，需要 11 位' : '请填写联系电话')
    : '',
}))

const canSubmit = computed(() => Object.values(errors.value).every(v => !v) && !photos.value.some(p => p.status === 'uploading'))

onLoad(async () => {
  locate()
  if (tire.loggedIn) {
    const me = await tire.loadMe()
    if (me) {
      contactName.value = contactName.value || me.nickname || ''
      contactPhone.value = contactPhone.value || me.phone || ''
    }
  }
})

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

/** 选图 → 压缩后逐张上传；上传中显示遮罩，失败给可点重试 */
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
      const paths = (res.tempFilePaths || []) as string[]
      paths.forEach(p => photos.value.push({ temp: p, url: '', status: 'uploading' }))
      paths.forEach(p => uploadOne(p))
    },
  })
}

async function uploadOne(temp: string) {
  const item = photos.value.find(p => p.temp === temp && p.status !== 'done')
  if (!item)
    return
  item.status = 'uploading'
  try {
    const r = await uploadImage(temp)
    item.url = r.url
    item.status = 'done'
  }
  catch {
    item.status = 'fail'
  }
}

function removePhoto(idx: number) {
  photos.value.splice(idx, 1)
}

function retryPhoto(idx: number) {
  const p = photos.value[idx]
  if (!p)
    return
  p.status = 'uploading'
  uploadOne(p.temp)
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

async function submit() {
  touched.value = true
  if (!canSubmit.value) {
    if (photos.value.some(p => p.status === 'uploading')) {
      toast('照片还在上传，稍等一下')
      return
    }
    const first = errors.value.description
      ? 'description'
      : errors.value.contactName
        ? 'contactName'
        : 'contactPhone'
    focused.value = first
    toast(errors.value[first as keyof typeof errors.value] || '请把必填信息补充完整')
    return
  }
  if (submitting.value)
    return
  submitting.value = true
  try {
    await http.post('/app/consult', {
      plateNo: plateNo.value.trim(),
      carModel: carModel.value.trim(),
      lat: coords.value?.lat ?? null,
      lng: coords.value?.lng ?? null,
      locationDesc: locDesc.value.trim(),
      description: description.value.trim(),
      images: photos.value.filter(p => p.status === 'done').map(p => p.url),
      contactName: contactName.value.trim(),
      contactPhone: contactPhone.value.trim(),
    })
    uni.showModal({
      title: '已提交',
      content: '平台客服将尽快与您电话联系，请保持手机畅通。',
      showCancel: false,
      confirmText: '知道了',
    })
    resetForm()
  }
  catch (e: any) {
    toast(e?.message || '提交失败，请稍后再试')
  }
  finally {
    submitting.value = false
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
        <TField label="车牌号" hint="不记得可不填，客服会电话确认">
          <input
            v-model="plateNo"
            class="t-input"
            :class="{ 'is-focus': focused === 'plateNo' }"
            placeholder="如 豫A8K2F6"
            :maxlength="12"
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
          拍清轮胎与周边环境，门店能提前判断需要带的配件
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
            placeholder="11 位手机号"
            @focus="onFieldFocus('contactPhone')"
            @blur="focused = ''"
          >
        </TField>
      </view>

      <view class="mt-3 flex items-start gap-1.5 px-1 text-[11px] text-[#A8A199] leading-relaxed">
        <text class="i-tabler-shield-check text-[13px]" />
        <text>提交即表示同意平台为本次服务联系你；未登录也可提交，登录后可在「我的 - 我的记录」查看进度。</text>
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

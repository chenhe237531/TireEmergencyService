<script setup lang="ts">
/**
 * TIRE-M2 · 首页（tabbar）
 *
 * 结构：品牌头（客服电话 + 定位）→ 分类金刚区 → 门店列表 → 悬浮救援按钮。
 * 所有列表状态都有落点：骨架屏（首屏）/ 顶栏进度条（切分类）/ 空态 / 错误重试。
 */
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app'
import StoreCard from './components/StoreCard.vue'
import TBrand from '@/components/tire/TBrand.vue'
import TSheet from '@/components/tire/TSheet.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import TState from '@/components/tire/TState.vue'
import { http } from '@/tire/request'
import { canInitThirdPartySdk } from '@/tire/app/privacy'
import { useShare } from '@/tire/share'
import { useTire } from '@/tire/store'
import { call, clearSubmitRequestId, go, submitRequestId, toast } from '@/tire/utils'

interface StoreItem {
  id: number
  name: string
  category: string
  categoryName: string
  mainServices: string
  score: number | null
  areaLabel: string
  distanceKm: number | null
  distanceLabel: string
}

const tire = useTire()

/** 微信小程序：转发 / 朋友圈标题取后台「分享标题」 */
useShare()

/** 默认坐标：定位被拒时用它展示「默认城市」门店，避免整页空白 */
const DEFAULT_POS = { lat: 34.75, lng: 113.76 }

const settings = ref<Record<string, any>>({})
const servicePhone = computed(() => settings.value.servicePhone || '')
/** 演示登录环境允许手动输入手机号；真实微信环境用 getPhoneNumber 授权 */
const demoLogin = computed(() => settings.value.demoLogin !== false)

/** 分类：全部 + 后端 6 个分类，key 与 /app/stores 的 category 参数一致 */
const CATEGORIES = [
  { key: '', name: '全部', icon: 'i-tabler-layout-grid' },
  { key: 'tire_big', name: '大车轮胎', icon: 'i-tabler-truck' },
  { key: 'tire_small', name: '小车轮胎', icon: 'i-tabler-car' },
  { key: 'tire_both', name: '轮胎店', icon: 'i-tabler-building-store' },
  { key: 'repair_big', name: '大车修理', icon: 'i-tabler-tool' },
  { key: 'repair_small', name: '小车修理', icon: 'i-tabler-settings' },
  { key: 'towing', name: '救援拖车', icon: 'i-tabler-wrecking-ball' },
]
const activeCat = ref('')
const activeCatName = computed(() => CATEGORIES.find(c => c.key === activeCat.value)?.name || '全部')

const stores = ref<StoreItem[]>([])
const loading = ref(true)
const errorMsg = ref('')
/** 定位状态：locating 定位中 / ok 已定位 / denied 未授权走默认坐标 / manual 手动填写 */
const locState = ref<'locating' | 'ok' | 'denied' | 'manual'>('locating')
const locLabel = ref('正在获取当前位置')
const coords = ref<{ lat: number, lng: number } | null>(null)

const locSheet = ref(false)
const locDraft = ref('')
const locLatDraft = ref('')
const locLngDraft = ref('')

const rescueSheet = ref(false)
const rescueDesc = ref('')
const rescueLoading = ref(false)
const rescueErr = ref('')
const rescueVehicleType = ref('')
const rescuePlate = ref('')
const VEHICLE_TYPES = [
  { key: 'big_truck', name: '大车' },
  { key: 'small_car', name: '小车' },
  { key: 'other', name: '其他' },
]
const RESCUE_TIPS = ['高速应急车道', '桥上 / 桥下', '服务区', '小区地库', '国道 / 省道边']

const phoneSheet = ref(false)
const phoneVal = ref('')
const phoneErr = ref('')
const phoneLoading = ref(false)
/** 绑完手机号后自动继续提交救援 */
const pendingRescue = ref(false)

let loadedOnce = false
let locTimer: ReturnType<typeof setTimeout> | null = null
/** 同一批门店只上报一次曝光，避免 onShow/下拉刷新重复刷痕迹 */
let lastViewKey = ''

onLoad(() => {
  loadSettings()
  // 先拉门店，再异步定位：定位回调慢或超时也不会让首页一直空着
  loadStores({ silent: true })
  locate()
})
onShow(() => {
  // 从登录页返回时登录态可能变化：静默刷新一次列表（不闪骨架屏）
  if (loadedOnce)
    loadStores({ silent: true })
})
onUnload(() => {
  if (locTimer)
    clearTimeout(locTimer)
})

onPullDownRefresh(async () => {
  await Promise.all([loadSettings(), loadStores({ silent: true })])
  uni.stopPullDownRefresh()
})

async function loadSettings() {
  try {
    settings.value = await http.get('/app/settings', undefined, { silent: true })
  }
  catch {
    // 客服电话拿不到不影响看门店，页面里的电话条会降级为「客服电话获取中」
  }
}

/** 定位：先展示全部门店；5 秒无回调按默认城市降级，避免首页永久停在「定位中」 */
function locate() {
  // #ifdef APP-PLUS
  // 未同意隐私政策前不初始化高德定位 / 地图 SDK
  if (!canInitThirdPartySdk()) {
    coords.value = { ...DEFAULT_POS }
    locState.value = 'denied'
    locLabel.value = '同意隐私政策后可定位，展示默认城市门店'
    return
  }
  // #endif
  if (locTimer)
    clearTimeout(locTimer)
  locState.value = 'locating'
  locLabel.value = '正在获取当前位置'
  locTimer = setTimeout(() => {
    if (locState.value !== 'locating')
      return
    coords.value = { ...DEFAULT_POS }
    locState.value = 'denied'
    locLabel.value = '定位超时，展示默认城市门店'
    toast('定位超时，展示默认城市门店')
    loadStores({ silent: true })
  }, 5000)
  uni.getLocation({
    type: 'gcj02',
    success: (res) => {
      if (locTimer) {
        clearTimeout(locTimer)
        locTimer = null
      }
      coords.value = { lat: res.latitude, lng: res.longitude }
      locState.value = 'ok'
      locLabel.value = '已定位当前位置'
      loadStores({ silent: true })
    },
    fail: () => {
      if (locTimer) {
        clearTimeout(locTimer)
        locTimer = null
      }
      coords.value = { ...DEFAULT_POS }
      locState.value = 'denied'
      locLabel.value = '未授权定位，展示默认城市门店'
      toast('未授权定位，展示默认城市门店')
      loadStores({ silent: true })
    },
  })
}

async function loadStores(opts: { silent?: boolean } = {}) {
  if (!opts.silent) {
    loading.value = true
    errorMsg.value = ''
  }
  try {
    const list = await http.get<StoreItem[]>('/app/stores', {
      category: activeCat.value || undefined,
      lat: coords.value?.lat,
      lng: coords.value?.lng,
    }, { silent: true })
    stores.value = Array.isArray(list) ? list : []
    errorMsg.value = ''
    loadedOnce = true
    reportViews()
  }
  catch (e: any) {
    if (!opts.silent)
      errorMsg.value = e?.message || '门店没加载出来'
  }
  finally {
    loading.value = false
  }
}

/** 列表曝光：登录用户按当前分类批量上报，后台「浏览痕迹」才能看到真实浏览 */
function reportViews() {
  if (!tire.loggedIn || !stores.value.length)
    return
  const ids = stores.value.slice(0, 20).map(s => s.id)
  const key = `${activeCat.value}:${ids.join(',')}`
  if (key === lastViewKey)
    return
  lastViewKey = key
  http.post('/app/view-log', { storeIds: ids, action: 'view' }, { silent: true }).catch(() => {})
}

function pickCat(key: string) {
  if (activeCat.value === key)
    return
  activeCat.value = key
  lastViewKey = ''
  loadStores()
}

/** 点门店：只做对接引导 + 埋点，不暴露门店电话地址 */
function onStoreTap(s: StoreItem) {
  toast('平台将为您对接服务，详情请致电平台客服')
  if (!tire.loggedIn)
    return
  http.post('/app/view-log', { storeId: s.id, action: 'click' }, { silent: true }).catch(() => {})
}

/** 手动填写位置：描述必填，经纬度可选 */
function openLocSheet() {
  locDraft.value = locState.value === 'manual' ? locLabel.value : ''
  locLatDraft.value = coords.value ? String(coords.value.lat) : ''
  locLngDraft.value = coords.value ? String(coords.value.lng) : ''
  locSheet.value = true
}

function applyLoc() {
  const desc = locDraft.value.trim()
  if (!desc) {
    toast('请描述一下你在哪')
    return
  }
  const lat = Number(locLatDraft.value)
  const lng = Number(locLngDraft.value)
  const valid = locLatDraft.value && locLngDraft.value && !Number.isNaN(lat) && !Number.isNaN(lng)
  coords.value = valid ? { lat, lng } : { ...DEFAULT_POS }
  locState.value = 'manual'
  locLabel.value = desc
  locSheet.value = false
  loadStores()
}

function openRescue() {
  rescueDesc.value = locState.value === 'ok' || locState.value === 'manual' ? locLabel.value : ''
  rescueErr.value = ''
  // 车主的默认车型：车队更可能是大车，其余默认小车，仍可在弹层里改
  if (!rescueVehicleType.value)
    rescueVehicleType.value = tire.me?.role === 'fleet' ? 'big_truck' : 'small_car'
  rescueSheet.value = true
}

function pickTip(t: string) {
  rescueDesc.value = rescueDesc.value ? `${rescueDesc.value} · ${t}` : t
}

async function submitRescue() {
  if (rescueLoading.value)
    return
  if (!rescueVehicleType.value) {
    rescueErr.value = '请选择车型（大车 / 小车 / 其他）'
    return
  }
  rescueLoading.value = true
  rescueErr.value = ''
  try {
    await http.post('/app/rescue-alert', {
      vehicleType: rescueVehicleType.value,
      plateNo: rescuePlate.value.trim(),
      lat: coords.value?.lat ?? null,
      lng: coords.value?.lng ?? null,
      locationDesc: rescueDesc.value.trim(),
      // 弱网重试 / 杀进程后重试复用同一个键，服务端据此返回原工单
      clientRequestId: submitRequestId('rescue'),
    })
    clearSubmitRequestId('rescue')
    rescueSheet.value = false
    uni.showModal({
      title: '求助已发出',
      content: '平台已收到您的求助，客服将尽快与您电话联系。可在「我的 - 我的记录」查看进度或取消。请尽量停在安全位置并打开双闪。',
      showCancel: true,
      confirmText: '查看记录',
      cancelText: '知道了',
      success: (r) => {
        if (r.confirm)
          go('/pkg-me/records')
      },
    })
  }
  catch (e: any) {
    if (e?.code === 40011) {
      // 未绑手机号：先绑再自动重提，不让用户重新填一遍
      pendingRescue.value = true
      rescueSheet.value = false
      phoneVal.value = tire.me?.phone || ''
      phoneErr.value = ''
      phoneSheet.value = true
    }
    else if (e?.code === 40900) {
      // 2 分钟内重复提交：后端返回已有工单，直接引导查看
      rescueSheet.value = false
      uni.showModal({
        title: '已收到你的求助',
        content: '刚刚已提交过一条求助，客服正在处理。可在「我的 - 我的记录」查看进度或取消。',
        showCancel: true,
        confirmText: '查看记录',
        cancelText: '知道了',
        success: (r) => {
          if (r.confirm)
            go('/pkg-me/records')
        },
      })
    }
    else if (e?.code === 40001 || e?.code === 40003) {
      rescueSheet.value = false
    }
    else {
      rescueErr.value = e?.message || '提交失败，请稍后重试'
    }
  }
  finally {
    rescueLoading.value = false
  }
}

async function finishBind() {
  await tire.loadMe()
  phoneSheet.value = false
  toast('手机号已绑定')
  if (pendingRescue.value) {
    pendingRescue.value = false
    rescueSheet.value = true
    await submitRescue()
  }
}

async function bindPhone() {
  if (!demoLogin.value) {
    phoneErr.value = '请使用微信手机号快捷绑定'
    return
  }
  const phone = phoneVal.value.trim()
  if (!/^1\d{10}$/.test(phone)) {
    phoneErr.value = '请输入 11 位手机号'
    return
  }
  if (phoneLoading.value)
    return
  phoneLoading.value = true
  phoneErr.value = ''
  try {
    await http.post('/app/auth/phone', { phone }, { silent: true })
    await finishBind()
  }
  catch (e: any) {
    phoneErr.value = e?.message || '绑定失败，请稍后重试'
  }
  finally {
    phoneLoading.value = false
  }
}

/** 微信手机号快速验证（仅真实微信环境，演示模式不显示该入口） */
async function onWxPhone(e: any) {
  const code = e?.detail?.code
  if (!code) {
    phoneErr.value = '未授权手机号，请重试或手动输入'
    return
  }
  if (phoneLoading.value)
    return
  phoneLoading.value = true
  phoneErr.value = ''
  try {
    await http.post('/app/auth/phone', { wxPhoneCode: code }, { silent: true })
    await finishBind()
  }
  catch (err: any) {
    phoneErr.value = err?.message || '手机号验证失败，请稍后重试'
  }
  finally {
    phoneLoading.value = false
  }
}

function closePhoneSheet() {
  pendingRescue.value = false
}

function onCall() {
  if (!servicePhone.value) {
    toast('客服电话获取中，请稍后再试')
    return
  }
  call(servicePhone.value)
}

/** 未登录时救援按钮先引导登录，登录后回首页继续 */
function ensureLogin() {
  if (tire.loggedIn)
    return true
  uni.navigateTo({ url: `/pkg-auth/login?redirect=${encodeURIComponent('/pages/index/index')}` })
  return false
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "小蚂蚁轮胎救援",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2",
    "enablePullDownRefresh": true
  }
}
</route>

<template>
  <view class="t-shell">
    <!-- 品牌头：logo + 客服电话 + 定位 -->
    <view class="t-hero home-hero">
      <view class="t-hero__inner">
        <view class="flex items-center justify-between gap-3">
          <TBrand light sub="24 小时轮胎救援" />
          <view class="home-call" @click="onCall">
            <text class="i-tabler-phone-call text-[14px]" />
            <text class="home-call__txt">{{ servicePhone || '客服' }}</text>
          </view>
        </view>

        <view class="home-loc" @click="openLocSheet">
          <view class="min-w-0 flex flex-1 items-center gap-1.5">
            <text class="i-tabler-map-pin home-loc__pin" />
            <text class="home-loc__txt" :class="{ 'home-loc__txt--warn': locState === 'denied' }">
              {{ locLabel }}
            </text>
          </view>
          <view class="home-loc__act">
            <text v-if="locState === 'locating'" class="t-inline-loading__dot home-loc__spin" />
            <text class="home-loc__act-txt">{{ locState === 'locating' ? '定位中' : '修改' }}</text>
            <text class="i-tabler-chevron-right text-[13px]" />
          </view>
        </view>
      </view>
    </view>

    <!-- 分类金刚区：7 项，4 列两行 -->
    <view class="mx-4 -mt-4">
      <view class="t-card home-cats">
        <view
          v-for="c in CATEGORIES"
          :key="c.key"
          class="home-cat"
          :class="{ 'is-active': activeCat === c.key }"
          @click="pickCat(c.key)"
        >
          <view class="home-cat__ico">
            <text :class="c.icon" class="text-[20px]" />
          </view>
          <text class="home-cat__name">{{ c.name }}</text>
        </view>
      </view>
    </view>

    <!-- 列表标题 + 排序说明 -->
    <view class="t-page-pad mt-4 flex items-end justify-between">
      <view class="t-section-title">
        附近{{ activeCatName === '全部' ? '门店' : activeCatName }}
      </view>
      <view class="text-[11px] text-[#8F8981]">
        <text v-if="locState === 'locating' && stores.length">定位中，先展示全部门店</text>
        <text v-else-if="stores.length">{{ stores.length }} 家 · 已按距离由近到远排序</text>
        <text v-else>按距离由近到远排序</text>
      </view>
    </view>

    <!-- 切分类时的轻量进度提示，不清空已有列表 -->
    <view v-if="loading && stores.length" class="mx-4 mt-2 overflow-hidden rounded-full">
      <view class="t-loadbar" />
    </view>

    <view class="t-page-pad mt-3 flex flex-col gap-3">
      <!-- 首屏骨架屏 -->
      <TSkeleton v-if="loading && !stores.length" variant="store" :rows="3" />

      <!-- 加载失败：可重试 -->
      <view v-else-if="errorMsg" class="t-card">
        <TState type="error" title="门店没加载出来" :desc="errorMsg" action-text="重新加载" @action="loadStores()" />
      </view>

      <!-- 空态 -->
      <view v-else-if="!stores.length" class="t-card">
        <TState
          type="empty"
          title="附近暂时没有这类门店"
          desc="换个分类看看，或直接点右下角「故障找救援」，平台安排拖车与上门服务。"
          action-text="看全部门店"
          @action="pickCat('')"
        />
      </view>

      <StoreCard v-for="s in stores" :key="s.id" :store="s" @click="onStoreTap(s)" />

      <view v-if="stores.length" class="py-4 text-center text-[11px] text-[#A8A199] leading-relaxed">
        门店信息由平台核验，具体报价与服务由客服电话确认
      </view>
    </view>

    <!-- 悬浮救援按钮 -->
    <view class="t-fab" @click="ensureLogin() && openRescue()">
      <text class="i-tabler-sos text-[22px]" />
      <text>故障找救援</text>
    </view>

    <!-- 手动填写位置 -->
    <TSheet
      v-model:show="locSheet"
      title="手动填写位置"
      desc="定位不准或未授权时，写清你在哪，平台会按描述安排就近门店。"
      confirm-text="使用这个位置"
      @confirm="applyLoc"
    >
      <view class="t-field">
        <view class="t-field__hd">
          <text class="t-label t-label--req">位置描述</text>
        </view>
        <input v-model="locDraft" class="t-input" placeholder="如：郑州东站南广场、京港澳高速 K680 附近" :maxlength="60">
      </view>
      <view class="t-field">
        <view class="t-field__hd">
          <text class="t-label">大致经纬度（可不填）</text>
        </view>
        <view class="flex gap-2">
          <input v-model="locLatDraft" class="t-input" type="digit" placeholder="纬度 34.75">
          <input v-model="locLngDraft" class="t-input" type="digit" placeholder="经度 113.76">
        </view>
        <view class="t-hint mt-1">
          不填则按默认城市（郑州）展示门店距离
        </view>
      </view>
    </TSheet>

    <!-- 发起救援：确认位置 + 补充描述 -->
    <TSheet
      v-model:show="rescueSheet"
      title="发起故障救援"
      desc="客服会按这个位置联系你，补充一句现场情况能更快派单。"
      confirm-text="立即呼救"
      :confirm-loading="rescueLoading"
      @confirm="submitRescue"
    >
      <view class="t-field" style="border-bottom: none; padding-top: 0">
        <view class="t-field__hd">
          <text class="t-label">当前位置</text>
        </view>
        <view class="t-readout" :class="{ 't-readout--muted': locState !== 'ok' && locState !== 'manual' }">
          <text class="i-tabler-map-pin text-[15px]" />
          <text class="flex-1">{{ locLabel }}</text>
        </view>
      </view>

      <view class="t-field">
        <view class="t-field__hd">
          <text class="t-label t-label--req">车型</text>
          <text class="t-field__aside">便于安排对应门店</text>
        </view>
        <view class="flex gap-2">
          <text
            v-for="v in VEHICLE_TYPES"
            :key="v.key"
            class="t-tag"
            :class="{ 'is-active': rescueVehicleType === v.key }"
            @click="rescueVehicleType = v.key"
          >
            {{ v.name }}
          </text>
        </view>
      </view>

      <view class="t-field">
        <view class="t-field__hd">
          <text class="t-label">车牌号（选填）</text>
        </view>
        <input v-model="rescuePlate" class="t-input" placeholder="如 豫A8K2F6" :maxlength="12">
      </view>

      <view class="t-field" style="border-bottom: none; padding-top: 0">
        <view class="t-field__hd">
          <text class="t-label">补充现场情况</text>
          <text class="t-field__aside" @click="rescueDesc = ''">清空</text>
        </view>
        <input v-model="rescueDesc" class="t-input" placeholder="如：右前轮爆胎，车满载在应急车道" :maxlength="60">
        <view class="mt-2 flex flex-wrap gap-1.5">
          <text v-for="t in RESCUE_TIPS" :key="t" class="t-tag" @click="pickTip(t)">{{ t }}</text>
        </view>
      </view>

      <view v-if="rescueErr" class="t-readout t-readout--error mt-3">
        <text class="i-tabler-alert-triangle text-[15px]" />
        <text class="flex-1">{{ rescueErr }}</text>
      </view>

      <view class="mt-3 flex items-start gap-1.5 text-[11px] text-[#A8A199] leading-relaxed">
        <text class="i-tabler-info-circle text-[13px]" />
        <text>请先打开双闪、转移至护栏外安全处；平台不做现场施工，由合作门店到场服务。</text>
      </view>
    </TSheet>

    <!-- 未绑手机号：绑完自动继续提交 -->
    <TSheet
      v-model:show="phoneSheet"
      title="绑定手机号"
      desc="救援需要电话联系你确认位置，绑定后立即发出这次求助。"
      confirm-text="绑定并呼救"
      :show-confirm="demoLogin"
      :confirm-loading="phoneLoading"
      @confirm="bindPhone"
      @cancel="closePhoneSheet"
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
          仅用于本次救援联系，不会对外展示
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
.home-hero {
  padding-top: 18px;
  padding-bottom: 26px;
}

.home-call {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.home-call:active {
  background: rgba(255, 255, 255, 0.3);
}

.home-call__txt {
  font-size: 12px;
  font-weight: 600;
}

.home-loc {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
}

.home-loc__pin {
  flex-shrink: 0;
  font-size: 15px;
  color: #fff;
}

.home-loc__txt {
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.95);
}

/* 未授权定位：用暖黄提示，避免和「出错」混为一谈 */
.home-loc__txt--warn {
  color: #ffe3b8;
}

.home-loc__act {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  color: rgba(255, 255, 255, 0.9);
}

.home-loc__act-txt {
  font-size: 12px;
}

.home-loc__spin {
  width: 10px;
  height: 10px;
  border-color: #fff;
  border-right-color: transparent;
}

/* 分类：4 列网格，选中态用浅橙底 + 橙字 */
.home-cats {
  display: flex;
  flex-wrap: wrap;
  padding: 10px 4px 6px;
}

.home-cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 25%;
  padding: 6px 0 8px;
  box-sizing: border-box;
}

.home-cat__ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  color: var(--ink-2);
  background: #f4f1ec;
  transition:
    background-color 0.18s,
    color 0.18s,
    transform 0.18s;
}

.home-cat__name {
  font-size: 11px;
  color: var(--ink-2);
}

.home-cat.is-active .home-cat__ico {
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
  box-shadow: 0 6px 12px -6px rgba(232, 114, 28, 0.7);
  transform: translateY(-1px);
}

.home-cat.is-active .home-cat__name {
  font-weight: 700;
  color: var(--brand-dark);
}

.home-cat:active .home-cat__ico {
  transform: scale(0.94);
}

/* 车型选择：选中态用品牌橙，和分类金刚区保持一致 */
.t-tag.is-active {
  color: #fff;
  background: var(--brand);
  border-color: var(--brand);
}

/* 底部给悬浮按钮留出视觉空间 */
.t-shell {
  padding-bottom: calc(60px + env(safe-area-inset-bottom) + 76px);
}
</style>

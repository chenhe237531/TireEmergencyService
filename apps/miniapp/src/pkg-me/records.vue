<script setup lang="ts">
/**
 * 我的记录（pkg-me）
 *
 * 司机查看自己提交的救援 / 咨询服务进度；待处理与跟进中的救援可主动取消。
 * 咨询记录展示现场照片；文字先提交、照片未传成功的在这里标记「未上传」并可重试补传。
 * 门店只展示名称与模糊区域，不暴露电话和详细地址。
 * 页面可见期间每 30 秒轮询一次（issue #8）：状态变化由轮询链路统一提示，
 * 静默刷新的快照通过 RECORDS_REFRESH_EVENT 更新列表。
 */
import { computed, ref } from 'vue'
import { onHide, onPullDownRefresh, onShow, onUnload } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http, uploadImage } from '@/tire/request'
import { loadPendingPhotos, removePendingPhotos } from '@/tire/app/photoQueue'
import type { PendingPhoto } from '@/tire/app/photoQueue'
import { holdRecordsPolling, markRecordLocalStatus, RECORDS_REFRESH_EVENT } from '@/tire/app/recordsPoll'
import type { ConsultRecord, RescueRecord } from '@/tire/app/records'
import { retryWithBackoff } from '@/tire/app/retry'
import { absUrl, go, toast } from '@/tire/utils'

const activeTab = ref<'rescue' | 'consult'>('rescue')
const rescues = ref<RescueRecord[]>([])
const consults = ref<ConsultRecord[]>([])
const loading = ref(true)
const errMsg = ref('')
const cancellingId = ref<number | null>(null)

/** 各咨询记录的待补传照片（本地队列），展示「未上传」标记与重试入口 */
const pendingByConsult = ref<Record<number, PendingPhoto[]>>({})
/** 正在补传的咨询记录 id：按钮转圈 + 防连点 */
const retryingConsultId = ref<number | null>(null)

const activeList = computed(() => activeTab.value === 'rescue' ? rescues.value : consults.value)
const isEmpty = computed(() => !loading.value && !errMsg.value && !activeList.value.length)

const STATUS_CLASS: Record<string, string> = {
  pending: 'is-pending',
  contacting: 'is-contacting',
  resolved: 'is-resolved',
  cancelled: 'is-cancelled',
}

const canCancel = (status: string) => status === 'pending' || status === 'contacting'

function fmtTime(value?: string) {
  if (!value)
    return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime()))
    return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 从本地待上传队列按咨询记录分组（只统计已关联记录的条目） */
function refreshPending() {
  const map: Record<number, PendingPhoto[]> = {}
  for (const p of loadPendingPhotos()) {
    if (p.consultId == null)
      continue
    if (!map[p.consultId])
      map[p.consultId] = []
    map[p.consultId].push(p)
  }
  pendingByConsult.value = map
}

async function load(opts: { silent?: boolean } = {}) {
  if (!opts.silent)
    loading.value = true
  errMsg.value = ''
  try {
    const [r, c] = await Promise.all([
      http.get<{ list: RescueRecord[] }>('/app/rescue-alerts', { page: 1, pageSize: 20 }, { silent: true }),
      http.get<{ list: ConsultRecord[] }>('/app/consults', { page: 1, pageSize: 20 }, { silent: true }),
    ])
    rescues.value = r?.list || []
    consults.value = c?.list || []
    refreshPending()
  }
  catch (e: any) {
    if (!opts.silent)
      errMsg.value = e?.message || '记录没加载出来'
  }
  finally {
    loading.value = false
  }
}

/** 轮询持有句柄：页面可见期间每 30 秒静默刷新列表并感知状态变化 */
let releasePolling: (() => void) | null = null

/**
 * 轮询快照回流：静默更新两类列表与未上传照片标记。
 * 状态变化的 toast / 后台本地通知由轮询链路统一负责，这里只更新数据。
 */
function onRefreshed(snapshot: { rescues: RescueRecord[], consults: ConsultRecord[] }) {
  rescues.value = snapshot.rescues
  consults.value = snapshot.consults
  refreshPending()
}

function stopPolling() {
  releasePolling?.()
  releasePolling = null
  uni.$off(RECORDS_REFRESH_EVENT, onRefreshed)
}

onShow(() => {
  load()
  // 进入记录页立即拉取并开始 30 秒轮询；页面隐藏时释放（issue #8）
  releasePolling = holdRecordsPolling()
  // 轮询快照回流：静默更新两类列表；$off 在 stopPolling 中配对卸载
  uni.$on(RECORDS_REFRESH_EVENT, onRefreshed)
})
onHide(() => stopPolling())
onUnload(() => stopPolling())
onPullDownRefresh(async () => {
  await load({ silent: true })
  uni.stopPullDownRefresh()
})

function switchTab(tab: 'rescue' | 'consult') {
  activeTab.value = tab
}

/** 卡片点击查看详情：字段与后台一致（issue #8 验收） */
function goDetail(type: 'rescue' | 'consult', id: number) {
  go(`/pkg-me/record-detail?type=${type}&id=${id}`)
}

/** 预览咨询现场图（大图走 absUrl 拼服务端地址） */
function previewConsultImages(row: ConsultRecord, idx: number) {
  const urls = (row.images || []).map(u => absUrl(u))
  if (!urls.length)
    return
  uni.previewImage({ current: urls[idx], urls })
}

/**
 * 补传未上传照片：逐张独立上传（各自退避重试，失败不阻塞其他照片），
 * 上传成功的合并回咨询记录；仍失败的保留队列，下次进入页面或再点重试时继续。
 */
async function retryConsultPhotos(row: ConsultRecord) {
  if (retryingConsultId.value)
    return
  const pending = pendingPhotosOf(row.id)
  if (!pending.length)
    return
  retryingConsultId.value = row.id
  try {
    const uploaded: string[] = []
    const okPaths: string[] = []
    await Promise.all(pending.map(async (p) => {
      try {
        const r = await retryWithBackoff(() => uploadImage(p.path, { silent: true }))
        uploaded.push(r.url)
        okPaths.push(p.path)
      }
      catch {
        // 仍失败：保留队列，等下次重试
      }
    }))
    if (okPaths.length) {
      const res = await retryWithBackoff(
        () => http.post<{ images: string[] }>(`/app/consults/${row.id}/images`, { images: uploaded }, { silent: true }),
      )
      row.images = res.images
      removePendingPhotos(okPaths)
      refreshPending()
    }
    const remain = pendingPhotosOf(row.id).length
    if (remain)
      toast(`${remain} 张照片仍未上传成功，请检查网络后再试`)
    else
      toast('照片已全部补传')
  }
  catch (e: any) {
    toast(e?.message || '补传失败，请稍后重试')
  }
  finally {
    retryingConsultId.value = null
  }
}

function pendingPhotosOf(consultId: number): PendingPhoto[] {
  return pendingByConsult.value[consultId] || []
}

async function cancelRescue(row: RescueRecord) {
  const res = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '取消求助',
      content: '确定取消这条求助吗？客服将不再为你派单。',
      confirmText: '取消求助',
      confirmColor: '#D93025',
      cancelText: '再想想',
      success: r => resolve(!!r.confirm),
      fail: () => resolve(false),
    })
  })
  if (!res)
    return
  if (cancellingId.value)
    return
  cancellingId.value = row.id
  try {
    await http.patch(`/app/rescue-alerts/${row.id}/cancel`, undefined, { silent: true })
    row.status = 'cancelled'
    row.statusName = '已取消'
    // 自己的取消不算「状态变化」：同步轮询基线，避免 30 秒后自我提醒
    markRecordLocalStatus('rescue', row.id, 'cancelled', '已取消')
    toast('已取消，客服将不再派单')
  }
  catch (e: any) {
    toast(e?.message || '取消失败，请稍后重试')
    await load({ silent: true })
  }
  finally {
    cancellingId.value = null
  }
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "我的记录",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2",
    "enablePullDownRefresh": true
  }
}
</route>

<template>
  <view class="t-shell t-shell--plain">
    <view class="rec-hero">
      <view class="text-[20px] font-extrabold">
        我的记录
      </view>
      <view class="mt-1 text-[12px] text-white/85 leading-relaxed">
        查看救援与咨询进度；待处理的求助可以在这里取消。
      </view>
    </view>

    <view class="t-page-pad -mt-4">
      <view class="t-card p-1.5">
        <view class="rec-tabs">
          <view class="rec-tab" :class="{ 'is-active': activeTab === 'rescue' }" @click="switchTab('rescue')">
            救援记录
            <text v-if="rescues.length" class="rec-tab__count">{{ rescues.length }}</text>
          </view>
          <view class="rec-tab" :class="{ 'is-active': activeTab === 'consult' }" @click="switchTab('consult')">
            咨询记录
            <text v-if="consults.length" class="rec-tab__count">{{ consults.length }}</text>
          </view>
        </view>
      </view>

      <view class="mt-3">
        <TSkeleton v-if="loading" variant="text" :rows="4" />

        <view v-else-if="errMsg" class="t-card">
          <TState type="error" title="记录没加载出来" :desc="errMsg" action-text="重新加载" @action="load()" />
        </view>

        <view v-else-if="isEmpty" class="t-card">
          <TState
            type="empty"
            :title="activeTab === 'rescue' ? '还没有救援记录' : '还没有咨询记录'"
            :desc="activeTab === 'rescue' ? '遇到爆胎、扎钉时点首页「故障找救援」，进度会显示在这里。' : '提交救援咨询后，可以在这里查看客服处理进度。'"
            :action-text="activeTab === 'rescue' ? '去首页看看' : '去提交咨询'"
            @action="go(activeTab === 'rescue' ? '/pages/index/index' : '/pages/consult/index')"
          />
        </view>

        <view v-else class="flex flex-col gap-2.5">
          <!-- 救援记录 -->
          <template v-if="activeTab === 'rescue'">
            <view v-for="row in rescues" :key="row.id" class="t-card rec-card" @click="goDetail('rescue', row.id)">
              <view class="flex items-start justify-between gap-2">
                <view class="min-w-0">
                  <view class="flex items-center gap-2">
                    <text class="text-[15px] font-bold">#{{ row.id }}</text>
                    <text class="rec-vehicle">{{ row.vehicleTypeName || '其他' }}</text>
                    <text v-if="row.plateNo" class="rec-plate">{{ row.plateNo }}</text>
                  </view>
                  <view class="mt-1.5 text-[13px] text-[#55504A] leading-relaxed">
                    {{ row.locationDesc || '未填写位置描述' }}
                  </view>
                </view>
                <text class="rec-status" :class="STATUS_CLASS[row.status] || 'is-cancelled'">
                  {{ row.statusName }}
                </text>
              </view>

              <view v-if="row.assignedStore" class="rec-store">
                <text class="i-tabler-building-store text-[13px]" />
                <text>平台已安排：{{ row.assignedStore.name }}（{{ row.assignedStore.areaLabel || row.assignedStore.categoryName }}）</text>
              </view>

              <view class="mt-2 flex items-center justify-between">
                <text class="rec-time">{{ fmtTime(row.createdAt) }}</text>
                <TButton
                  v-if="canCancel(row.status)"
                  type="ghost"
                  size="sm"
                  :loading="cancellingId === row.id"
                  @click="cancelRescue(row)"
                >
                  取消求助
                </TButton>
                <text v-else class="rec-time">
                  {{ row.status === 'resolved' ? '服务已完成' : '已结束' }}
                </text>
              </view>
            </view>
          </template>

          <!-- 咨询记录 -->
          <template v-else>
            <view v-for="row in consults" :key="row.id" class="t-card rec-card" @click="goDetail('consult', row.id)">
              <view class="flex items-start justify-between gap-2">
                <view class="min-w-0">
                  <view class="flex items-center gap-2">
                    <text class="text-[15px] font-bold">#{{ row.id }}</text>
                    <text v-if="row.plateNo" class="rec-plate">{{ row.plateNo }}</text>
                    <text v-if="row.carModel" class="rec-vehicle">{{ row.carModel }}</text>
                  </view>
                  <view class="mt-1.5 text-[13px] text-[#55504A] leading-relaxed">
                    {{ row.description || '未填写故障描述' }}
                  </view>
                </view>
                <text class="rec-status" :class="STATUS_CLASS[row.status] || 'is-cancelled'">
                  {{ row.statusName }}
                </text>
              </view>

              <!-- 现场照片：已上传的可点查看，未上传的显示占位标记 -->
              <view v-if="row.images?.length || pendingPhotosOf(row.id).length" class="rec-photos">
                <view v-for="(img, i) in row.images" :key="img" class="rec-photo" @click.stop="previewConsultImages(row, i)">
                  <image class="rec-photo__img" :src="absUrl(img)" mode="aspectFill" />
                </view>
                <view v-for="p in pendingPhotosOf(row.id)" :key="p.id" class="rec-photo rec-photo--pending">
                  <text class="i-tabler-cloud-off text-[16px]" />
                </view>
              </view>

              <view class="mt-2 flex items-center justify-between">
                <text class="rec-time">{{ fmtTime(row.createdAt) }}</text>
                <view class="flex items-center gap-2">
                  <template v-if="pendingPhotosOf(row.id).length">
                    <text class="rec-pending-tag">{{ pendingPhotosOf(row.id).length }} 张未上传</text>
                    <TButton
                      type="ghost"
                      size="sm"
                      :loading="retryingConsultId === row.id"
                      @click="retryConsultPhotos(row)"
                    >
                      重试上传
                    </TButton>
                  </template>
                  <text v-else class="rec-time">
                    {{ row.images?.length ? `${row.images.length} 张现场图` : '无现场图' }}
                  </text>
                </view>
              </view>
            </view>
          </template>
        </view>
      </view>

      <view class="py-4 text-center text-[11px] text-[#A8A199] leading-relaxed">
        平台只做信息对接与人工调度，服务费用与门店现场确认。
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.rec-hero {
  padding: 20px 16px 30px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
}

.rec-tabs {
  display: flex;
  gap: 6px;
}

.rec-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--ink-2);
  transition: all 0.18s;
}

.rec-tab.is-active {
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
}

.rec-tab__count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  color: var(--brand-dark);
  background: #ffe4cb;
}

.rec-card {
  padding: 14px;
}

.rec-vehicle,
.rec-plate {
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 10px;
  color: #7a3406;
  background: #fdf0e4;
}

.rec-plate {
  color: #55504a;
  background: #f1eee8;
}

.rec-status {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.rec-status.is-pending {
  color: #b3261e;
  background: #fdecea;
}

.rec-status.is-contacting {
  color: #8a5a00;
  background: #fff4d6;
}

.rec-status.is-resolved {
  color: #1d6b3f;
  background: #e6f4ea;
}

.rec-status.is-cancelled {
  color: #6b6b6b;
  background: #f0f0f0;
}

.rec-store {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #55504a;
  background: #f7f4ef;
}

.rec-time {
  font-size: 11px;
  color: #a8a199;
}

/* 咨询现场照片：缩略图一行排开，点击可预览大图 */
.rec-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.rec-photo {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
}

.rec-photo__img {
  width: 100%;
  height: 100%;
}

/* 未上传的照片占位：灰底 + 云朵斜线图标，与已上传图区分开 */
.rec-photo--pending {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b3aca3;
  background: #f4f1ec;
}

.rec-pending-tag {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #b3261e;
  background: #fdecea;
}
</style>

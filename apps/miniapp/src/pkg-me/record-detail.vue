<script setup lang="ts">
/**
 * 记录详情（pkg-me，issue #8）：
 *
 * 从「我的记录」卡片进入，按 type=rescue|consult + id 拉取单条详情
 * （GET /app/rescue-alerts/:id、/app/consults/:id，字段与列表同源）。
 * 待处理 / 跟进中的救援工单可在详情中取消，重复取消展示服务端的明确结果；
 * 咨询详情展示现场照片，未上传成功的照片可在这里重试补传。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http, uploadImage } from '@/tire/request'
import { loadPendingPhotos, removePendingPhotos } from '@/tire/app/photoQueue'
import type { PendingPhoto } from '@/tire/app/photoQueue'
import { markRecordLocalStatus } from '@/tire/app/recordsPoll'
import type { ConsultRecord, RescueRecord } from '@/tire/app/records'
import { retryWithBackoff } from '@/tire/app/retry'
import { absUrl, back, go, toast } from '@/tire/utils'

const type = ref<'rescue' | 'consult'>('rescue')
const recordId = ref(0)
const rescue = ref<RescueRecord | null>(null)
const consult = ref<ConsultRecord | null>(null)
const loading = ref(true)
const errMsg = ref('')
const cancelling = ref(false)
/** 本条咨询的待补传照片与补传状态（与记录页共用同一队列） */
const pendingPhotos = ref<PendingPhoto[]>([])
const retrying = ref(false)

const STATUS_CLASS: Record<string, string> = {
  pending: 'is-pending',
  contacting: 'is-contacting',
  resolved: 'is-resolved',
  cancelled: 'is-cancelled',
}

/** 状态说明：帮助司机理解客服调度下一步会做什么 */
const STATUS_TIPS: Record<string, string> = {
  pending: '客服正在核实您的求助，请保持电话畅通。',
  contacting: '客服正在为您协调就近门店，请耐心等待。',
  resolved: '本次救援已完成，如需其他帮助可再次提交。',
  cancelled: '该求助已取消，客服将不再联系派单。',
}

const canCancel = computed(() => rescue.value?.status === 'pending' || rescue.value?.status === 'contacting')

onLoad((options: any) => {
  type.value = options?.type === 'consult' ? 'consult' : 'rescue'
  recordId.value = Number(options?.id) || 0
  if (!recordId.value) {
    loading.value = false
    errMsg.value = '记录参数缺失'
    return
  }
  loadDetail()
})

async function loadDetail() {
  loading.value = true
  errMsg.value = ''
  try {
    if (type.value === 'rescue')
      rescue.value = await http.get<RescueRecord>(`/app/rescue-alerts/${recordId.value}`, undefined, { silent: true })
    else
      consult.value = await http.get<ConsultRecord>(`/app/consults/${recordId.value}`, undefined, { silent: true })
    refreshPending()
  }
  catch (e: any) {
    errMsg.value = e?.message || '详情没加载出来'
  }
  finally {
    loading.value = false
  }
}

/** 从本地待上传队列取本条咨询的未成功照片 */
function refreshPending() {
  if (type.value !== 'consult')
    return
  pendingPhotos.value = loadPendingPhotos().filter(p => p.consultId === recordId.value)
}

function fmtTime(value?: string) {
  if (!value)
    return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime()))
    return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 取消求助：确认后调用取消接口，重复取消展示服务端明确结果（当前状态不能取消） */
async function cancelRescue() {
  if (!rescue.value || cancelling.value)
    return
  const confirmed = await new Promise<boolean>((resolve) => {
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
  if (!confirmed)
    return
  cancelling.value = true
  try {
    const res = await http.patch<{ id: number, status: string, statusName: string }>(
      `/app/rescue-alerts/${recordId.value}/cancel`,
      undefined,
      { silent: true },
    )
    if (rescue.value) {
      rescue.value.status = res.status
      rescue.value.statusName = res.statusName
    }
    // 自己的取消不算「状态变化」：同步轮询基线，避免 30 秒后自我提醒
    markRecordLocalStatus('rescue', recordId.value, res.status, res.statusName)
    toast('已取消，客服将不再派单')
  }
  catch (e: any) {
    // 重复取消等冲突：展示服务端明确结果并刷新详情（状态可能已被后台流转）
    toast(e?.message || '取消失败，请稍后重试')
    await loadDetail()
  }
  finally {
    cancelling.value = false
  }
}

function previewImages(idx: number) {
  const urls = (consult.value?.images || []).map(u => absUrl(u))
  if (!urls.length)
    return
  uni.previewImage({ current: urls[idx], urls })
}

/** 补传未上传照片：逐张独立上传（各自退避重试），成功后合并回咨询记录 */
async function retryPhotos() {
  if (!consult.value || retrying.value || !pendingPhotos.value.length)
    return
  retrying.value = true
  try {
    const uploaded: string[] = []
    const okPaths: string[] = []
    await Promise.all(pendingPhotos.value.map(async (p) => {
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
        () => http.post<{ images: string[] }>(`/app/consults/${recordId.value}/images`, { images: uploaded }, { silent: true }),
      )
      consult.value.images = res.images
      removePendingPhotos(okPaths)
      refreshPending()
    }
    const remain = pendingPhotos.value.length
    if (remain)
      toast(`${remain} 张照片仍未上传成功，请检查网络后再试`)
    else
      toast('照片已全部补传')
  }
  catch (e: any) {
    toast(e?.message || '补传失败，请稍后重试')
  }
  finally {
    retrying.value = false
  }
}

/** 现场救援跳转首页（tab 页需 switchTab） */
function goHome() {
  go('/pages/index/index')
}
</script>

<route lang="json5">
{
  "style": {
    "navigationBarTitleText": "记录详情",
    "navigationBarBackgroundColor": "#E8721C",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F6F5F2"
  }
}
</route>

<template>
  <view class="t-shell t-shell--plain">
    <view class="det-hero">
      <view class="text-[20px] font-extrabold">
        记录详情
      </view>
      <view class="mt-1 text-[12px] text-white/85 leading-relaxed">
        {{ type === 'rescue' ? '救援工单的处理进度与指派门店。' : '救援咨询的描述与现场照片。' }}
      </view>
    </view>

    <view class="t-page-pad pb-6 -mt-4">
      <TSkeleton v-if="loading" variant="text" :rows="6" />

      <view v-else-if="errMsg" class="t-card">
        <TState type="error" title="详情没加载出来" :desc="errMsg" action-text="重新加载" @action="loadDetail()" />
      </view>

      <template v-else-if="type === 'rescue' && rescue">
        <view class="t-card det-card">
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-2">
              <text class="text-[16px] font-extrabold">#{{ rescue.id }}</text>
              <text class="det-vehicle">{{ rescue.vehicleTypeName || '其他' }}</text>
              <text v-if="rescue.plateNo" class="det-plate">{{ rescue.plateNo }}</text>
            </view>
            <text class="det-status" :class="STATUS_CLASS[rescue.status] || 'is-cancelled'">{{ rescue.statusName }}</text>
          </view>

          <view class="det-tip">
            {{ STATUS_TIPS[rescue.status] || '如需帮助可联系平台客服。' }}
          </view>

          <view class="det-rows">
            <view class="det-row">
              <text class="det-row__label">位置描述</text>
              <text class="det-row__value">{{ rescue.locationDesc || '未填写' }}</text>
            </view>
            <view v-if="rescue.assignedStore" class="det-row">
              <text class="det-row__label">指派门店</text>
              <text class="det-row__value">
                {{ rescue.assignedStore.name }}（{{ rescue.assignedStore.areaLabel || rescue.assignedStore.categoryName }}）
              </text>
            </view>
            <view class="det-row">
              <text class="det-row__label">提交时间</text>
              <text class="det-row__value">{{ fmtTime(rescue.createdAt) || '-' }}</text>
            </view>
            <view class="det-row">
              <text class="det-row__label">更新时间</text>
              <text class="det-row__value">{{ fmtTime(rescue.updatedAt) || '-' }}</text>
            </view>
          </view>
        </view>

        <view class="mt-3 flex gap-2">
          <TButton type="ghost" class="flex-1" @click="back()">
            返回记录
          </TButton>
          <TButton
            v-if="canCancel"
            type="danger"
            class="flex-1"
            :loading="cancelling"
            @click="cancelRescue()"
          >
            取消求助
          </TButton>
        </view>
      </template>

      <template v-else-if="type === 'consult' && consult">
        <view class="t-card det-card">
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-2">
              <text class="text-[16px] font-extrabold">#{{ consult.id }}</text>
              <text v-if="consult.plateNo" class="det-plate">{{ consult.plateNo }}</text>
              <text v-if="consult.carModel" class="det-vehicle">{{ consult.carModel }}</text>
            </view>
            <text class="det-status" :class="STATUS_CLASS[consult.status] || 'is-cancelled'">{{ consult.statusName }}</text>
          </view>

          <view class="det-tip">
            {{ STATUS_TIPS[consult.status] || '客服会尽快与您联系，请保持电话畅通。' }}
          </view>

          <view class="det-rows">
            <view class="det-row">
              <text class="det-row__label">位置描述</text>
              <text class="det-row__value">{{ consult.locationDesc || '未填写' }}</text>
            </view>
            <view class="det-row">
              <text class="det-row__label">故障描述</text>
              <text class="det-row__value">{{ consult.description || '未填写' }}</text>
            </view>
            <view class="det-row">
              <text class="det-row__label">提交时间</text>
              <text class="det-row__value">{{ fmtTime(consult.createdAt) || '-' }}</text>
            </view>
            <view class="det-row">
              <text class="det-row__label">更新时间</text>
              <text class="det-row__value">{{ fmtTime(consult.updatedAt) || '-' }}</text>
            </view>
          </view>

          <!-- 现场照片：已上传可点看大图；未上传的显示占位并可重试补传 -->
          <view v-if="consult.images?.length || pendingPhotos.length" class="det-photos">
            <view v-for="(img, i) in consult.images" :key="img" class="det-photo" @click="previewImages(i)">
              <image class="det-photo__img" :src="absUrl(img)" mode="aspectFill" />
            </view>
            <view v-for="p in pendingPhotos" :key="p.id" class="det-photo det-photo--pending">
              <text class="i-tabler-cloud-off text-[18px]" />
            </view>
          </view>

          <view v-if="pendingPhotos.length" class="mt-3 flex items-center justify-between">
            <text class="det-pending-tag">{{ pendingPhotos.length }} 张未上传</text>
            <TButton type="ghost" size="sm" :loading="retrying" @click="retryPhotos()">
              重试上传
            </TButton>
          </view>
          <view v-else class="mt-2 text-right text-[11px] text-[#A8A199]">
            {{ consult.images?.length ? `${consult.images.length} 张现场图` : '无现场图' }}
          </view>
        </view>

        <view class="mt-3">
          <TButton type="ghost" class="w-full" @click="back()">
            返回记录
          </TButton>
        </view>
      </template>

      <view class="mt-4 text-center text-[11px] text-[#A8A199] leading-relaxed">
        平台只做信息对接与人工调度，服务费用与门店现场确认。
        <text class="mt-1 block" @click="goHome">遇到新问题？去首页求助</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.det-hero {
  padding: 20px 16px 30px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-bright), var(--brand));
}

.det-card {
  padding: 16px;
}

.det-vehicle,
.det-plate {
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 10px;
  color: #7a3406;
  background: #fdf0e4;
}

.det-plate {
  color: #55504a;
  background: #f1eee8;
}

.det-status {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.det-status.is-pending {
  color: #b3261e;
  background: #fdecea;
}

.det-status.is-contacting {
  color: #8a5a00;
  background: #fff4d6;
}

.det-status.is-resolved {
  color: #1d6b3f;
  background: #e6f4ea;
}

.det-status.is-cancelled {
  color: #6b6b6b;
  background: #f0f0f0;
}

.det-tip {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #55504a;
  background: #f7f4ef;
}

.det-rows {
  margin-top: 12px;
}

.det-row {
  display: flex;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;
  line-height: 1.6;
}

.det-row__label {
  flex-shrink: 0;
  width: 64px;
  color: #a8a199;
}

.det-row__value {
  flex: 1;
  color: #36312b;
  word-break: break-all;
}

.det-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.det-photo {
  width: 68px;
  height: 68px;
  border-radius: 8px;
  overflow: hidden;
}

.det-photo__img {
  width: 100%;
  height: 100%;
}

.det-photo--pending {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b3aca3;
  background: #f4f1ec;
}

.det-pending-tag {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #b3261e;
  background: #fdecea;
}
</style>

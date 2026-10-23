<script setup lang="ts">
/**
 * 我的记录（pkg-me）
 *
 * 司机查看自己提交的救援 / 咨询服务进度；待处理与跟进中的救援可主动取消。
 * 门店只展示名称与模糊区域，不暴露电话和详细地址。
 */
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import TButton from '@/components/tire/TButton.vue'
import TState from '@/components/tire/TState.vue'
import TSkeleton from '@/components/tire/TSkeleton.vue'
import { http } from '@/tire/request'
import { errText, go, toast } from '@/tire/utils'

interface RescueRecord {
  id: number
  vehicleType: string
  vehicleTypeName: string
  plateNo: string
  locationDesc: string
  status: string
  statusName: string
  assignedStore?: { id: number, name: string, categoryName: string, areaLabel: string } | null
  createdAt: string
}

interface ConsultRecord {
  id: number
  plateNo: string
  carModel: string
  description: string
  images: string[]
  status: string
  statusName: string
  createdAt: string
}

const activeTab = ref<'rescue' | 'consult'>('rescue')
const rescues = ref<RescueRecord[]>([])
const consults = ref<ConsultRecord[]>([])
const loading = ref(true)
const errMsg = ref('')
const cancellingId = ref<number | null>(null)

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
  }
  catch (e) {
    if (!opts.silent)
      errMsg.value = errText(e, '记录没加载出来')
  }
  finally {
    loading.value = false
  }
}

onShow(() => load())
onPullDownRefresh(async () => {
  await load({ silent: true })
  uni.stopPullDownRefresh()
})

function switchTab(tab: 'rescue' | 'consult') {
  activeTab.value = tab
}

async function cancelRescue(row: RescueRecord) {
  const res = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '取消求助',
      content: '确定取消这条求助吗？客服将不再为你派单。',
      confirmText: '取消求助',
      confirmColor: '#D93025',
      cancelText: '再等等',
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
    toast('已取消，客服将不再派单')
  }
  catch (e) {
    toast(errText(e, '取消失败，请稍后重试'))
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
            <view v-for="row in rescues" :key="row.id" class="t-card rec-card">
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
            <view v-for="row in consults" :key="row.id" class="t-card rec-card">
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
              <view class="mt-2 flex items-center justify-between">
                <text class="rec-time">{{ fmtTime(row.createdAt) }}</text>
                <text class="rec-time">
                  {{ row.images?.length ? `${row.images.length} 张现场图` : '无现场图' }}
                </text>
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
</style>

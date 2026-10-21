<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  type Component
} from "vue";
import dayjs from "dayjs";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { currentUser } from "@/api/user";
import { useUserStoreHook } from "@/store/modules/user";
import {
  consultList,
  dashboardStats,
  rescueList,
  type ConsultItem,
  type DashboardStats,
  type RescueItem
} from "@/api/tire";
import StatCard from "./components/StatCard.vue";
import TrendChart from "./components/TrendChart.vue";
import PendingList from "./components/PendingList.vue";
import type { PendingRow, StatTone } from "./types";

import IconBolt from "~icons/tabler/bolt";
import IconTruck from "~icons/tabler/truck-delivery";
import IconMessages from "~icons/tabler/messages";
import IconAlert from "~icons/tabler/alert-triangle";
import IconPhoneCall from "~icons/tabler/phone-call";
import IconUsers from "~icons/tabler/users";
import IconStore from "~icons/tabler/building-store";
import IconRefresh from "~icons/tabler/refresh";

defineOptions({ name: "TireDashboard" });

/** 统计刷新间隔：30 秒 */
const POLL_INTERVAL = 30 * 1000;
/** 自动刷新失败时的提示静默期，避免轮询反复弹窗 */
const ERROR_QUIET_PERIOD = 60 * 1000;

const WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const router = useRouter();
const userStore = useUserStoreHook();
/* 登录态在 keepAlive 页面上不会变化，setup 时读取一次即可 */
const loginUser = currentUser();

/** 兜底：登录信息走纯管理端态时，nickname 形如「姓名 · 角色」，拆开避免重复展示 */
const [fallbackName, fallbackRole] = (userStore.nickname || "").split(" · ");
const displayName: string = loginUser.name || fallbackName || "管理员";
const roleName: string = loginUser.roleName || fallbackRole || "";
/** 姓名与角色同名（如「超级管理员」）时不再重复挂标签 */
const showRoleTag = roleName !== "" && roleName !== displayName;
const today = dayjs();
const dateText = `${today.format("YYYY年M月D日")} ${WEEK_LABELS[today.day()]}`;

const greeting = computed(() => {
  const hour = dayjs().hour();
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

const stats = ref<DashboardStats>({
  todayRescue: 0,
  todayConsult: 0,
  pendingRescue: 0,
  pendingConsult: 0,
  driverCount: 0,
  storeCount: 0,
  trend: []
});
const rescueData = ref<RescueItem[]>([]);
const consultData = ref<ConsultItem[]>([]);

/** 首次加载：只用于页面级 loading；后续刷新一律静默，避免整页闪烁 */
const firstLoading = ref(true);
/** 手动刷新按钮的 loading */
const refreshing = ref(false);
const updatedAt = ref("");

let timer: number | null = null;
let requesting = false;
let lastErrorAt = 0;
let hasActivated = false;

interface StatCardModel {
  key: string;
  title: string;
  value: number;
  desc: string;
  icon: Component;
  tone: StatTone;
  dot: boolean;
  to?: string;
}

const statCards = computed<StatCardModel[]>(() => {
  const s = stats.value;
  return [
    {
      key: "todayRescue",
      title: "今日救援",
      value: s.todayRescue,
      desc: "今日司机发起的救援通知",
      icon: IconTruck,
      tone: "brand",
      dot: false
    },
    {
      key: "todayConsult",
      title: "今日咨询",
      value: s.todayConsult,
      desc: "今日提交的服务咨询工单",
      icon: IconMessages,
      tone: "brand",
      dot: false
    },
    {
      key: "pendingRescue",
      title: "待处理救援",
      value: s.pendingRescue,
      desc: "等待客服联系救援司机",
      icon: IconAlert,
      tone: "danger",
      dot: s.pendingRescue > 0,
      to: "/tire/rescue"
    },
    {
      key: "pendingConsult",
      title: "待处理咨询",
      value: s.pendingConsult,
      desc: "等待客服电话跟进",
      icon: IconPhoneCall,
      tone: "warning",
      dot: s.pendingConsult > 0,
      to: "/tire/consult"
    },
    {
      key: "driverCount",
      title: "司机总数",
      value: s.driverCount,
      desc: "平台已注册司机账号",
      icon: IconUsers,
      tone: "neutral",
      dot: false
    },
    {
      key: "storeCount",
      title: "门店总数",
      value: s.storeCount,
      desc: "已入驻的服务门店",
      icon: IconStore,
      tone: "neutral",
      dot: false
    }
  ];
});

const trendTotals = computed(() =>
  stats.value.trend.reduce(
    (acc, item) => ({
      rescue: acc.rescue + item.rescue,
      consult: acc.consult + item.consult
    }),
    { rescue: 0, consult: 0 }
  )
);

function formatNo(id: number) {
  return String(id).padStart(4, "0");
}

function formatTime(value?: string | null) {
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

const rescueRows = computed<PendingRow[]>(() =>
  rescueData.value.map(item => ({
    id: item.id,
    no: formatNo(item.id),
    primary: item.driver?.nickname || "匿名司机",
    secondary: item.driverPhone || item.driver?.phone || "未留电话",
    desc: item.locationDesc || "未填写位置描述",
    time: formatTime(item.createdAt)
  }))
);

const consultRows = computed<PendingRow[]>(() =>
  consultData.value.map(item => ({
    id: item.id,
    no: formatNo(item.id),
    primary: item.plateNo || "未填车牌",
    secondary:
      [item.contactName, item.contactPhone].filter(Boolean).join(" ") ||
      "未留联系方式",
    desc: item.description || item.locationDesc || "未填写故障描述",
    time: formatTime(item.createdAt)
  }))
);

/**
 * 拉取工作台全部数据
 * @param silent 静默刷新（轮询/返回页签）时不显示 loading
 */
async function loadData(silent = false) {
  if (requesting) return;
  requesting = true;
  if (!silent) refreshing.value = true;
  try {
    const [statsRes, rescueRes, consultRes] = await Promise.all([
      dashboardStats(),
      rescueList({ status: "pending", page: 1, pageSize: 5 }),
      consultList({ status: "pending", page: 1, pageSize: 5 })
    ]);
    stats.value = statsRes;
    rescueData.value = rescueRes?.list ?? [];
    consultData.value = consultRes?.list ?? [];
    updatedAt.value = dayjs().format("HH:mm:ss");
    lastErrorAt = 0;
  } catch (error) {
    const now = Date.now();
    // 自动刷新失败不打断使用，且 1 分钟内不重复弹提示；已有数据继续展示
    if (!silent || now - lastErrorAt > ERROR_QUIET_PERIOD) {
      message(error instanceof Error ? error.message : "工作台数据加载失败", {
        type: "error"
      });
      lastErrorAt = now;
    }
  } finally {
    requesting = false;
    refreshing.value = false;
    firstLoading.value = false;
  }
}

function manualRefresh() {
  loadData(false);
}

function startPolling() {
  stopPolling();
  timer = window.setInterval(() => loadData(true), POLL_INTERVAL);
}

function stopPolling() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

onMounted(() => {
  loadData(false);
  startPolling();
});

onActivated(() => {
  // keepAlive 首次挂载时 onMounted 与 onActivated 会同时触发，跳过这次避免重复请求
  if (!hasActivated) {
    hasActivated = true;
    return;
  }
  loadData(true);
  startPolling();
});

onDeactivated(stopPolling);
onUnmounted(stopPolling);
</script>

<template>
  <div class="p-2">
    <!-- 欢迎条：标题 / 登录人 / 日期 / 刷新与最后更新时间 -->
    <el-card shadow="never" class="tire-hero mb-3">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="hero-logo flex-c">
            <el-icon :size="22"><IconBolt /></el-icon>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-lg font-semibold text-[var(--el-text-color-primary)]">
                工作台
              </span>
              <el-tag v-if="showRoleTag" size="small" effect="plain" round>
                {{ roleName }}
              </el-tag>
            </div>
            <div class="mt-1 text-sm text-[var(--el-text-color-regular)]">
              {{ greeting }}，{{ displayName }}，今天是 {{ dateText }}
            </div>
          </div>
        </div>
        <div class="ml-auto flex items-center gap-4">
          <div class="text-right">
            <div class="text-xs text-[var(--el-text-color-secondary)]">最后更新</div>
            <div class="mt-0.5 text-sm font-medium tabular-nums text-[var(--el-text-color-primary)]">
              {{ updatedAt || "—" }}
            </div>
          </div>
          <el-button :icon="IconRefresh" :loading="refreshing" @click="manualRefresh">
            刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <div v-loading="firstLoading" element-loading-text="正在加载工作台数据">
      <!-- 6 张统计卡：窄屏两列，大屏六列 -->
      <el-row :gutter="16">
        <el-col
          v-for="card in statCards"
          :key="card.key"
          :xs="12"
          :sm="8"
          :md="8"
          :lg="4"
          class="mb-3"
        >
          <StatCard
            :title="card.title"
            :value="card.value"
            :desc="card.desc"
            :icon="card.icon"
            :tone="card.tone"
            :dot="card.dot"
            :clickable="!!card.to"
            @click="card.to && router.push(card.to)"
          />
        </el-col>
      </el-row>

      <!-- 近 7 天趋势 -->
      <el-card shadow="never" class="mb-3">
        <template #header>
          <div class="flex-bc flex-wrap gap-2">
            <div class="font-medium">近 7 天趋势</div>
            <div class="flex items-center gap-4 text-xs text-[var(--el-text-color-secondary)]">
              <span>
                救援通知
                <b class="ml-1 text-sm font-medium tabular-nums text-[#E8721C]">
                  {{ trendTotals.rescue }}
                </b>
              </span>
              <span>
                咨询工单
                <b class="ml-1 text-sm font-medium tabular-nums text-[#2F86D9]">
                  {{ trendTotals.consult }}
                </b>
              </span>
            </div>
          </div>
        </template>
        <TrendChart :trend="stats.trend" height="300px" />
      </el-card>

      <!-- 最新待处理：大屏并排、小屏堆叠 -->
      <el-row :gutter="16">
        <el-col :xs="24" :lg="12" class="mb-3">
          <PendingList
            title="待处理救援"
            accent="danger"
            :rows="rescueRows"
            :loading="firstLoading"
            empty-text="暂无待处理救援"
            @view-all="router.push('/tire/rescue')"
            @row-click="router.push('/tire/rescue')"
          />
        </el-col>
        <el-col :xs="24" :lg="12" class="mb-3">
          <PendingList
            title="待处理咨询"
            accent="warning"
            :rows="consultRows"
            :loading="firstLoading"
            empty-text="暂无待处理咨询"
            @view-all="router.push('/tire/consult')"
            @row-click="router.push('/tire/consult')"
          />
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.tire-hero {
  background: linear-gradient(
    120deg,
    var(--el-color-primary-light-9) 0%,
    var(--el-bg-color) 58%
  );
}

.hero-logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
  border-radius: 12px;
}
</style>

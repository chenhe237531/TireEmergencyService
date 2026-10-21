<script setup lang="ts">
import {
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  reactive,
  ref
} from "vue";
import dayjs from "dayjs";
import { ElNotification } from "element-plus";
import { message } from "@/utils/message";
import {
  ORDER_STATUS,
  rescueList,
  rescueUnreadCount,
  statusFlow,
  statusTag
} from "@/api/tire";
import type { RescueItem } from "@/api/tire";
import HandleDialog from "./HandleDialog.vue";
import IconAlertTriangle from "~icons/tabler/alert-triangle";
import IconCircleCheck from "~icons/tabler/circle-check";
import IconCopy from "~icons/tabler/copy";
import IconPhone from "~icons/tabler/phone";

defineOptions({ name: "TireRescueList" });

/** el-table 插槽 row 的静态类型是 DefaultRow，统一在此断言为业务类型 */
const asRescue = (row: unknown) => row as RescueItem;

/** 待处理数量轮询间隔：30 秒（keepAlive 失活时停止） */
const POLL_INTERVAL = 30 * 1000;

const TABS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "contacting", label: "跟进中" },
  { value: "resolved", label: "已解决" },
  { value: "cancelled", label: "已取消" }
];

/** el-tag 的 type 是字面量联合，字典值是 string，这里收窄一次供模板使用 */
type TagType = "primary" | "success" | "info" | "warning" | "danger";
const tagType = (status: string): TagType =>
  (statusTag[status] || "info") as TagType;

const loading = ref(false);
const list = ref<RescueItem[]>([]);
const activeTab = ref("all");
const query = reactive<{ dateRange: string[] }>({ dateRange: [] });
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

/** 待处理救援条数，来自 unread-count 接口（警示条与 tab 角标共用） */
const unread = ref(0);

const dialogVisible = ref(false);
const handlingRow = ref<RescueItem | null>(null);
const listAnchor = ref<HTMLElement | null>(null);

let pollTimer: number | null = null;
/** null 表示尚未取过数量：首次只记录基线，不弹通知 */
let lastUnreadCount: number | null = null;
let hasActivated = false;

const formatTime = (value?: string | null) =>
  value && dayjs(value).isValid()
    ? dayjs(value).format("YYYY-MM-DD HH:mm")
    : "—";

/** 坐标统一保留 5 位小数（约 1 米精度），任一为空则整列显示 — */
function formatCoord(lat?: number | null, lng?: number | null) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return "—";
  }
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

/** 无后续流转路径即为终态，处理按钮禁用（与后端状态机一致） */
const isTerminal = (status: string) => (statusFlow[status] || []).length === 0;

/** tab 角标：待处理用轮询数量，其余仅当前 tab 用列表 total，避免多发请求 */
function tabCount(value: string): number | null {
  if (value === "pending") return unread.value > 0 ? unread.value : null;
  if (value === activeTab.value) return pagination.total;
  return null;
}

async function getList() {
  loading.value = true;
  try {
    const params = {
      status: activeTab.value === "all" ? "" : activeTab.value,
      start: query.dateRange?.[0] || "",
      end: query.dateRange?.[1] || ""
    };
    let res = await rescueList({
      ...params,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    // 处理或筛选后总数变小，当前页可能超界，回退到最后一页再取一次
    const maxPage = Math.max(1, Math.ceil(res.total / pagination.pageSize));
    if (pagination.page > maxPage) {
      pagination.page = maxPage;
      res = await rescueList({
        ...params,
        page: maxPage,
        pageSize: pagination.pageSize
      });
    }
    list.value = res.list || [];
    pagination.total = res.total || 0;
  } catch (err) {
    list.value = [];
    pagination.total = 0;
    message((err as Error).message || "救援通知加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function loadUnread() {
  try {
    const res = await rescueUnreadCount();
    const next = res.rescue || 0;
    // 数量变化且有新的待处理时才提示，同一数量不重复弹
    if (lastUnreadCount !== null && next !== lastUnreadCount && next > 0) {
      ElNotification({
        title: "新的救援通知",
        message: `当前待处理 ${next} 条，请尽快电话跟进`,
        type: "warning",
        duration: 6000
      });
    }
    unread.value = next;
    lastUnreadCount = next;
  } catch {
    // 轮询失败静默处理，避免打断正在进行的跟进操作
  }
}

function handleTabChange() {
  pagination.page = 1;
  getList();
}

function handleSearch() {
  pagination.page = 1;
  getList();
}

function handleReset() {
  activeTab.value = "all";
  query.dateRange = [];
  pagination.page = 1;
  getList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  getList();
}

/** 警示条「立即处理」：切到待处理 tab 并把列表滚动到可视区域 */
function handleUrgent() {
  activeTab.value = "pending";
  handleTabChange();
  nextTick(() =>
    listAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" })
  );
}

function dial(phone: string) {
  if (!phone) return;
  window.location.href = `tel:${phone}`;
}

async function copyPhone(phone: string) {
  if (!phone) return;
  try {
    await navigator.clipboard.writeText(phone);
    message("手机号已复制", { type: "success" });
  } catch {
    message("复制失败，请手动选择后复制", { type: "warning" });
  }
}

function openHandle(row: RescueItem) {
  if (isTerminal(row.status)) return;
  handlingRow.value = row;
  dialogVisible.value = true;
}

/** 处理成功后同时刷新列表与警示条数量 */
async function handleHandled() {
  await Promise.all([getList(), loadUnread()]);
}

function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(loadUnread, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(() => {
  getList();
  loadUnread();
  startPolling();
});

onActivated(() => {
  // keepAlive 首次挂载时 onMounted 与 onActivated 同时触发，跳过这次避免重复请求
  if (!hasActivated) {
    hasActivated = true;
    return;
  }
  getList();
  loadUnread();
  startPolling();
});

onDeactivated(stopPolling);
onUnmounted(stopPolling);
</script>

<template>
  <div class="p-2">
    <!-- 待处理警示条：有未处理救援时红色高亮，无则中性提示 -->
    <div v-if="unread > 0" class="rescue-alert rescue-alert--danger mb-3">
      <div class="flex min-w-0 items-center gap-2">
        <el-icon :size="18"><IconAlertTriangle /></el-icon>
        <span class="truncate">
          当前待处理
          <b class="mx-0.5 font-medium tabular-nums">{{ unread }}</b>
          条救援通知，请尽快电话跟进
        </span>
      </div>
      <el-button type="danger" size="small" @click="handleUrgent">
        立即处理
      </el-button>
    </div>
    <div v-else class="rescue-alert rescue-alert--safe mb-3">
      <div class="flex min-w-0 items-center gap-2">
        <el-icon :size="18"><IconCircleCheck /></el-icon>
        <span>当前没有待处理救援通知</span>
      </div>
    </div>

    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="flex-bc">
          <div class="font-medium">救援通知</div>
          <div class="text-xs text-[var(--el-text-color-secondary)]">
            每 30 秒自动刷新待处理数量
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane v-for="tab in TABS" :key="tab.value" :name="tab.value">
          <template #label>
            <span class="inline-flex items-center gap-1">
              {{ tab.label }}
              <span
                v-if="tabCount(tab.value) !== null"
                class="rounded-full bg-[var(--el-fill-color-dark)] px-1.5 text-xs leading-4 tabular-nums text-[var(--el-text-color-regular)]"
              >
                {{ tabCount(tab.value) }}
              </span>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div ref="listAnchor">
        <el-form inline :model="query" @submit.prevent="handleSearch">
          <el-form-item label="提交时间">
            <el-date-picker
              v-model="query.dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              class="w-[240px]!"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">查询</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>

        <el-table
          v-loading="loading"
          :data="list"
          border
          stripe
          row-key="id"
          empty-text="暂无救援通知"
        >
          <el-table-column label="编号" width="56">
            <template #default="{ row }">
              <span
                class="font-medium tabular-nums text-[var(--el-text-color-primary)]"
              >
                #{{ row.id }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="司机" width="112">
            <template #default="{ row }">
              <div class="font-medium">
                {{ row.driver?.nickname || "匿名司机" }}
              </div>
              <div
                v-if="row.driverPhone"
                class="mt-0.5 flex items-center gap-1"
              >
                <a
                  :href="`tel:${row.driverPhone}`"
                  class="text-xs tabular-nums text-primary hover:underline"
                >
                  {{ row.driverPhone }}
                </a>
                <el-button
                  link
                  size="small"
                  :icon="IconCopy"
                  title="复制手机号"
                  @click="copyPhone(row.driverPhone)"
                />
              </div>
              <span
                v-else
                class="text-xs text-[var(--el-text-color-secondary)]"
              >
                未留电话
              </span>
            </template>
          </el-table-column>

          <el-table-column label="身份" width="88" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                :class="
                  row.driverRoleName
                    ? ''
                    : 'text-[var(--el-text-color-secondary)]'
                "
              >
                {{ row.driverRoleName || "—" }}
              </span>
            </template>
          </el-table-column>

          <el-table-column
            prop="locationDesc"
            label="位置描述"
            min-width="168"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span
                :class="
                  row.locationDesc
                    ? ''
                    : 'text-[var(--el-text-color-secondary)]'
                "
              >
                {{ row.locationDesc || "—" }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="坐标" width="112" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                class="whitespace-nowrap text-xs tabular-nums text-[var(--el-text-color-regular)]"
              >
                {{ formatCoord(row.lat, row.lng) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag :type="tagType(row.status)" effect="light">
                {{ row.statusName || ORDER_STATUS[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column
            prop="note"
            label="跟进备注"
            min-width="168"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span
                :class="
                  row.note
                    ? 'text-[var(--el-text-color-regular)]'
                    : 'text-[var(--el-text-color-secondary)]'
                "
              >
                {{ row.note || "—" }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="处理人" width="84" show-overflow-tooltip>
            <template #default="{ row }">
              <span
                :class="
                  row.handledBy ? '' : 'text-[var(--el-text-color-secondary)]'
                "
              >
                {{ row.handledBy || "—" }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="时间" width="148">
            <template #default="{ row }">
              <span
                class="whitespace-nowrap text-xs tabular-nums text-[var(--el-text-color-regular)]"
              >
                {{ formatTime(row.createdAt) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="124" fixed="right">
            <template #default="{ row }">
              <div class="whitespace-nowrap">
                <el-tooltip
                  content="该司机未留电话，无法拨号"
                  placement="top"
                  :disabled="!!row.driverPhone"
                >
                  <span>
                    <el-button
                      link
                      type="primary"
                      :icon="IconPhone"
                      :disabled="!row.driverPhone"
                      @click="dial(row.driverPhone)"
                    >
                      拨号
                    </el-button>
                  </span>
                </el-tooltip>
                <el-tooltip
                  content="已终态，不可再变更"
                  placement="top"
                  :disabled="!isTerminal(row.status)"
                >
                  <span>
                    <el-button
                      link
                      type="primary"
                      :disabled="isTerminal(row.status)"
                      @click="openHandle(asRescue(row))"
                    >
                      处理
                    </el-button>
                  </span>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="mt-3 flex justify-end">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @size-change="handleSizeChange"
            @current-change="getList"
          />
        </div>
      </div>
    </el-card>

    <HandleDialog
      v-model="dialogVisible"
      :row="handlingRow"
      @handled="handleHandled"
    />
  </div>
</template>

<style scoped>
.rescue-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  font-size: 14px;
  border: 1px solid transparent;
  border-radius: 4px;
}

.rescue-alert--danger {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-7);
}

.rescue-alert--safe {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
</style>

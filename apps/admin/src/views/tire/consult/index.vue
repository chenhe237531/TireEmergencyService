<script setup lang="ts">
import {
  onActivated,
  onMounted,
  reactive,
  ref
} from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { consultList, ORDER_STATUS, statusTag } from "@/api/tire";
import type { ConsultItem } from "@/api/tire";
import ConsultDetailDrawer from "./ConsultDetailDrawer.vue";

defineOptions({ name: "TireConsultList" });

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
const list = ref<ConsultItem[]>([]);
const activeTab = ref("all");
const query = reactive<{ keyword: string; dateRange: string[] }>({
  keyword: "",
  dateRange: []
});
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

const drawerVisible = ref(false);
const detailId = ref<number | null>(null);

let hasActivated = false;

const formatTime = (value?: string | null) =>
  value && dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";

function imageCount(row: ConsultItem) {
  return row.images?.length || 0;
}

async function getList() {
  loading.value = true;
  try {
    const params = {
      status: activeTab.value === "all" ? "" : activeTab.value,
      keyword: query.keyword.trim(),
      start: query.dateRange?.[0] || "",
      end: query.dateRange?.[1] || ""
    };
    let res = await consultList({
      ...params,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    // 筛选后总数变小，当前页可能超界，回退到最后一页再取一次
    const maxPage = Math.max(1, Math.ceil(res.total / pagination.pageSize));
    if (pagination.page > maxPage) {
      pagination.page = maxPage;
      res = await consultList({
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
    message((err as Error).message || "咨询工单加载失败", { type: "error" });
  } finally {
    loading.value = false;
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
  query.keyword = "";
  query.dateRange = [];
  pagination.page = 1;
  getList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  getList();
}

function openDetail(row: ConsultItem) {
  detailId.value = row.id;
  drawerVisible.value = true;
}

onMounted(() => getList());

onActivated(() => {
  // keepAlive 首次挂载时 onMounted 与 onActivated 同时触发，跳过这次避免重复请求
  if (!hasActivated) {
    hasActivated = true;
    return;
  }
  getList();
});
</script>

<template>
  <div class="p-2">
    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="flex-bc">
          <div class="font-medium">咨询工单</div>
          <div class="text-xs text-[var(--el-text-color-secondary)]">
            司机端提交的服务咨询，需电话联系车主确认需求
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane
          v-for="tab in TABS"
          :key="tab.value"
          :name="tab.value"
        >
          <template #label>
            <span class="inline-flex items-center gap-1">
              {{ tab.label }}
              <span
                v-if="tab.value === activeTab"
                class="rounded-full bg-[var(--el-fill-color-dark)] px-1.5 text-xs leading-4 tabular-nums text-[var(--el-text-color-regular)]"
              >
                {{ pagination.total }}
              </span>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <el-form inline :model="query" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            class="w-[220px]!"
            clearable
            placeholder="姓名 / 手机号 / 车牌，回车查询"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
        </el-form-item>
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
        empty-text="暂无咨询工单"
      >
        <el-table-column label="编号" width="70">
          <template #default="{ row }">
            <span class="font-medium tabular-nums text-[var(--el-text-color-primary)]">
              #{{ row.id }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="车牌" width="104">
          <template #default="{ row }">
            <span class="font-semibold">{{ row.plateNo || "—" }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="carModel" label="车型" width="112" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'text-[var(--el-text-color-secondary)]': !row.carModel }">
              {{ row.carModel || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="联系人" width="140">
          <template #default="{ row }">
            <div>{{ row.contactName || "—" }}</div>
            <a
              v-if="row.contactPhone"
              :href="`tel:${row.contactPhone}`"
              class="text-xs tabular-nums text-primary hover:underline"
            >
              {{ row.contactPhone }}
            </a>
          </template>
        </el-table-column>

        <el-table-column prop="locationDesc" label="位置" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'text-[var(--el-text-color-secondary)]': !row.locationDesc }">
              {{ row.locationDesc || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="description" label="故障描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'text-[var(--el-text-color-secondary)]': !row.description }">
              {{ row.description || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="图片" width="82" align="center">
          <template #default="{ row }">
            <el-tag v-if="imageCount(row)" size="small" type="info" effect="plain">
              {{ imageCount(row) }} 张
            </el-tag>
            <span v-else class="text-[var(--el-text-color-secondary)]">—</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="86">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" effect="light">
              {{ row.statusName || ORDER_STATUS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="时间" width="128">
          <template #default="{ row }">
            <span class="whitespace-nowrap text-xs tabular-nums text-[var(--el-text-color-regular)]">
              {{ formatTime(row.createdAt) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="76" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
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
    </el-card>

    <ConsultDetailDrawer
      v-model="drawerVisible"
      :consult-id="detailId"
      @handled="getList"
    />
  </div>
</template>

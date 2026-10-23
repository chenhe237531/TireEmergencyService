<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import IconBulb from "~icons/tabler/bulb";
import { message } from "@/utils/message";
import { driverList, storeList, viewLogList } from "@/api/tire";
import type { ViewLogItem } from "@/api/tire";
import { formatTime } from "../common";

defineOptions({ name: "TireViewLog" });

const route = useRoute();
const router = useRouter();

/** 下拉候选条数：够运营按昵称/手机号/门店名快速定位 */
const OPTION_SIZE = 20;
/** 带着条件跳进来时补全已选司机/门店名称的一次拉取上限（演示库数据量小） */
const BACKFILL_SIZE = 200;

const actionOptions = [
  { value: "view", label: "曝光" },
  { value: "click", label: "点击" }
];

interface DriverOption {
  id: number;
  nickname: string;
  phone: string;
}
interface StoreOption {
  id: number;
  name: string;
}

const loading = ref(false);
const list = ref<ViewLogItem[]>([]);

const driverId = ref<number>();
const storeId = ref<number>();
const action = ref("");
const dateRange = ref<[string, string] | null>(null);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

const driverOptions = ref<DriverOption[]>([]);
const driverLoading = ref(false);
const storeOptions = ref<StoreOption[]>([]);
const storeLoading = ref(false);

const toId = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
};

/** el-select 清空时会抛空字符串，这里统一归一成 undefined，避免筛选参数被写成空值 */
const driverIdModel = computed({
  get: () => driverId.value,
  set: (val: number | string | undefined) => {
    driverId.value = toId(val);
  }
});
const storeIdModel = computed({
  get: () => storeId.value,
  set: (val: number | string | undefined) => {
    storeId.value = toId(val);
  }
});

const driverLabel = (item: DriverOption) =>
  item.phone ? `${item.nickname}（${item.phone}）` : item.nickname;

async function searchDrivers(keyword: string) {
  driverLoading.value = true;
  try {
    const res = await driverList({
      keyword: keyword.trim() || undefined,
      page: 1,
      pageSize: OPTION_SIZE
    });
    driverOptions.value = (res.list || []).map(item => ({
      id: item.id,
      nickname: item.nickname,
      phone: item.phone
    }));
  } catch {
    // 远程搜索失败只影响候选列表，不弹提示打断输入
    driverOptions.value = [];
  } finally {
    driverLoading.value = false;
  }
}

async function searchStores(keyword: string) {
  storeLoading.value = true;
  try {
    const res = await storeList({
      keyword: keyword.trim() || undefined,
      page: 1,
      pageSize: OPTION_SIZE
    });
    storeOptions.value = (res.list || []).map(item => ({
      id: item.id,
      name: item.name
    }));
  } catch {
    // 同上，候选门店拉不到时不打断筛选操作
    storeOptions.value = [];
  } finally {
    storeLoading.value = false;
  }
}

/** 从其他页带 driverId / storeId 跳进来时补全选项，避免选择框里只剩裸 id */
async function backfillSelected() {
  try {
    if (
      driverId.value &&
      !driverOptions.value.some(item => item.id === driverId.value)
    ) {
      const res = await driverList({ page: 1, pageSize: BACKFILL_SIZE });
      driverOptions.value = (res.list || []).map(item => ({
        id: item.id,
        nickname: item.nickname,
        phone: item.phone
      }));
    }
    if (
      storeId.value &&
      !storeOptions.value.some(item => item.id === storeId.value)
    ) {
      const res = await storeList({ page: 1, pageSize: BACKFILL_SIZE });
      storeOptions.value = (res.list || []).map(item => ({
        id: item.id,
        name: item.name
      }));
    }
  } catch {
    // 补全失败只影响下拉显示名，不阻塞列表
  }
}

async function getList() {
  loading.value = true;
  try {
    const res = await viewLogList({
      driverId: driverId.value,
      storeId: storeId.value,
      action: action.value,
      start: dateRange.value?.[0],
      end: dateRange.value?.[1],
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    list.value = res.list || [];
    pagination.total = res.total || 0;
    // 痕迹行里带着司机资料，用来补全下拉显示名（司机可能不在前 20 条候选里）
    if (
      driverId.value &&
      !driverOptions.value.some(item => item.id === driverId.value)
    ) {
      const row = list.value.find(item => item.driver?.id === driverId.value);
      if (row?.driver) driverOptions.value.unshift({ ...row.driver });
    }
  } catch (err) {
    list.value = [];
    pagination.total = 0;
    message((err as Error).message || "浏览痕迹加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function urlSignature(source: Record<string, unknown>) {
  return ["driverId", "storeId", "action", "start", "end"]
    .map(key => (typeof source[key] === "string" ? source[key] : ""))
    .join("|");
}

function stateSignature() {
  return [
    driverId.value ?? "",
    storeId.value ?? "",
    action.value,
    dateRange.value?.[0] ?? "",
    dateRange.value?.[1] ?? ""
  ].join("|");
}

/** 当前筛选条件写入地址栏，刷新或分享链接后不丢条件 */
function syncUrl() {
  const next: Record<string, string> = {};
  if (driverId.value) next.driverId = String(driverId.value);
  if (storeId.value) next.storeId = String(storeId.value);
  if (action.value) next.action = action.value;
  if (dateRange.value?.[0]) next.start = dateRange.value[0];
  if (dateRange.value?.[1]) next.end = dateRange.value[1];
  // 与地址栏一致时不重复 replace，避免产生无意义的路由事件
  if (urlSignature(next) === urlSignature(route.query)) return;
  router.replace({ path: route.path, query: next });
}

/** 把地址栏条件读进筛选区（从司机管理页跳转、或带参数刷新时） */
function applyRouteQuery() {
  driverId.value = toId(route.query.driverId);
  storeId.value = toId(route.query.storeId);
  action.value =
    typeof route.query.action === "string" ? route.query.action : "";
  const start = typeof route.query.start === "string" ? route.query.start : "";
  const end = typeof route.query.end === "string" ? route.query.end : "";
  dateRange.value = start && end ? [start, end] : null;
  pagination.page = 1;
}

function handleSearch() {
  pagination.page = 1;
  syncUrl();
  getList();
}

function handleReset() {
  driverId.value = undefined;
  storeId.value = undefined;
  action.value = "";
  dateRange.value = null;
  handleSearch();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  getList();
}

/** 行内「看该司机」：直接切到该司机的痕迹，并同步地址栏 */
function filterByDriver(driver: { id: number }) {
  driverId.value = driver.id;
  pagination.page = 1;
  syncUrl();
  getList();
}

/** 上次从地址栏同步过来的条件签名，用于 keepAlive 返回时判断要不要重新查 */
let lastUrlSignature = "";

onMounted(() => {
  applyRouteQuery();
  lastUrlSignature = stateSignature();
  searchDrivers("");
  searchStores("");
  backfillSelected();
  getList();
});

// keepAlive 页面：组件被缓存复用，只有地址栏条件变了（如从司机页再次点「查看痕迹」）才重新查询
onActivated(() => {
  if (urlSignature(route.query) === lastUrlSignature) return;
  applyRouteQuery();
  lastUrlSignature = stateSignature();
  backfillSelected();
  getList();
});
</script>

<template>
  <div class="p-2">
    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="font-medium">浏览痕迹</div>
      </template>

      <div
        class="mb-3 flex items-center gap-1.5 rounded-md bg-[var(--el-fill-color-light)] px-3 py-2 text-xs text-text_color_regular"
      >
        <el-icon :size="14" class="text-[var(--el-color-primary)]">
          <IconBulb />
        </el-icon>
        <span>痕迹用于判断司机意向，可据此主动线下对接</span>
      </div>

      <el-form inline @submit.prevent="handleSearch">
        <el-form-item label="司机">
          <el-select
            v-model="driverIdModel"
            class="w-[240px]!"
            filterable
            remote
            remote-show-suffix
            clearable
            :loading="driverLoading"
            :remote-method="searchDrivers"
            placeholder="全部司机，输入昵称/手机号"
            @change="handleSearch"
          >
            <el-option
              v-for="item in driverOptions"
              :key="item.id"
              :label="driverLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="门店">
          <el-select
            v-model="storeIdModel"
            class="w-[220px]!"
            filterable
            remote
            remote-show-suffix
            clearable
            :loading="storeLoading"
            :remote-method="searchStores"
            placeholder="全部门店，输入门店名"
            @change="handleSearch"
          >
            <el-option
              v-for="item in storeOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="动作">
          <el-select
            v-model="action"
            class="w-[150px]!"
            clearable
            placeholder="全部动作"
            @change="handleSearch"
          >
            <el-option
              v-for="item in actionOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            class="w-[260px]!"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
            @change="handleSearch"
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
        empty-text="司机在小程序端浏览/点击门店后，痕迹会出现在这里"
      >
        <el-table-column label="时间" width="180">
          <template #default="{ row }">
            <span class="tabular-nums text-text_color_regular">
              {{ formatTime(row.createdAt, "YYYY-MM-DD HH:mm:ss") }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="司机" min-width="190">
          <template #default="{ row }">
            <div class="font-medium">{{ row.driver?.nickname || "—" }}</div>
            <div class="mt-0.5 text-xs tabular-nums text-text_color_regular">
              {{ row.driver?.phone || "—" }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="门店" min-width="240">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span class="truncate">{{ row.store?.name || "—" }}</span>
              <el-tag
                v-if="row.categoryName"
                type="info"
                effect="plain"
                size="small"
              >
                {{ row.categoryName }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="动作" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.action === 'click' ? 'primary' : 'info'"
              effect="light"
            >
              {{ row.actionName || (row.action === "click" ? "点击" : "曝光") }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="driverId === row.driver?.id"
              @click="filterByDriver(row.driver)"
            >
              看该司机
            </el-button>
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
  </div>
</template>

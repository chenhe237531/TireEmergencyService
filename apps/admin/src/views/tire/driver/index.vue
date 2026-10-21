<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import IconUser from "~icons/tabler/user";
import { message } from "@/utils/message";
import { DRIVER_ROLES, driverList } from "@/api/tire";
import type { DriverItem } from "@/api/tire";

defineOptions({ name: "TireDriverList" });

const router = useRouter();

/** 身份 → 标签配色：三种身份固定色，未完善单独用灰标签 */
const roleTag: Record<string, string> = {
  private_owner: "primary",
  fleet: "warning",
  store: "success"
};

/**
 * 「未完善」在后端没有对应 role 值（role 为空，接口 role 参数是精确匹配），
 * 这里用哨兵值标记，改为拉一页较大数据后在前端过滤 + 本地分页。
 */
const EMPTY_ROLE = "__empty__";
/** 前端过滤「未完善」和顶部统计时一次拉取的条数上限（演示库数据量小，足够覆盖） */
const BULK_SIZE = 200;

const loading = ref(false);
const list = ref<DriverItem[]>([]);

const query = reactive({ keyword: "", role: "" });
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

const stats = reactive({ total: 0, roleFilled: 0, weekNew: 0 });
const statsLoaded = ref(false);
/** 司机数超过一次拉取上限时无法精确统计，展示「—」而不是估算值 */
const statsComplete = ref(false);

const statValue = computed(() => ({
  total: statsLoaded.value ? stats.total : "—",
  filled: statsLoaded.value && statsComplete.value ? stats.roleFilled : "—",
  week: statsLoaded.value && statsComplete.value ? stats.weekNew : "—"
}));

const formatTime = (value?: string | null) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "";

/** 无头像时用昵称首字占位，昵称为空则退回图标 */
const avatarLetter = (row: DriverItem) => (row.nickname || "").trim().slice(0, 1);

async function getList() {
  loading.value = true;
  try {
    const keyword = query.keyword.trim();
    if (query.role === EMPTY_ROLE) {
      const res = await driverList({ keyword, page: 1, pageSize: BULK_SIZE });
      const rows = (res.list || []).filter(item => item.roleEmpty);
      pagination.total = rows.length;
      const maxPage = Math.max(1, Math.ceil(rows.length / pagination.pageSize));
      if (pagination.page > maxPage) pagination.page = maxPage;
      const start = (pagination.page - 1) * pagination.pageSize;
      list.value = rows.slice(start, start + pagination.pageSize);
      return;
    }

    let res = await driverList({
      keyword,
      role: query.role,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    // 筛选后总数变小，当前页可能超界，回退到最后一页再取一次
    const maxPage = Math.max(1, Math.ceil(res.total / pagination.pageSize));
    if (pagination.page > maxPage) {
      pagination.page = maxPage;
      res = await driverList({
        keyword,
        role: query.role,
        page: maxPage,
        pageSize: pagination.pageSize
      });
    }
    list.value = res.list || [];
    pagination.total = res.total || 0;
  } catch (err) {
    list.value = [];
    pagination.total = 0;
    message((err as Error).message || "司机列表加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

/** 顶部统计：司机总数取接口 total，其余两项基于全量结果计算，取不到就显示「—」 */
async function loadStats() {
  try {
    const res = await driverList({ page: 1, pageSize: BULK_SIZE });
    const rows = res.list || [];
    stats.total = res.total || 0;
    statsComplete.value = stats.total <= rows.length;
    statsLoaded.value = true;
    if (!statsComplete.value) return;
    stats.roleFilled = rows.filter(item => !item.roleEmpty).length;
    // 近 7 天含今天，按本地自然日比较，避免时区导致把当天算到区间外
    const since = dayjs()
      .startOf("day")
      .subtract(6, "day");
    stats.weekNew = rows.filter(
      item => item.createdAt && !dayjs(item.createdAt).isBefore(since)
    ).length;
  } catch {
    statsLoaded.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  getList();
}

function handleReset() {
  query.keyword = "";
  query.role = "";
  pagination.page = 1;
  getList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  getList();
}

function goViewLog(row: DriverItem) {
  router.push({ path: "/tire/viewlog", query: { driverId: row.id } });
}

// keepAlive 页面：首次由 onMounted 拉取，之后每次切回标签页刷新，避免看到过期数据
let skipFirstActivated = true;
onMounted(() => {
  getList();
  loadStats();
});
onActivated(() => {
  if (skipFirstActivated) {
    skipFirstActivated = false;
    return;
  }
  getList();
  loadStats();
});
</script>

<template>
  <div class="p-2">
    <div class="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
      <el-card shadow="never" :body-style="{ padding: '16px 18px' }">
        <div class="text-sm text-text_color_regular">司机总数</div>
        <div class="mt-2 text-[26px] font-semibold leading-none tabular-nums">
          {{ statValue.total }}
        </div>
        <div class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
          已注册的小程序司机
        </div>
      </el-card>
      <el-card shadow="never" :body-style="{ padding: '16px 18px' }">
        <div class="text-sm text-text_color_regular">已完善身份</div>
        <div
          class="mt-2 text-[26px] font-semibold leading-none tabular-nums text-primary"
        >
          {{ statValue.filled }}
        </div>
        <div class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
          已选择车主身份，可精准对接
        </div>
      </el-card>
      <el-card shadow="never" :body-style="{ padding: '16px 18px' }">
        <div class="text-sm text-text_color_regular">近 7 天新增</div>
        <div class="mt-2 text-[26px] font-semibold leading-none tabular-nums">
          {{ statValue.week }}
        </div>
        <div class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
          最近 7 天注册的司机
        </div>
      </el-card>
    </div>

    <el-card shadow="never" class="mb-3">
      <template #header>
        <div class="font-medium">司机管理</div>
      </template>

      <el-form inline :model="query" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            class="w-[220px]!"
            clearable
            placeholder="昵称 / 手机号，回车查询"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
        </el-form-item>
        <el-form-item label="身份">
          <el-select
            v-model="query.role"
            class="w-[180px]!"
            placeholder="全部身份"
            @change="handleSearch"
          >
            <el-option label="全部身份" value="" />
            <el-option
              v-for="(label, value) in DRIVER_ROLES"
              :key="value"
              :label="label"
              :value="value"
            />
            <el-option label="未完善" :value="EMPTY_ROLE" />
          </el-select>
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
        empty-text="暂无注册司机"
      >
        <el-table-column label="头像" width="76" align="center">
          <template #default="{ row }">
            <el-avatar
              :size="40"
              :src="row.avatarUrl || undefined"
              class="bg-[var(--el-color-primary-light-8)]! font-medium text-[var(--el-color-primary)]!"
            >
              <template v-if="avatarLetter(row)">
                {{ avatarLetter(row) }}
              </template>
              <el-icon v-else :size="18"><IconUser /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>

        <el-table-column label="昵称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-medium">{{ row.nickname || "—" }}</span>
          </template>
        </el-table-column>

        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <span
              class="tabular-nums"
              :class="{ 'text-text_color_regular': !row.phone }"
            >
              {{ row.phone || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="身份" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.roleEmpty" type="info" effect="plain">未完善</el-tag>
            <el-tag v-else :type="roleTag[row.role] || 'info'" effect="light">
              {{ row.roleName || DRIVER_ROLES[row.role] || "—" }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="注册时间" width="165">
          <template #default="{ row }">
            <span class="text-text_color_regular">{{ formatTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="最近登录" width="165">
          <template #default="{ row }">
            <span v-if="row.lastLoginAt">{{ formatTime(row.lastLoginAt) }}</span>
            <span v-else class="text-text_color_regular">从未登录</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goViewLog(row)">
              查看痕迹
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

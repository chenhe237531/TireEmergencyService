<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from "vue";
import { ElMessageBox } from "element-plus";
import IconPlus from "~icons/tabler/plus";
import { message } from "@/utils/message";
import {
  STORE_CATEGORIES,
  storeDelete,
  storeList,
  storeUpdate
} from "@/api/tire";
import type { StoreItem } from "@/api/tire";
import StoreFormDialog from "./StoreFormDialog.vue";
import { formatTime, useIsSuperAdmin } from "../common";

defineOptions({ name: "TireStoreList" });

/** el-table 插槽 row 的静态类型是 DefaultRow，统一在此断言为业务类型 */
const asStore = (row: unknown) => row as StoreItem;

/** 删除门店仅超级管理员可用；运营仍可新增/编辑/隐藏 */
const canDelete = useIsSuperAdmin();

/** 分类 → el-tag 类型，同分类保持同色，方便快速扫读 */
/** el-tag 的类型取值，避免字典的 string 与组件联合类型不兼容 */
type TagType = "primary" | "success" | "warning" | "danger" | "info";
const categoryTag: Record<string, TagType> = {
  tire_big: "warning",
  tire_small: "primary",
  tire_both: "success",
  repair_big: "danger",
  repair_small: "info",
  towing: "primary"
};

const statusOptions = [
  { value: "active", label: "展示中" },
  { value: "hidden", label: "已隐藏" }
];

const loading = ref(false);
const list = ref<StoreItem[]>([]);
/** 正在切换状态的门店 id，用于 switch 行内 loading */
const statusLoadingId = ref<number | null>(null);
const deletingId = ref<number | null>(null);

const query = reactive({ keyword: "", category: "", status: "" });
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

const dialogVisible = ref(false);
const editingRow = ref<StoreItem | null>(null);

async function getList() {
  loading.value = true;
  try {
    const params = {
      keyword: query.keyword.trim(),
      category: query.category,
      status: query.status
    };
    let res = await storeList({
      ...params,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    // 删除/筛选后总数变小，当前页可能超界，回退到最后一页再取一次
    const maxPage = Math.max(1, Math.ceil(res.total / pagination.pageSize));
    if (pagination.page > maxPage) {
      pagination.page = maxPage;
      res = await storeList({
        ...params,
        page: maxPage,
        pageSize: pagination.pageSize
      });
    }
    list.value = res.list || [];
    pagination.total = res.total || 0;
  } catch (err) {
    // 接口异常时清空列表并提示，避免停留旧数据造成误解
    list.value = [];
    pagination.total = 0;
    message((err as Error).message || "门店列表加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  getList();
}

function handleReset() {
  query.keyword = "";
  query.category = "";
  query.status = "";
  pagination.page = 1;
  getList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  getList();
}

function openCreate() {
  editingRow.value = null;
  dialogVisible.value = true;
}

function openEdit(row: StoreItem) {
  editingRow.value = row;
  dialogVisible.value = true;
}

/**
 * 新增成功后按名称定位到新门店：列表按 sort、id 倒序，新门店默认权重 0 会落到末页，
 * 直接回第 1 页看不到，容易被误认为没保存成功。
 */
function handleSaved(mode: "create" | "edit", row?: StoreItem) {
  if (mode === "create" && row) {
    query.keyword = row.name;
    pagination.page = 1;
  }
  getList();
}

async function handleToggleStatus(row: StoreItem, active: boolean) {
  const next = active ? "active" : "hidden";
  statusLoadingId.value = row.id;
  try {
    await storeUpdate(row.id, { status: next });
    // 就地更新行数据，不整表刷新，避免运营正在看的行位置跳动
    row.status = next;
    message(active ? "已切换为展示中" : "已切换为已隐藏", { type: "success" });
  } catch (err) {
    // switch 的选中态由 row.status 推导，失败时不改 row.status 即自动回滚
    message((err as Error).message || "状态更新失败", { type: "error" });
  } finally {
    statusLoadingId.value = null;
  }
}

async function handleDelete(row: StoreItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除门店「${row.name}」吗？已有浏览记录的门店删除后将转为隐藏。`,
      "删除门店",
      {
        type: "warning",
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        confirmButtonClass: "el-button--danger"
      }
    );
  } catch {
    return;
  }

  deletingId.value = row.id;
  try {
    await storeDelete(row.id);
    message("门店已删除", { type: "success" });
    await getList();
  } catch (err) {
    message((err as Error).message || "删除失败", { type: "error" });
  } finally {
    deletingId.value = null;
  }
}

// keepAlive 页面：首次由 onMounted 拉取，之后每次切回标签页刷新，避免看到过期数据
let skipFirstActivated = true;
onMounted(() => getList());
onActivated(() => {
  if (skipFirstActivated) {
    skipFirstActivated = false;
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
          <div class="font-medium">门店管理</div>
          <el-button type="primary" :icon="IconPlus" @click="openCreate">
            新增门店
          </el-button>
        </div>
      </template>

      <el-form inline :model="query" @submit.prevent="handleSearch">
        <el-form-item label="门店名称">
          <el-input
            v-model="query.keyword"
            class="w-[220px]!"
            clearable
            placeholder="输入名称关键字，回车查询"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            v-model="query.category"
            class="w-[180px]!"
            clearable
            placeholder="全部分类"
            @change="handleSearch"
          >
            <el-option
              v-for="(label, value) in STORE_CATEGORIES"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            class="w-[160px]!"
            clearable
            placeholder="全部状态"
            @change="handleSearch"
          >
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
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
        empty-text="暂无门店，点击右上角新增门店"
      >
        <el-table-column label="门店名称" min-width="200">
          <template #default="{ row }">
            <div class="font-medium">{{ row.name }}</div>
            <div
              class="mt-0.5 truncate text-xs text-text_color_regular"
              :title="row.mainServices"
            >
              {{ row.mainServices || "—" }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="分类" width="130">
          <template #default="{ row }">
            <el-tag
              v-if="STORE_CATEGORIES[row.category]"
              :type="categoryTag[row.category] || 'info'"
              effect="light"
            >
              {{ STORE_CATEGORIES[row.category] }}
            </el-tag>
            <span v-else class="text-text_color_regular">—</span>
          </template>
        </el-table-column>

        <el-table-column label="评分" width="175">
          <template #default="{ row }">
            <el-rate
              :model-value="Number(row.score) || 0"
              disabled
              allow-half
              show-score
              score-template="{value}"
              size="small"
            />
          </template>
        </el-table-column>

        <el-table-column label="模糊区域" width="110">
          <template #default="{ row }">
            <span :class="{ 'text-text_color_regular': !row.areaLabel }">
              {{ row.areaLabel || "—" }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }">
            <span class="font-medium tabular-nums">{{ row.sort }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-switch
                :model-value="row.status === 'active'"
                :loading="statusLoadingId === row.id"
                @change="val => handleToggleStatus(asStore(row), Boolean(val))"
              />
              <span
                class="text-xs"
                :class="
                  row.status === 'active'
                    ? 'text-primary'
                    : 'text-text_color_regular'
                "
              >
                {{ row.status === "active" ? "展示中" : "已隐藏" }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="更新时间" width="165">
          <template #default="{ row }">
            <span class="text-text_color_regular">{{
              formatTime(row.updatedAt)
            }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(asStore(row))"
              >编辑</el-button
            >
            <el-button
              v-if="canDelete"
              link
              type="danger"
              :loading="deletingId === row.id"
              @click="handleDelete(asStore(row))"
            >
              删除
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

    <StoreFormDialog
      v-model="dialogVisible"
      :row="editingRow"
      @saved="handleSaved"
    />
  </div>
</template>

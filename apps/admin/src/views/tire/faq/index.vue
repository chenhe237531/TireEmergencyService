<script setup lang="ts">
import { onActivated, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { ElMessageBox } from "element-plus";
import IconPlus from "~icons/tabler/plus";
import IconSearch from "~icons/tabler/search";
import { message } from "@/utils/message";
import { faqDelete, faqList, faqUpdate } from "@/api/tire";
import type { FaqItem } from "@/api/tire";
import FaqFormDialog from "./FaqFormDialog.vue";

defineOptions({ name: "TireFaq" });

/** el-table 插槽 row 的静态类型是 DefaultRow，统一在此断言为业务类型 */
const asFaq = (row: unknown) => row as FaqItem;

const loading = ref(false);
const list = ref<FaqItem[]>([]);
/** 正在切换显隐的问题 id，用于行内 switch loading */
const statusLoadingId = ref<number | null>(null);
const deletingId = ref<number | null>(null);

const query = reactive({ keyword: "" });

const dialogVisible = ref(false);
const editingRow = ref<FaqItem | null>(null);

const formatTime = (value?: string) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";

/** 表格里答案最多展示 50 字，完整内容放 tooltip，避免撑破列宽 */
const truncate = (text?: string, max = 50) => {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

async function getList() {
  loading.value = true;
  try {
    const keyword = query.keyword.trim();
    const res = await faqList(keyword || undefined);
    list.value = res || [];
  } catch (err) {
    // 失败清空列表并提示，避免展示过期数据
    list.value = [];
    message((err as Error).message || "常见问题加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  getList();
}

function handleReset() {
  query.keyword = "";
  getList();
}

function openCreate() {
  editingRow.value = null;
  dialogVisible.value = true;
}

function openEdit(row: FaqItem) {
  editingRow.value = row;
  dialogVisible.value = true;
}

async function handleToggleStatus(row: FaqItem, active: boolean) {
  const next = active ? "active" : "hidden";
  statusLoadingId.value = row.id;
  try {
    await faqUpdate(row.id, { status: next });
    // 成功后就地更新，不整表刷新，避免行位置跳动
    row.status = next;
    message(active ? "已启用，小程序端将展示" : "已隐藏，小程序端不再展示", {
      type: "success"
    });
  } catch (err) {
    // switch 选中态由 row.status 推导，失败时不改 row.status 即自动回滚
    message((err as Error).message || "状态更新失败", { type: "error" });
  } finally {
    statusLoadingId.value = null;
  }
}

async function handleDelete(row: FaqItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${truncate(row.question, 30)}」吗？删除后小程序端将不再展示该问题。`,
      "删除问题",
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
    await faqDelete(row.id);
    message("问题已删除", { type: "success" });
    await getList();
  } catch (err) {
    message((err as Error).message || "删除失败", { type: "error" });
  } finally {
    deletingId.value = null;
  }
}

// keepAlive 页面：首次 onMounted 拉取，之后每次切回标签页刷新
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
    <el-card shadow="never">
      <template #header>
        <div class="flex-bc">
          <div>
            <div class="font-medium">常见问题</div>
            <div class="mt-1 text-xs text-text_color_regular">
              排序值越大越靠前；隐藏后小程序端不再展示
            </div>
          </div>
          <el-button type="primary" :icon="IconPlus" @click="openCreate">
            新增问题
          </el-button>
        </div>
      </template>

      <el-form inline :model="query" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            class="w-[240px]!"
            clearable
            placeholder="搜索问题或答案，回车查询"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="IconSearch" @click="handleSearch">
            查询
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="list" border stripe row-key="id">
        <el-table-column label="排序值" width="90" align="center">
          <template #default="{ row }">
            <span class="font-medium tabular-nums">{{ row.sort }}</span>
          </template>
        </el-table-column>

        <el-table-column label="问题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-medium">{{ row.question }}</span>
          </template>
        </el-table-column>

        <el-table-column label="答案" min-width="320">
          <template #default="{ row }">
            <el-tooltip placement="top" :show-after="300">
              <template #content>
                <div class="max-w-[420px] whitespace-pre-wrap leading-5">
                  {{ row.answer || "—" }}
                </div>
              </template>
              <span class="block truncate text-text_color_regular">
                {{ truncate(row.answer) }}
              </span>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-switch
                :model-value="row.status === 'active'"
                :loading="statusLoadingId === row.id"
                @change="val => handleToggleStatus(asFaq(row), Boolean(val))"
              />
              <span
                class="text-xs"
                :class="
                  row.status === 'active'
                    ? 'text-primary'
                    : 'text-text_color_regular'
                "
              >
                {{ row.status === "active" ? "启用" : "隐藏" }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="更新时间" width="165">
          <template #default="{ row }">
            <span class="text-text_color_regular">
              {{ formatTime(row.createdAt) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(asFaq(row))">
              编辑
            </el-button>
            <el-button
              link
              type="danger"
              :loading="deletingId === row.id"
              @click="handleDelete(asFaq(row))"
            >
              删除
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty
            :image-size="80"
            :description="
              query.keyword.trim()
                ? '没有匹配的常见问题，换个关键字试试'
                : '暂无常见问题，点击右上角新增'
            "
          />
        </template>
      </el-table>
    </el-card>

    <FaqFormDialog v-model="dialogVisible" :row="editingRow" @saved="getList" />
  </div>
</template>

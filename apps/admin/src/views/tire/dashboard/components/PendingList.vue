<script setup lang="ts">
import IconArrowRight from "~icons/tabler/arrow-right";
import type { PendingRow } from "../types";

withDefaults(
  defineProps<{
    /** 卡片标题 */
    title: string;
    /** 列表数据（最多 5 条，由父级裁剪） */
    rows: PendingRow[];
    /** 空态文案 */
    emptyText: string;
    /** 加载态 */
    loading?: boolean;
    /** 标题左侧色条：救援 danger、咨询 warning */
    accent?: "danger" | "warning";
  }>(),
  { loading: false, accent: "danger" }
);

const emit = defineEmits<{
  (e: "row-click", row: PendingRow): void;
  (e: "view-all"): void;
}>();

const accentClass = {
  danger: "bg-[var(--el-color-danger)]",
  warning: "bg-[var(--el-color-warning)]"
};
</script>

<template>
  <el-card shadow="never" class="h-full">
    <template #header>
      <div class="flex-bc gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="h-4 w-1 shrink-0 rounded-full"
            :class="accentClass[accent]"
          />
          <span class="truncate font-medium">{{ title }}</span>
          <el-tag
            v-if="rows.length"
            size="small"
            effect="plain"
            :type="accent"
            round
          >
            {{ rows.length }}
          </el-tag>
        </div>
        <el-button
          link
          type="primary"
          class="shrink-0"
          @click="emit('view-all')"
        >
          查看全部
          <el-icon class="ml-1"><IconArrowRight /></el-icon>
        </el-button>
      </div>
    </template>

    <div v-loading="loading" class="min-h-[160px]">
      <div v-if="rows.length">
        <div
          v-for="row in rows"
          :key="row.id"
          class="pending-row flex cursor-pointer items-start gap-3 rounded-lg px-2 py-3"
          @click="emit('row-click', row)"
        >
          <span
            class="mt-0.5 shrink-0 rounded bg-[var(--el-fill-color-light)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--el-text-color-secondary)]"
          >
            #{{ row.no }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span
                class="truncate text-sm font-medium text-[var(--el-text-color-primary)]"
              >
                {{ row.primary }}
              </span>
              <span
                class="shrink-0 text-xs tabular-nums text-[var(--el-text-color-secondary)]"
              >
                {{ row.secondary }}
              </span>
            </div>
            <div
              class="mt-1 truncate text-xs text-[var(--el-text-color-regular)]"
              :title="row.desc"
            >
              {{ row.desc }}
            </div>
          </div>
          <span
            class="mt-0.5 shrink-0 text-xs tabular-nums text-[var(--el-text-color-placeholder)]"
          >
            {{ row.time }}
          </span>
        </div>
      </div>
      <div v-else class="flex-c py-8">
        <el-empty :description="emptyText" :image-size="70" />
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.pending-row {
  transition: background-color 0.2s ease;
}
.pending-row:hover {
  background: var(--el-fill-color-lighter);
}
</style>

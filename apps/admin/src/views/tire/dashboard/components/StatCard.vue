<script setup lang="ts">
import { computed, type Component } from "vue";
import type { StatTone } from "../types";

const props = withDefaults(
  defineProps<{
    /** 卡片标题 */
    title: string;
    /** 主数字 */
    value: number;
    /** 底部业务说明 */
    desc: string;
    /** 左上角图标组件 */
    icon: Component;
    /** 色调：待处理类用 danger/warning，其余 brand/neutral */
    tone?: StatTone;
    /** 是否显示小红点（待处理 > 0 时由父级控制） */
    dot?: boolean;
    /** 是否可点击跳转 */
    clickable?: boolean;
  }>(),
  { tone: "neutral", dot: false, clickable: false }
);

const emit = defineEmits<{ (e: "click"): void }>();

const valueClass = computed(() =>
  props.tone === "danger" || props.tone === "warning"
    ? "text-[var(--el-color-danger)]"
    : "text-[var(--el-text-color-primary)]"
);

function onClick() {
  if (props.clickable) emit("click");
}
</script>

<template>
  <el-card
    shadow="never"
    class="stat-card h-full"
    :class="[`tone-${tone}`, { 'stat-card--link': clickable }]"
    :body-style="{ padding: '16px 18px' }"
    @click="onClick"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="truncate text-sm text-[var(--el-text-color-regular)]">
          {{ title }}
        </div>
        <div
          class="mt-3 text-[30px] font-semibold leading-none tabular-nums"
          :class="valueClass"
        >
          {{ value }}
        </div>
      </div>
      <el-badge is-dot :hidden="!dot" class="shrink-0">
        <div class="stat-icon flex-c">
          <el-icon :size="20"><component :is="icon" /></el-icon>
        </div>
      </el-badge>
    </div>
    <div
      class="mt-3 truncate text-xs text-[var(--el-text-color-secondary)]"
      :title="desc"
    >
      {{ desc }}
    </div>
  </el-card>
</template>

<style scoped>
.stat-card {
  --stat-tone: var(--el-color-info);
  --stat-tone-bg: var(--el-fill-color-light);
  position: relative;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

/* 左侧色条：区分中性卡与警示卡 */
.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--stat-tone);
}

.tone-brand {
  --stat-tone: var(--el-color-primary);
  --stat-tone-bg: var(--el-color-primary-light-8);
}

.tone-danger {
  --stat-tone: var(--el-color-danger);
  --stat-tone-bg: var(--el-color-danger-light-8);
}

.tone-warning {
  --stat-tone: var(--el-color-warning);
  --stat-tone-bg: var(--el-color-warning-light-8);
}

.stat-icon {
  width: 40px;
  height: 40px;
  color: var(--stat-tone);
  background: var(--stat-tone-bg);
  border-radius: 10px;
}

.stat-card--link {
  cursor: pointer;
}

.stat-card--link:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}
</style>

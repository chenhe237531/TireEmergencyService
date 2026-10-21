<script setup lang="ts">
import { computed } from "vue";
import { useDark } from "@pureadmin/utils";
import XChart from "@/components/XChart/index.vue";

const props = withDefaults(
  defineProps<{
    trend: { date: string; rescue: number; consult: number }[];
    height?: string;
  }>(),
  { height: "300px" }
);

/** 与统计卡品牌色、咨询色保持一致 */
const RESCUE_COLOR = "#E8721C";
const CONSULT_COLOR = "#2F86D9";

const { isDark } = useDark();

/** 7 天全为 0 或没有数据时展示空态，避免只画一条贴底的直线 */
const isEmpty = computed(
  () => !props.trend.length || props.trend.every(i => !i.rescue && !i.consult)
);

const axisTextColor = computed(() => (isDark.value ? "#A3A6AD" : "#909399"));
const splitLineColor = computed(() =>
  isDark.value ? "rgba(255, 255, 255, 0.08)" : "#EBEEF5"
);
const tooltipBg = computed(() => (isDark.value ? "#1D1E1F" : "#FFFFFF"));

/** ECharts 原生支持的线性渐变色对象，无需额外引入 echarts.graphic */
function areaGradient(top: string, bottom: string) {
  return {
    color: {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: top },
        { offset: 1, color: bottom }
      ]
    }
  };
}

const option = computed(() => {
  const labels = props.trend.map(i => i.date);
  return {
    color: [RESCUE_COLOR, CONSULT_COLOR],
    grid: { left: 8, right: 16, top: 48, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg.value,
      borderColor: splitLineColor.value,
      textStyle: { color: axisTextColor.value },
      axisPointer: { type: "line", lineStyle: { color: splitLineColor.value } },
      valueFormatter: (value: number) => `${value} 单`
    },
    legend: {
      top: 4,
      right: 8,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 18,
      textStyle: { color: axisTextColor.value, fontSize: 12 }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: splitLineColor.value } },
      axisLabel: { color: axisTextColor.value }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitNumber: 4,
      axisLabel: { color: axisTextColor.value },
      splitLine: { lineStyle: { color: splitLineColor.value, type: "dashed" } }
    },
    series: [
      {
        name: "救援通知",
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: true,
        data: props.trend.map(i => i.rescue),
        lineStyle: { width: 2.5 },
        areaStyle: areaGradient(
          "rgba(232, 114, 28, 0.28)",
          "rgba(232, 114, 28, 0.02)"
        ),
        emphasis: { focus: "series" }
      },
      {
        name: "咨询工单",
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: true,
        data: props.trend.map(i => i.consult),
        lineStyle: { width: 2.5 },
        areaStyle: areaGradient(
          "rgba(47, 134, 217, 0.26)",
          "rgba(47, 134, 217, 0.02)"
        ),
        emphasis: { focus: "series" }
      }
    ]
  };
});
</script>

<template>
  <div v-if="isEmpty" class="flex-c flex-col" :style="{ height }">
    <el-empty description="近 7 天暂无救援 / 咨询数据" :image-size="72" />
  </div>
  <XChart v-else :option="option" :height="height" />
</template>

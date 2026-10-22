<script setup lang="ts">
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

// 按需注册，避免把整包 ECharts 打进后台首屏
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{ option: any; height?: string }>();
const el = ref<HTMLDivElement>();
let chart: ReturnType<typeof echarts.init> | null = null;
const resize = () => chart?.resize();

onMounted(() => {
  chart = echarts.init(el.value!);
  chart.setOption(props.option || {});
  window.addEventListener("resize", resize);
});
watch(
  () => props.option,
  o => chart?.setOption(o || {}, true),
  { deep: true }
);
onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  chart?.dispose();
});
</script>

<template>
  <div ref="el" :style="{ width: '100%', height: height || '260px' }" />
</template>

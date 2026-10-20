<script setup lang="ts">
import * as echarts from "echarts";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ option: any; height?: string }>();
const el = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
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

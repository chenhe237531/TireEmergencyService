<script setup lang="ts">
/** 门店评分：橙星 + 数字；无评分时降级为「暂无评分」弱化展示 */
withDefaults(defineProps<{
  score?: number | null
}>(), {
  score: null,
})

const has = (v?: number | null) => v != null && v > 0
</script>

<template>
  <view class="t-score" :class="{ 't-score--empty': !has(score) }">
    <text v-if="has(score)" class="i-tabler-star-filled t-score__star text-[13px]" />
    <text v-else class="i-tabler-star text-[13px]" />
    <text>{{ has(score) ? Number(score).toFixed(1) : '暂无评分' }}</text>
  </view>
</template>

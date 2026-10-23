<script setup lang="ts">
/**
 * 门店卡片（首页列表）
 *
 * 信息分级：店名 / 距离 / 评分 一眼可见；区域只到「模糊区域」，主营项目做标签。
 * 按需求不出现电话、详细地址与详情入口——点击统一走平台对接。
 */
import { computed } from 'vue'
import TScore from '@/components/tire/TScore.vue'
import TTag from '@/components/tire/TTag.vue'

const props = defineProps<{
  store: {
    id: number
    name: string
    category: string
    categoryName: string
    mainServices: string
    score: number | null
    areaLabel: string
    distanceKm: number | null
    distanceLabel: string
  }
}>()

const emit = defineEmits<{ (e: 'click'): void }>()

/** 主营项目按顿号/逗号拆成标签，最多 3 个，其余折叠成 +n */
const services = computed(() => {
  const list = String(props.store.mainServices || '')
    .split(/[、,，;；]/)
    .map(s => s.trim())
    .filter(Boolean)
  return { shown: list.slice(0, 3), rest: Math.max(0, list.length - 3) }
})
</script>

<template>
  <view class="t-card t-card--tap store" @click="emit('click')">
    <view class="flex items-start gap-3">
      <view class="min-w-0 flex-1">
        <view class="flex items-center gap-2">
          <text class="store__name">{{ store.name }}</text>
          <TScore :score="store.score" />
        </view>
        <view class="store__meta">
          <text class="i-tabler-map-pin store__pin" />
          <text class="truncate">{{ store.areaLabel || '区域待补充' }}</text>
          <text class="store__dot" />
          <text class="truncate">{{ store.categoryName }}</text>
        </view>
      </view>
      <!-- 未授权定位或未填坐标时后端不返回距离，这里也不展示 -->
      <view v-if="store.distanceLabel" class="store__dist">
        <text class="store__dist-num">{{ store.distanceLabel }}</text>
        <text class="store__dist-cap">距离</text>
      </view>
    </view>

    <view class="mt-3 flex flex-wrap gap-1.5">
      <TTag v-for="s in services.shown" :key="s">
        {{ s }}
      </TTag>
      <TTag v-if="services.rest">
        +{{ services.rest }}
      </TTag>
    </view>

    <view class="store__ft">
      <text class="i-tabler-shield-check text-[13px]" />
      <text>点击后由平台客服为你对接</text>
      <text class="i-tabler-chevron-right store__ft-arrow" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.store {
  padding: 16px;
}

.store__name {
  max-width: 62%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}

.store__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-3);
}

.store__pin {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--ink-3);
}

/* 两个信息之间的细点分隔 */
.store__dot {
  flex-shrink: 0;
  width: 3px;
  height: 3px;
  margin: 0 2px;
  border-radius: 50%;
  background: #d5cfc6;
}

.store__dist {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.store__dist-num {
  font-size: 19px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--brand);
}

.store__dist-cap {
  font-size: 11px;
  color: var(--ink-3);
}

.store__ft {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 11px;
  color: var(--ink-3);
}

.store__ft-arrow {
  margin-left: auto;
  font-size: 14px;
  color: #c4bdb3;
}
</style>

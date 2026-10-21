<script setup lang="ts">
/**
 * 品牌标识：纯 CSS 绘制的轮胎标记 + 品牌名。
 * 不用图片/SVG（小程序不支持内联 svg，图片又要多份尺寸），换肤只改 CSS 变量即可。
 */
withDefaults(defineProps<{
  /** 尺寸档：sm 用于导航栏，md 用于卡片，lg 用于登录页头图 */
  size?: 'sm' | 'md' | 'lg'
  /** 反白（深色/橙色底上使用） */
  light?: boolean
  /** 副标题，不传则不占位 */
  sub?: string
}>(), {
  size: 'md',
  light: false,
  sub: '',
})
</script>

<template>
  <view class="t-brand" :class="[`t-brand--${size}`, { 't-brand--light': light }]">
    <view class="t-brand__mark">
      <view class="t-brand__tire" />
      <view class="t-brand__hub" />
      <view class="t-brand__tread t-brand__tread--a" />
      <view class="t-brand__tread t-brand__tread--b" />
      <view class="t-brand__tread t-brand__tread--c" />
      <view class="t-brand__tread t-brand__tread--d" />
    </view>
    <view class="t-brand__text">
      <text class="t-brand__name">小蚂蚁轮胎救援</text>
      <text v-if="sub" class="t-brand__sub">{{ sub }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.t-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.t-brand__mark {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: linear-gradient(140deg, var(--brand-bright), var(--brand-dark));
  box-shadow: 0 4px 10px -4px rgba(232, 114, 28, 0.7);
}

.t-brand--sm .t-brand__mark {
  width: 28px;
  height: 28px;
  border-radius: 9px;
}

.t-brand--lg .t-brand__mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

/* 轮胎外圈 */
.t-brand__tire {
  width: 62%;
  height: 62%;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.95);
}

/* 轮毂 */
.t-brand__hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18%;
  height: 18%;
  margin: -9% 0 0 -9%;
  border-radius: 50%;
  background: #fff;
}

/* 四处胎面刻度 */
.t-brand__tread {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.85);
}

.t-brand__tread--a {
  left: 50%;
  top: 2px;
  margin-left: -1.5px;
}
.t-brand__tread--b {
  left: 50%;
  bottom: 2px;
  margin-left: -1.5px;
}
.t-brand__tread--c {
  top: 50%;
  left: 2px;
  margin-top: -1.5px;
}
.t-brand__tread--d {
  top: 50%;
  right: 2px;
  margin-top: -1.5px;
}

.t-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.t-brand__name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: var(--ink);
}

.t-brand--sm .t-brand__name {
  font-size: 14px;
}

.t-brand--lg .t-brand__name {
  font-size: 20px;
}

.t-brand__sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-3);
}

.t-brand--light .t-brand__mark {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: none;
}

.t-brand--light .t-brand__name {
  color: #fff;
}

.t-brand--light .t-brand__sub {
  color: rgba(255, 255, 255, 0.82);
}
</style>

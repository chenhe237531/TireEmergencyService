<script setup lang="ts">
/** 小标签：主营项目、身份、状态等短文案 */
withDefaults(defineProps<{
  type?: 'default' | 'brand' | 'care' | 'alert'
  text?: string
}>(), {
  type: 'default',
  text: '',
})
</script>

<template>
  <text class="t-tag" :class="`t-tag--${type}`">
    <slot>{{ text }}</slot>
  </text>
</template>

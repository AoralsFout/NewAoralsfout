<!-- 统一线性图标组件：按名称绘制装饰性 SVG，交互控件的无障碍名称由调用方提供。 -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    name?:
      | "arrow"
      | "down"
      | "plus"
      | "close"
      | "menu"
      | "github"
      | "check"
      | "copy";
    size?: number;
  }>(),
  { name: "arrow", size: 24 },
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="square"
    aria-hidden="true"
  >
    <path v-if="name === 'arrow'" d="M5 19 19 5M5 5h14v14" />
    <path v-else-if="name === 'down'" d="M12 4v16M5 13l7 7 7-7" />
    <path v-else-if="name === 'plus'" d="M12 4v16M4 12h16" />
    <path v-else-if="name === 'close'" d="m5 5 14 14M19 5 5 19" />
    <path v-else-if="name === 'menu'" d="M4 8h16M4 16h16" />
    <path v-else-if="name === 'check'" d="m4 12 5 5L20 6" />
    <path v-else-if="name === 'copy'" d="M8 8h12v12H8zM4 16V4h12" />
    <path
      v-else
      d="M9 19c-5 2-5-3-7-3m14 6v-4a3.5 3.5 0 0 0-1-2.7c3.4-.4 7-1.7 7-7.5A5.8 5.8 0 0 0 20.4 4a5.4 5.4 0 0 0-.1-3.8S19 0 16 1.6a13 13 0 0 0-8 0C5 0 3.7.2 3.7.2A5.4 5.4 0 0 0 3.6 4 5.8 5.8 0 0 0 2 8c0 5.8 3.6 7.1 7 7.5A3.5 3.5 0 0 0 8 18v4"
      transform="translate(1 1) scale(.9)"
    />
  </svg>
</template>

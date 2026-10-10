<!--
 * 用途：为章节标题声明可逐字入场的 Vue 节点，保留文字色彩和明确的标题语义。
 * 职责：按行与文字片段渲染字符（字符节点带 data-char，供描边字叠加填充层），每行附带一块矩形遮罩供转场扫过；提供完整读屏名称；默认可见，不创建或管理 GSAP 动画。
 * 关键导出：MotionHeading 默认组件，接收 lines 与可选 wipe（遮罩颜色，默认蓝色）；id、class 等属性透传至根 h2。
-->
<script setup lang="ts">
import { computed } from "vue";

type HeadingPart = {
  text: string;
  tone?: "blue" | "muted" | "outline";
};

const props = withDefaults(
  defineProps<{ lines: HeadingPart[][]; wipe?: "blue" | "yellow" | "ink" }>(),
  { wipe: "blue" },
);
const toneClasses = {
  blue: "blue-text",
  muted: "muted-heading",
  outline: "contact-outline",
};

// 读屏只读取完整标题，逐字符的可视节点不参与无障碍名称计算。
const accessibleTitle = computed(() =>
  props.lines.map((line) => line.map((part) => part.text).join("")).join(""),
);
</script>

<template>
  <h2
    class="motion-heading"
    :class="`motion-heading--wipe-${wipe}`"
    data-motion-heading
    :aria-label="accessibleTitle"
  >
    <span
      v-for="(line, lineIndex) in lines"
      :key="lineIndex"
      class="motion-heading__line"
      data-motion-line
      aria-hidden="true"
    >
      <span
        v-for="(part, partIndex) in line"
        :key="partIndex"
        :class="part.tone ? toneClasses[part.tone] : undefined"
      >
        <span
          v-for="(character, characterIndex) in Array.from(part.text)"
          :key="characterIndex"
          class="motion-heading__char"
          data-motion-char
          :data-char="character"
          >{{ character }}</span
        >
      </span>
      <span class="motion-heading__wipe" data-motion-wipe></span>
    </span>
  </h2>
</template>

<style scoped>
/* 行宽贴合文字，遮罩只覆盖实际字面；底部留白保留标点、描边和字形的下缘。 */
.motion-heading__line {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  overflow: clip;
  padding-bottom: 0.09em;
}

/* 字符保持行内排版，窄屏可在字符之间自然换行，无动画时无需恢复样式。 */
.motion-heading__char {
  display: inline-block;
  white-space: pre;
}

/* 遮罩默认收起；只有入场时间线把它从左侧展开、再向右侧收回。 */
.motion-heading__wipe {
  position: absolute;
  inset: 0 0 0.06em;
  background: var(--blue);
  transform: scaleX(0);
  transform-origin: 0 50%;
  pointer-events: none;
}

.motion-heading--wipe-yellow .motion-heading__wipe {
  background: var(--yellow);
}

.motion-heading--wipe-ink .motion-heading__wipe {
  background: var(--ink);
}
</style>

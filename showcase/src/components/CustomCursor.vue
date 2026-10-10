<!--
 * 用途：在桌面端提供跟随指针的黄色方块光标，悬停可打开的卡片时展开为文字标签。
 * 职责：仅在可悬停的精细鼠标且允许动态时启用；保留系统光标，进入原生弹窗（顶层渲染）或离开窗口时隐藏。
 * 关键导出：CustomCursor 默认组件，无属性与事件；标签文字取自目标元素的 data-cursor，卡片默认显示 OPEN。
-->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { gsap } from "gsap";

const query =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const cardSelector = ".repo-card, .article-card, a.media-card, .featured-panel__open";
const interactiveSelector = 'a, button, summary, [role="button"], [data-cursor]';

const cursor = ref<HTMLElement>();
const enabled = ref(false);
const label = ref("");
const hovering = ref(false);
const hidden = ref(true);
let preference: MediaQueryList | undefined;
let xTo: ((value: number) => void) | undefined;
let yTo: ((value: number) => void) | undefined;

function move(event: PointerEvent) {
  if (event.pointerType !== "mouse") {
    hidden.value = true;
    return;
  }
  hidden.value = false;
  xTo?.(event.clientX);
  yTo?.(event.clientY);
}

/** 根据指针下的元素切换形态；弹窗渲染在顶层，自定义光标无法盖在其上，因此直接隐藏。 */
function over(event: PointerEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("dialog")) {
    hidden.value = Boolean(target);
    label.value = "";
    hovering.value = false;
    return;
  }
  const labelled = target.closest<HTMLElement>("[data-cursor]");
  const card = target.closest(cardSelector);
  label.value = labelled?.dataset.cursor || (card ? "OPEN" : "");
  hovering.value = !label.value && Boolean(target.closest(interactiveSelector));
}

function leaveWindow() {
  hidden.value = true;
}

async function enable() {
  enabled.value = true;
  await nextTick();
  if (!cursor.value) return;
  gsap.set(cursor.value, { xPercent: -50, yPercent: -50 });
  xTo = gsap.quickTo(cursor.value, "x", { duration: 0.32, ease: "power3.out" });
  yTo = gsap.quickTo(cursor.value, "y", { duration: 0.32, ease: "power3.out" });
  window.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerover", over, { passive: true });
  document.documentElement.addEventListener("pointerleave", leaveWindow);
}

function disable() {
  window.removeEventListener("pointermove", move);
  document.removeEventListener("pointerover", over);
  document.documentElement.removeEventListener("pointerleave", leaveWindow);
  if (cursor.value) gsap.killTweensOf(cursor.value);
  xTo = undefined;
  yTo = undefined;
  enabled.value = false;
  hidden.value = true;
}

/** 设备或动态偏好切换时同步启停。 */
function sync() {
  if (preference?.matches && !enabled.value) void enable();
  else if (!preference?.matches && enabled.value) disable();
}

onMounted(() => {
  preference = window.matchMedia(query);
  preference.addEventListener("change", sync);
  sync();
});

onUnmounted(() => {
  preference?.removeEventListener("change", sync);
  disable();
});
</script>

<template>
  <div
    v-if="enabled"
    ref="cursor"
    class="custom-cursor"
    :class="{
      'has-label': Boolean(label),
      'is-hovering': hovering,
      'is-hidden': hidden,
    }"
    aria-hidden="true"
  >
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.custom-cursor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  width: 12px;
  height: 12px;
  background: var(--yellow);
  color: var(--ink);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgb(17 17 17 / 0.85);
  transition:
    width 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s;
}
.custom-cursor > span {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  opacity: 0;
  transition: opacity 0.15s;
}
.custom-cursor.is-hovering {
  width: 30px;
  height: 30px;
  background: transparent;
  box-shadow:
    0 0 0 2px var(--yellow),
    0 0 0 3px rgb(17 17 17 / 0.85);
}
.custom-cursor.has-label {
  width: 78px;
  height: 78px;
}
.custom-cursor.has-label > span {
  opacity: 1;
}
.custom-cursor.is-hidden {
  opacity: 0;
}
</style>

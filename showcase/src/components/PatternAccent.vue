<!-- 装饰图案组件：提供方块矩阵、斜条纹和点阵三种背景点缀；导出 PatternAccent，动效仅在可见且允许动态时播放。 -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import gsap from "gsap";

const props = withDefaults(
  defineProps<{
    variant: "matrix" | "stripes" | "dots";
    tone?: "blue" | "light" | "yellow";
  }>(),
  { tone: "blue" },
);

const root = ref<HTMLElement | null>(null);
const matrixHighlights = new Set([2, 9, 16, 22, 29]);
let media: gsap.MatchMedia | undefined;
let observer: IntersectionObserver | undefined;
let motion: gsap.core.Timeline | undefined;
let surface: HTMLElement | null = null;
let inViewport = false;
let mounted = false;

/** 离屏和后台标签页暂停同一条时间线，回来时接着播放，避免不可见装饰持续占用渲染。 */
function syncPlayback() {
  if (!motion || !surface) return;
  const shouldPlay = inViewport && !document.hidden;
  motion.paused(!shouldPlay);
  if (shouldPlay) surface.style.willChange = "transform";
  else surface.style.removeProperty("will-change");
}

/** matchMedia 管理动画的内联样式；切换减少动态偏好时自动还原为静态图案。 */
function setupMotion() {
  media?.revert();
  media = undefined;
  if (!root.value || !mounted) return;
  surface = root.value.querySelector<HTMLElement>(".pattern-accent__surface");
  media = gsap.matchMedia();
  media.add(
    "(prefers-reduced-motion: no-preference)",
    () => {
      const markers = root.value?.querySelectorAll<HTMLElement>(
        ".pattern-accent__marker",
      );
      motion = gsap.timeline({ paused: true, repeat: -1, yoyo: true });
      // 整块只漂移几个像素，少量标记缓慢改变透明度；不为每个格子建立动画或滚动触发器。
      motion.to(
        surface,
        { x: 4, y: -3, rotation: 0.7, duration: 8, ease: "sine.inOut" },
        0,
      );
      if (markers?.length) {
        motion.to(
          markers,
          { opacity: 0.72, duration: 3.6, stagger: 0.9, ease: "sine.inOut" },
          1,
        );
      }
      syncPlayback();
      return () => {
        motion = undefined;
        surface?.style.removeProperty("will-change");
      };
    },
    root.value,
  );
}

onMounted(() => {
  mounted = true;
  if (!root.value) return;
  observer = new IntersectionObserver(
    ([entry]) => {
      inViewport = entry?.isIntersecting ?? false;
      syncPlayback();
    },
    { threshold: 0 },
  );
  observer.observe(root.value);
  document.addEventListener("visibilitychange", syncPlayback);
  setupMotion();
});

watch(
  () => props.variant,
  async () => {
    // 图案可通过配置更换，等待 Vue 更新节点后清理旧目标并重新绑定。
    await nextTick();
    if (mounted) setupMotion();
  },
);

onUnmounted(() => {
  mounted = false;
  observer?.disconnect();
  document.removeEventListener("visibilitychange", syncPlayback);
  media?.revert();
  surface = null;
});
</script>

<template>
  <div
    ref="root"
    class="pattern-accent"
    :class="[`pattern-accent--${variant}`, `pattern-accent--${tone}`]"
    aria-hidden="true"
  >
    <div class="pattern-accent__surface">
      <template v-if="variant === 'matrix'">
        <span
          v-for="cell in 36"
          :key="cell"
          class="pattern-accent__cell"
          :class="{ 'pattern-accent__marker': matrixHighlights.has(cell) }"
        />
      </template>
      <template v-else-if="variant === 'dots'">
        <span
          v-for="dot in 3"
          :key="dot"
          class="pattern-accent__dot pattern-accent__marker"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.pattern-accent {
  width: var(--pattern-width, 170px);
  height: var(--pattern-height, 120px);
  position: var(--pattern-position, relative);
  flex-shrink: 0;
  color: var(--blue);
  pointer-events: none;
  user-select: none;
}

.pattern-accent--light {
  color: var(--white);
}

.pattern-accent--yellow {
  color: var(--yellow);
}

.pattern-accent__surface {
  position: absolute;
  inset: 0;
  transform-origin: center;
}

.pattern-accent--matrix .pattern-accent__surface {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 6px;
}

.pattern-accent__cell {
  display: block;
  border: 1px solid currentColor;
  opacity: 0.18;
}

.pattern-accent__cell.pattern-accent__marker {
  background: currentColor;
  opacity: 0.35;
}

.pattern-accent--stripes .pattern-accent__surface {
  opacity: 0.3;
  background: repeating-linear-gradient(
    135deg,
    currentColor 0 1px,
    transparent 1px 9px
  );
  clip-path: polygon(19% 0, 100% 0, 81% 100%, 0 100%);
}

.pattern-accent--dots .pattern-accent__surface {
  background-image: radial-gradient(currentColor 1.25px, transparent 1.5px);
  background-size: 14px 14px;
  background-position: center;
  opacity: 0.32;
}

.pattern-accent__dot {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
}

.pattern-accent__dot:nth-child(1) {
  top: 23%;
  left: 23%;
}

.pattern-accent__dot:nth-child(2) {
  top: 58%;
  left: 56%;
}

.pattern-accent__dot:nth-child(3) {
  top: 34%;
  left: 81%;
}
</style>

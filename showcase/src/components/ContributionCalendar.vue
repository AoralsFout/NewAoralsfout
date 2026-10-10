<!-- GitHub 贡献日历：呈现真实贡献总量、日期热图和文字明细，完整离开视口后可重复逐格点亮，并在偏好变化或卸载时还原样式。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ShowcaseContributions } from "../data/types";

const props = defineProps<{ contributions: ShowcaseContributions }>();
const root = ref<HTMLElement>();
// 用副本按日期排序，保证热图与逐格入场都沿时间推进，不改变公开数据。
const days = computed(() =>
  [...props.contributions.days].sort((a, b) => a.date.localeCompare(b.date)),
);
const recentDays = computed(() => days.value.slice(-28).reverse());
const dateRange = computed(
  () =>
    `${dateLabel(days.value[0]?.date || "")} — ${dateLabel(days.value.at(-1)?.date || "")}`,
);
const daySignature = computed(() =>
  days.value.map((day) => `${day.date}:${day.count}:${day.level}`).join("|"),
);
let context: gsap.Context | undefined;
let media: gsap.MatchMedia | undefined;
let mounted = false;
let generation = 0;
// 同一份数据在偏好切回时保留当前显示，离开后仍可重播。
let presentedSignature: string | null = null;
let preserveVisibleOnRebuild = false;

/** 贡献日期是日历日期，直接替换分隔符，避免时区换算改变所属日期。 */
function dateLabel(value: string) {
  return value ? value.replaceAll("-", ".") : "日期未知";
}

/** 每次重建先还原旧动画，避免旧格子或半途切换偏好时残留低透明度。 */
function clearMotion() {
  media?.revert();
  context?.revert();
  media = undefined;
  context = undefined;
}

/** 只读取热图整体的可视范围，不为每个日期创建监听。 */
function isVisible(heatmap: HTMLElement | undefined | null) {
  if (!heatmap) return false;
  const rect = heatmap.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight
    && rect.right > 0 && rect.left < window.innerWidth;
}

/** 等待真实日期节点更新后建立整组动画，异步重建仅保留最新一次。 */
async function rebuildMotion() {
  const current = ++generation;
  if (context) preserveVisibleOnRebuild ||= isVisible(root.value?.querySelector<HTMLElement>(".heatmap"));
  clearMotion();
  await nextTick();
  if (!mounted || current !== generation || !root.value) return;
  const signature = daySignature.value;

  context = gsap.context(() => {
    media = gsap.matchMedia();
    media.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (preference) => {
        // 减少动态时还原后的格子全部可见；普通偏好切回后只在离开再进时重播。
        if (preference.conditions?.reduced) {
          presentedSignature = signature;
          return;
        }
        const heatmap = root.value?.querySelector<HTMLElement>(".heatmap");
        const cells = Array.from(
          heatmap?.querySelectorAll<HTMLElement>(":scope > span") ?? [],
        );
        if (!heatmap || !cells.length) return;

        // 仅正在入场的格子临时提升合成，不让整年数百格永久占用合成层。
        const originalWillChange = new Map(
          cells.map((cell) => [cell, cell.style.getPropertyValue("will-change")]),
        );
        const restoreWillChange = (cell: HTMLElement) => {
          const original = originalWillChange.get(cell);
          if (original) cell.style.setProperty("will-change", original);
          else cell.style.removeProperty("will-change");
        };

        let started = false;
        let done = false;
        let inside = isVisible(heatmap);
        let entryReady = false;
        const tween = gsap.fromTo(
          cells,
          { opacity: 0.16, scale: 0.58, transformOrigin: "50% 50%" },
          {
            opacity: 1,
            scale: 1,
            duration: 0.34,
            ease: "power2.out",
            force3D: false,
            paused: true,
            immediateRender: true,
            stagger: {
              amount: 1.5,
              from: "start",
              onStart(this: gsap.core.Tween) {
                const cell = this.targets()[0] as HTMLElement;
                cell.style.setProperty("will-change", "transform, opacity");
              },
              onComplete(this: gsap.core.Tween) {
                restoreWillChange(this.targets()[0] as HTMLElement);
              },
            },
            clearProps: "opacity,transform,transformOrigin",
            onComplete: () => {
              done = true;
              presentedSignature = signature;
            },
          },
        );

        /** 当前停留只播一遍，重新进入时复用同一组 tween，不增加日期监听。 */
        const play = () => {
          if (!inside || !entryReady || started || done) return;
          started = true;
          tween.restart(true);
        };
        const reset = () => {
          if (!started && !done) return;
          // clearProps 已清理终态内联样式，回到零点会再次施加低透明度和缩放初态。
          tween.pause(0, true);
          started = false;
          done = false;
          cells.forEach(restoreWillChange);
        };

        // 数据刷新或偏好切换不会立即调暗正在阅读的日历；完全离开后再复位。
        if (inside && (presentedSignature === signature || preserveVisibleOnRebuild)) {
          started = true;
          tween.progress(1).pause();
          cells.forEach(restoreWillChange);
        } else if (heatmap.getBoundingClientRect().bottom <= 0) {
          started = true;
          tween.progress(1).pause();
        }
        preserveVisibleOnRebuild = false;

        const visibilityObserver = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          inside = entry.isIntersecting;
          if (!inside) reset();
          else play();
        }, { threshold: 0 });
        const entryObserver = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          entryReady = entry.isIntersecting && entry.intersectionRatio >= 0.01;
          play();
        }, { rootMargin: "0px 0px -18% 0px", threshold: 0.01 });
        visibilityObserver.observe(heatmap);
        entryObserver.observe(heatmap);

        // matchMedia 跟踪动画，两级整体观察和手动设置的性能提示在重建时一并释放。
        return () => {
          presentedSignature = signature;
          visibilityObserver.disconnect();
          entryObserver.disconnect();
          cells.forEach(restoreWillChange);
        };
      },
      root.value,
    );
  }, root.value);
  ScrollTrigger.refresh();
}

onMounted(() => {
  mounted = true;
  void rebuildMotion();
});
watch(daySignature, () => void rebuildMotion(), { flush: "post" });
onUnmounted(() => {
  mounted = false;
  generation++;
  clearMotion();
});
</script>

<template>
  <div ref="root" class="contribution-calendar">
    <div class="contribution-summary">
      <strong>{{ contributions.total.toLocaleString() }}</strong>
      <span>次 GitHub 贡献<br /><small>{{ dateRange }}</small></span>
    </div>
    <div class="heatmap-scroll">
      <div
        class="heatmap"
        role="img"
        :aria-label="
          'GitHub 贡献日历，' +
          dateRange +
          '，共 ' +
          contributions.total +
          ' 次贡献，' +
          contributions.activeWeeks +
          ' 个活跃周。可展开下方日期明细。'
        "
      >
        <span
          v-for="(day, index) in days"
          :key="day.date || index"
          :data-level="day.level"
          :title="dateLabel(day.date) + '：' + day.count + ' 次贡献'"
        ></span>
      </div>
    </div>
    <div class="heatmap-foot mono">
      <span>{{ contributions.activeWeeks }} ACTIVE WEEKS</span>
      <span class="heatmap-legend">
        少<i
          v-for="level in [0, 1, 2, 3, 4]"
          :key="level"
          :data-level="level"
        ></i>多
      </span>
    </div>
    <details class="contribution-details">
      <summary>查看最近 28 天贡献明细</summary>
      <div class="day-list">
        <span v-for="(day, index) in recentDays" :key="day.date || index">
          {{ dateLabel(day.date) }}<b>{{ day.count }} 次</b>
        </span>
      </div>
    </details>
  </div>
</template>

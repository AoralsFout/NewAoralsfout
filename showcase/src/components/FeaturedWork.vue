<!--
 * 用途：把最前面的几个置顶仓库做成整屏的精选作品场景，以超大编号和裁切标题呈现。
 * 职责：
 *   - 桌面且允许动态时固定舞台，滚动推动矩形遮罩自下而上逐个揭开下一件作品，标题与编号随之错位进出；
 *   - 窄屏或减少动态偏好下退化为纵向排列的整幅色块，内容完整可读；
 *   - 键盘焦点进入被遮住的作品时滚动到对应位置，保证焦点内容可见；
 *   - 只展示公开仓库已有的名称、介绍、语言和 Star，不补充虚构内容。
 * 关键导出：FeaturedWork 默认组件；接收 projects（建议不超过 3 个），触发 open 事件并携带被选中的仓库。
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AppIcon from "./AppIcon.vue";
import type { ShowcaseProject } from "../data/types";

const props = defineProps<{ projects: ShowcaseProject[] }>();
const emit = defineEmits<{ open: [project: ShowcaseProject] }>();

const tones = ["blue", "ink", "yellow"] as const;
const root = ref<HTMLElement>();
const active = ref(0);
const scene = ref(false);
const signature = computed(() => props.projects.map((item) => item.slug).join("|"));
let media: gsap.MatchMedia | undefined;
let trigger: ScrollTrigger | undefined;

/**
 * 按最长的单词决定字号：仓库名只在连字符、下划线或空格处换行，最长的一段恰好贴满舞台宽度。
 * 宽体 Archivo 每个字符约 0.86em，可用宽度约为 92vw；极长的名称以 56px 为下限，超出部分由色块裁切。
 */
function titleSize(title: string) {
  const longest = Math.max(
    4,
    ...title.split(/[\s_-]+/).map((part) => Array.from(part).length),
  );
  return `clamp(56px, ${Math.min(15, 92 / (longest * 0.86)).toFixed(2)}vw, 260px)`;
}

/** 固定场景中每件作品占同样长度的滚动距离；焦点进入时跳到该作品完全揭开的位置。 */
function revealFocused(event: FocusEvent) {
  if (!trigger || !(event.target instanceof Element)) return;
  const panel = event.target.closest<HTMLElement>(".featured-panel");
  const index = Number(panel?.dataset.index ?? -1);
  if (index < 0 || props.projects.length < 2) return;
  const position =
    trigger.start + ((trigger.end - trigger.start) * index) / (props.projects.length - 1);
  if (Math.abs(window.scrollY - position) > 4) window.scrollTo({ top: position, behavior: "auto" });
}

async function build() {
  media?.revert();
  trigger = undefined;
  scene.value = false;
  active.value = 0;
  await nextTick();
  const stage = root.value?.querySelector<HTMLElement>(".featured-work__stage");
  if (!root.value || !stage || props.projects.length < 2) return;
  media = gsap.matchMedia();
  media.add(
    "(prefers-reduced-motion: no-preference) and (min-width: 900px)",
    () => {
      scene.value = true;
      const panels = gsap.utils.toArray<HTMLElement>(".featured-panel", root.value);
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        // 固定内层舞台而不是带负外边距的外层，避免固定间距按内容宽度测量后两侧留白。
        scrollTrigger: {
          trigger: stage,
          start: "top top+=88",
          end: () => `+=${(panels.length - 1) * window.innerHeight}`,
          pin: true,
          scrub: 0.7,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            active.value = Math.round(self.progress * (panels.length - 1));
          },
        },
      });
      panels.slice(1).forEach((panel, offset) => {
        const previous = panels[offset];
        timeline
          .fromTo(panel, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1, ease: "power2.inOut" }, offset)
          .fromTo(panel.querySelector(".featured-panel__title"), { xPercent: 18 }, { xPercent: 0, duration: 1, ease: "power3.out" }, offset)
          .fromTo(panel.querySelector(".featured-panel__index"), { yPercent: 40 }, { yPercent: 0, duration: 1, ease: "power3.out" }, offset)
          .to(previous.querySelector(".featured-panel__title"), { xPercent: -14, duration: 1 }, offset)
          .to(previous.querySelector(".featured-panel__index"), { yPercent: -30, duration: 1 }, offset);
      });
      trigger = timeline.scrollTrigger;
      return () => {
        scene.value = false;
        trigger = undefined;
      };
    },
    root.value,
  );
  ScrollTrigger.refresh();
}

onMounted(() => void build());
watch(signature, () => void build(), { flush: "post" });
onUnmounted(() => media?.revert());
</script>

<template>
  <div
    ref="root"
    class="featured-work"
    :class="{ 'is-scene': scene }"
    @focusin="revealFocused"
  >
    <div class="featured-work__stage">
      <article
        v-for="(project, index) in projects"
        :key="project.slug"
        class="featured-panel"
        :class="`featured-panel--${tones[index % tones.length]}`"
        :data-index="index"
        :aria-labelledby="`featured-${project.slug}`"
      >
        <span class="featured-panel__index" aria-hidden="true">{{
          String(index + 1).padStart(2, "0")
        }}</span>
        <div class="featured-panel__meta mono">
          <span>FEATURED / {{ String(index + 1).padStart(2, "0") }}</span>
          <span>{{ project.language || project.category }}</span>
          <span v-if="project.stars !== undefined">☆ {{ project.stars }}</span>
        </div>
        <h3
          :id="`featured-${project.slug}`"
          class="featured-panel__title"
          :style="{ fontSize: titleSize(project.title) }"
        >
          {{ project.title }}
        </h3>
        <div class="featured-panel__foot">
          <p>{{ project.description || "这个仓库暂时没有填写介绍。" }}</p>
          <button
            class="featured-panel__open"
            data-cursor="VIEW"
            @click="emit('open', project)"
          >
            查看项目<span class="featured-panel__open-icon"><AppIcon :size="22" /></span>
          </button>
        </div>
      </article>
      <div v-if="scene" class="featured-work__progress mono" aria-hidden="true">
        <span>{{ String(active + 1).padStart(2, "0") }}</span>
        <i
          ><b :style="{ transform: `scaleX(${(active + 1) / projects.length})` }"></b
        ></i>
        <span>{{ String(projects.length).padStart(2, "0") }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 默认纵向排列的整幅色块；进入固定场景后叠放在同一舞台，由遮罩依次揭开。 */
.featured-work {
  position: relative;
  margin: 0 calc(var(--gutter) * -1) 72px;
}
.featured-work__stage {
  position: relative;
}
.is-scene .featured-work__stage {
  height: calc(100svh - 88px);
  overflow: clip;
}
.featured-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: min(82svh, 760px);
  padding: clamp(28px, 4vw, 60px) var(--gutter);
  overflow: clip;
}
.is-scene .featured-panel {
  position: absolute;
  inset: 0;
  min-height: 0;
}
.featured-panel--blue {
  background: var(--blue);
  color: var(--white);
}
.featured-panel--ink {
  background: var(--ink);
  color: var(--white);
}
.featured-panel--yellow {
  background: var(--yellow);
  color: var(--ink);
}
/* 描边编号占据标题上方的留白，与底部标题形成上下对角。 */
.featured-panel__index {
  position: absolute;
  right: calc(var(--gutter) - 0.04em);
  top: clamp(70px, 9vh, 120px);
  font-family: var(--display);
  font-size: clamp(200px, min(34vw, 52vh), 620px);
  font-weight: 900;
  font-stretch: 62%;
  line-height: 0.8;
  letter-spacing: -0.06em;
  color: transparent;
  -webkit-text-stroke: 2px currentColor;
  opacity: 0.55;
  pointer-events: none;
  user-select: none;
}
.featured-panel--blue .featured-panel__index {
  -webkit-text-stroke-color: var(--yellow);
}
.featured-panel--ink .featured-panel__index {
  -webkit-text-stroke-color: var(--blue);
  opacity: 0.9;
}
.featured-panel__meta {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 32px;
  font-size: 11px;
  letter-spacing: 0.12em;
}
.featured-panel__title {
  position: relative;
  margin: auto 0 0;
  padding-top: 40px;
  font-family: var(--display);
  font-weight: 900;
  font-stretch: 118%;
  line-height: 0.86;
  letter-spacing: -0.055em;
  /* 只在连字符等自然断点换行；标题允许贴边越出右侧，保留首字母完整。 */
  margin-right: calc(var(--gutter) * -1);
}
.featured-panel__foot {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-top: clamp(24px, 3vw, 44px);
  padding-top: 22px;
  border-top: 1px solid currentColor;
}
.featured-panel__foot p {
  max-width: 520px;
  font-size: 15px;
  line-height: 1.8;
  opacity: 0.88;
}
.featured-panel__open {
  display: inline-flex;
  align-items: center;
  gap: 20px;
  min-height: 52px;
  padding: 6px 6px 6px 22px;
  flex-shrink: 0;
  background: var(--white);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.featured-panel__open-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  background: var(--yellow);
  transition: transform 0.25s;
}
.featured-panel__open:hover .featured-panel__open-icon {
  transform: rotate(45deg);
}
.featured-panel--yellow .featured-panel__open {
  background: var(--ink);
  color: var(--white);
}
.featured-panel--yellow .featured-panel__open-icon {
  background: var(--blue);
}
.featured-panel :focus-visible {
  outline-color: var(--yellow);
}
.featured-panel--yellow :focus-visible {
  outline-color: var(--blue);
}
.featured-work__progress {
  position: absolute;
  left: var(--gutter);
  top: clamp(28px, 4vw, 60px);
  z-index: 2;
  display: none;
}
/* 场景进度条与元信息同排，固定在舞台右上角，配色随当前作品反白。 */
.is-scene .featured-work__progress {
  display: flex;
  align-items: center;
  gap: 12px;
  left: auto;
  right: var(--gutter);
  color: var(--white);
  mix-blend-mode: difference;
  font-size: 11px;
}
.featured-work__progress i {
  position: relative;
  width: 90px;
  height: 2px;
  background: rgb(255 255 255 / 0.3);
}
.featured-work__progress b {
  position: absolute;
  inset: 0;
  background: currentColor;
  transform-origin: 0 50%;
  transition: transform 0.3s;
}
@media (max-width: 767px) {
  .featured-work {
    margin-bottom: 48px;
  }
  .featured-panel {
    min-height: 520px;
  }
  .featured-panel__title {
    margin-right: 0;
  }
  .featured-panel__foot {
    flex-direction: column;
    align-items: flex-start;
  }
  .featured-panel__foot p {
    font-size: 13px;
  }
}
</style>

<!--
 * 用途：首页舞台，以撑满屏宽的姓名与三维结形雕塑完成一次完整的文字亮相，并把滚动转成穿过结心的转场。
 * 职责：
 *   - 姓名分前后两层：后层完整显示，前层只保留少数字母，让雕塑在字母之间前后穿插；
 *   - 按舞台宽高为两行姓名分别计算字号，字体加载后重新贴边；
 *   - 每个会话首次进入时播放开场：白幕中线生长、上下分开，错位字母吸附归位；
 *   - 桌面且允许动态时固定首屏，滚动推动姓名撕开、相机穿过结心、白色矩形从中心铺满后接入下一章；
 *   - 向父级报告页头当前是否压在蓝色舞台上。
 * 关键导出：HeroStage 默认组件；接收 firstSection（首个展区锚点），触发 tone 事件（true 表示页头位于舞台上）。
-->
<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, onUnmounted, ref } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AppIcon from "./AppIcon.vue";
import { vMagnetic } from "../directives/magnetic";

// 三维装置延迟加载，文字、导航和公开数据不依赖 WebGL 初始化。
const HeroSculpture = defineAsyncComponent(() => import("./HeroSculpture.vue"));

defineProps<{ firstSection: string }>();
const emit = defineEmits<{ tone: [onStage: boolean] }>();

const INTRO_KEY = "aoralsfout:intro-played";
const HEADER_HEIGHT = 88;
const lines = [Array.from("AORALS"), Array.from("FOUT.")];
// 前层只保留靠近雕塑中心的字母，其余字母被雕塑遮挡，形成前后穿插。
const frontLetters = new Set(["0-3", "1-2"]);

const root = ref<HTMLElement>();
const progress = ref(0);
const introActive = ref(shouldPlayIntro());
let media: gsap.MatchMedia | undefined;
let intro: gsap.core.Timeline | undefined;
let resizeObserver: ResizeObserver | undefined;
let toneFrame = 0;
let lastTone: boolean | undefined;
let disposed = false;

/** 只在首次访问、允许动态且没有直接跳到其他展区时播放；存储不可用时照常播放。 */
function shouldPlayIntro() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (location.hash && location.hash !== "#home") return false;
  try {
    return sessionStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberIntro() {
  try {
    sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // 隐私模式等环境禁止存储时，下次进入仍播放开场，不影响页面。
  }
}

/**
 * 两行姓名各自贴满可用宽度；总高度超出舞台预算时按比例同时缩小。
 * 测量使用 offsetWidth，不受滚动场景中的位移和横向拉伸影响。
 */
function fitName() {
  const stage = root.value?.querySelector<HTMLElement>(".hero-stage");
  const name = root.value?.querySelector<HTMLElement>(".hero-name--back");
  if (!stage || !name || !root.value) return;
  const available = name.clientWidth;
  const portrait = stage.clientHeight > stage.clientWidth;
  const heightBudget = stage.clientHeight * (portrait ? 0.34 : 0.6);
  const measured = Array.from(
    name.querySelectorAll<HTMLElement>(".hero-name-line"),
  ).map((line) => {
    const size = parseFloat(getComputedStyle(line).fontSize) || 100;
    return line.offsetWidth ? (size * available) / line.offsetWidth : size;
  });
  // 行高为 0.8em，两行总高度按字号之和估算。
  const total = measured.reduce((sum, size) => sum + size * 0.8, 0);
  const scale = total > heightBudget ? heightBudget / total : 1;
  measured.forEach((size, index) => {
    root.value?.style.setProperty(
      `--hero-line-${index}`,
      `${Math.floor(size * scale * 100) / 100}px`,
    );
  });
}

/** 页头压在舞台上时使用反白样式；固定场景后段白色矩形铺开后切回常规样式。 */
function updateTone() {
  toneFrame = 0;
  const rect = root.value?.getBoundingClientRect();
  const onStage = Boolean(rect && rect.bottom > HEADER_HEIGHT && progress.value < 0.84);
  if (onStage === lastTone) return;
  lastTone = onStage;
  emit("tone", onStage);
}
function requestTone() {
  if (!toneFrame) toneFrame = requestAnimationFrame(updateTone);
}

/** 同一字母在前后两层使用相同的随机错位和延迟，归位过程中两层始终重合。 */
function letterPlan() {
  const keys = lines.flatMap((line, lineIndex) =>
    line.map((_, letterIndex) => `${lineIndex}-${letterIndex}`),
  );
  const order = gsap.utils.shuffle([...keys]);
  const columns = [-140, -80, 80, 140];
  const rows = [-70, 0, 70];
  return new Map(
    keys.map((key) => [
      key,
      {
        x: gsap.utils.random(columns),
        y: gsap.utils.random(rows),
        delay: order.indexOf(key) * 0.035,
      },
    ]),
  );
}

/** 开场时间线：等待字体（最多 1.2 秒）期间白幕中线生长，随后白幕从中线上下分开，字母吸附归位。 */
async function playIntro() {
  const page = root.value;
  const veil = document.querySelector<HTMLElement>(".intro-veil");
  if (!page || !veil) {
    introActive.value = false;
    return;
  }
  const line = veil.querySelector<HTMLElement>(".intro-veil__line");
  const halves = veil.querySelectorAll<HTMLElement>(".intro-veil__half");
  const mark = veil.querySelector<HTMLElement>(".intro-veil__mark");
  const letters = Array.from(page.querySelectorAll<HTMLElement>(".hero-letter"));
  const plan = letterPlan();
  const pick = (target: Element, field: "x" | "y" | "delay") =>
    plan.get((target as HTMLElement).dataset.letter ?? "")?.[field] ?? 0;
  gsap.set(letters, {
    xPercent: (_: number, target: Element) => pick(target, "x"),
    yPercent: (_: number, target: Element) => pick(target, "y"),
    opacity: 0,
  });
  gsap.set(".hero-sculpture-stage, .hero-intro, .hero-scroll", { opacity: 0 });
  const waiting = gsap.to(line, { scaleX: 0.55, duration: 1.2, ease: "power2.out" });
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
  if (disposed) return;
  fitName();
  waiting.kill();
  rememberIntro();

  intro = gsap.timeline({
    onComplete: finishIntro,
  });
  intro
    .to(line, { scaleX: 1, duration: 0.35, ease: "power3.inOut" })
    // 上下两半沿中线分开；中线和标记随即淡出，露出下方的蓝色舞台。
    .to(halves, {
      yPercent: (index: number) => (index ? 100 : -100),
      duration: 0.9,
      ease: "expo.inOut",
    })
    .to([line, mark], { opacity: 0, duration: 0.25 }, "<0.1")
    .to(letters, {
      opacity: 1,
      duration: 0.12,
      delay: (_: number, target: Element) => pick(target, "delay"),
    }, "<0.2")
    .to(letters, {
      xPercent: 0,
      yPercent: 0,
      duration: 0.95,
      ease: "expo.out",
      delay: (_: number, target: Element) => pick(target, "delay"),
    }, "<")
    .fromTo(".hero-sculpture-stage",
      { opacity: 0, scale: 0.86 },
      { opacity: 1, scale: 1, duration: 1.2, ease: "power3.out" }, "<0.25")
    .fromTo([".hero-intro", ".hero-scroll"],
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.1 }, "<0.35");
}

/** 结束或跳过开场：清除内联样式并移除白幕；键盘焦点进入页面时立即跳到终点。 */
function finishIntro() {
  intro?.progress(1).kill();
  intro = undefined;
  gsap.set(".hero-letter, .hero-sculpture-stage, .hero-intro, .hero-scroll", {
    clearProps: "opacity,transform",
  });
  introActive.value = false;
  document.removeEventListener("focusin", finishIntro);
}

/** 固定首屏的滚动场景；时间线总长为 1，便于按滚动进度安排各段。 */
function buildScene() {
  media = gsap.matchMedia();
  media.add(
    {
      scene: "(prefers-reduced-motion: no-preference) and (min-width: 768px)",
      compact: "(prefers-reduced-motion: no-preference) and (max-width: 767px)",
    },
    (context) => {
      if (context.conditions?.compact) {
        // 窄屏不固定首屏，只保留姓名的轻微视差。
        gsap.to(".hero-name-line", {
          yPercent: -18,
          ease: "none",
          scrollTrigger: { trigger: root.value, start: "top top", end: "bottom top", scrub: 0.6 },
        });
        return;
      }
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root.value,
          start: "top top",
          end: "+=150%",
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          // 首屏位于最上方，先于其他展区计算位置，避免下方触发器被固定间距错位。
          refreshPriority: 10,
          onUpdate: (self) => {
            progress.value = self.progress;
            requestTone();
          },
        },
      });
      timeline
        .to('[data-line="0"]', { xPercent: -42, scaleX: 1.4, transformOrigin: "100% 50%", ease: "power2.in", duration: 0.5 }, 0)
        .to('[data-line="1"]', { xPercent: 42, scaleX: 1.4, transformOrigin: "0% 50%", ease: "power2.in", duration: 0.5 }, 0)
        .to([".hero-intro", ".hero-scroll"], { opacity: 0, y: -40, duration: 0.18 }, 0)
        .to(".hero-name", { opacity: 0, duration: 0.12 }, 0.42)
        .fromTo(".hero-portal",
          { clipPath: "inset(50% 50% 50% 50%)" },
          { clipPath: "inset(0% 0% 0% 0%)", duration: 0.18, ease: "power3.inOut" }, 0.82);
      return () => {
        progress.value = 0;
        requestTone();
      };
    },
    root.value,
  );
}

onMounted(async () => {
  if (!root.value) return;
  fitName();
  resizeObserver = new ResizeObserver(() => fitName());
  resizeObserver.observe(root.value);
  document.fonts?.ready.then(() => {
    if (!disposed) fitName();
  });
  window.addEventListener("scroll", requestTone, { passive: true });
  updateTone();
  if (introActive.value) {
    document.addEventListener("focusin", finishIntro);
    await nextTick();
    void playIntro();
  }
  buildScene();
  ScrollTrigger.refresh();
});

onUnmounted(() => {
  disposed = true;
  intro?.kill();
  media?.revert();
  resizeObserver?.disconnect();
  cancelAnimationFrame(toneFrame);
  window.removeEventListener("scroll", requestTone);
  document.removeEventListener("focusin", finishIntro);
});
</script>

<template>
  <section id="home" ref="root" class="hero textured-section" aria-labelledby="hero-title">
    <div class="hero-stage">
      <h1 id="hero-title" class="hero-name hero-name--back" aria-label="AoralsFout">
        <span
          v-for="(line, lineIndex) in lines"
          :key="lineIndex"
          class="hero-name-line"
          :data-line="lineIndex"
          aria-hidden="true"
          ><span
            v-for="(letter, letterIndex) in line"
            :key="letterIndex"
            class="hero-letter"
            :class="{ 'name-period': letter === '.' }"
            :data-letter="`${lineIndex}-${letterIndex}`"
            >{{ letter }}</span
          ></span
        >
      </h1>
      <div class="hero-sculpture-stage">
        <HeroSculpture :progress="progress" />
      </div>
      <div class="hero-name hero-name--front" aria-hidden="true">
        <span
          v-for="(line, lineIndex) in lines"
          :key="lineIndex"
          class="hero-name-line"
          :data-line="lineIndex"
          ><span
            v-for="(letter, letterIndex) in line"
            :key="letterIndex"
            class="hero-letter"
            :class="{
              'name-period': letter === '.',
              'is-front': frontLetters.has(`${lineIndex}-${letterIndex}`),
            }"
            :data-letter="`${lineIndex}-${letterIndex}`"
            >{{ letter }}</span
          ></span
        >
      </div>
      <div class="hero-intro">
        <span class="hero-intro-label mono">HELLO, I'M AORALSFOUT.</span>
        <p>
          代码里的一点想法，<br />和屏幕之外的<span class="yellow-underline">日常。</span>
        </p>
        <a v-magnetic :href="'#' + firstSection" class="hero-cta" data-cursor="GO"
          >逛逛我的小世界<AppIcon :size="19"
        /></a>
      </div>
      <a class="hero-scroll mono" :href="'#' + firstSection"
        >SCROLL TO EXPLORE<AppIcon name="down" :size="15"
      /></a>
      <div class="hero-portal" aria-hidden="true"></div>
    </div>
    <Teleport to="body">
      <div v-if="introActive" class="intro-veil" aria-hidden="true">
        <span class="intro-veil__half"></span>
        <span class="intro-veil__half"></span>
        <span class="intro-veil__line"></span>
        <span class="intro-veil__mark mono">AF / PERSONAL DIGITAL EXHIBITION</span>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* 舞台占满一屏，页头悬浮其上；姓名、雕塑与介绍都相对舞台绝对定位。 */
.hero {
  color: var(--white);
  background: var(--blue);
  overflow: clip;
  position: relative;
}
.hero-stage {
  position: relative;
  height: 100svh;
  min-height: 560px;
  max-height: 1400px;
  overflow: clip;
}
.hero-name {
  position: absolute;
  left: var(--gutter);
  right: var(--gutter);
  top: max(112px, 13%);
  margin: 0;
  font-family: var(--display);
  font-weight: 900;
  font-stretch: 125%;
  line-height: 0.8;
  letter-spacing: -0.045em;
  pointer-events: none;
  user-select: none;
}
.hero-name--back {
  z-index: 1;
}
.hero-name--front {
  z-index: 3;
}
.hero-name-line {
  display: block;
  width: max-content;
  white-space: nowrap;
  will-change: transform;
}
.hero-name-line[data-line="0"] {
  font-size: var(--hero-line-0, 18vw);
}
.hero-name-line[data-line="1"] {
  font-size: var(--hero-line-1, 24vw);
  /* 第二行右对齐到舞台边缘，与首行形成左右错位。 */
  margin-left: auto;
}
.hero-letter {
  display: inline-block;
}
.hero-name--front .hero-letter:not(.is-front) {
  visibility: hidden;
}
.name-period {
  color: var(--yellow);
}
.hero-sculpture-stage {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.hero-intro {
  position: absolute;
  left: var(--gutter);
  bottom: clamp(32px, 6vh, 64px);
  z-index: 4;
  width: min(360px, 100% - 2 * var(--gutter));
}
.hero-intro-label {
  font-size: 10px;
  letter-spacing: 0.12em;
}
.hero-intro p {
  font-size: clamp(19px, 1.6vw, 26px);
  line-height: 1.6;
  margin: 12px 0 22px;
  letter-spacing: -0.02em;
}
.yellow-underline {
  text-decoration: underline;
  text-decoration-color: var(--yellow);
  text-decoration-thickness: 3px;
  text-underline-offset: 7px;
}
.hero-cta {
  display: inline-flex;
  gap: 34px;
  padding: 13px 20px;
  min-height: 48px;
  background: var(--yellow);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  align-items: center;
  transition: gap 0.2s;
}
.hero-cta:hover {
  gap: 46px;
}
.hero-scroll {
  position: absolute;
  right: var(--gutter);
  bottom: clamp(32px, 6vh, 64px);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  font-size: 10px;
  letter-spacing: 0.12em;
}
/* 转场矩形：固定场景末段从中心展开，颜色与下一章底色一致。 */
.hero-portal {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: var(--white);
  clip-path: inset(50% 50% 50% 50%);
  pointer-events: none;
}
@media (max-width: 767px) {
  .hero-stage {
    min-height: 600px;
  }
  .hero-name {
    top: 104px;
  }
  .hero-intro {
    bottom: 76px;
  }
  .hero-scroll {
    left: var(--gutter);
    right: auto;
    bottom: 20px;
  }
}
@media (max-height: 640px) and (min-width: 768px) {
  .hero-intro p {
    font-size: 17px;
    margin: 8px 0 14px;
  }
}
</style>

<style>
/* 开场白幕挂在 body 下，覆盖页头；不接收指针，结束后移除。 */
.intro-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: clip;
  pointer-events: none;
}
/* 白幕分成上下两半，各自带网格，分开时网格保持与视口对齐。 */
.intro-veil__half {
  position: absolute;
  left: 0;
  right: 0;
  height: 50%;
  background:
    linear-gradient(rgb(17 17 17 / 0.06) 1px, transparent 1px) 0 0 / 64px 64px,
    linear-gradient(90deg, rgb(17 17 17 / 0.06) 1px, transparent 1px) 0 0 / 64px 64px,
    var(--white);
}
.intro-veil__half:first-child {
  top: 0;
  background-position: 0 0;
}
.intro-veil__half:nth-child(2) {
  bottom: 0;
  background-position: 0 50vh;
}
.intro-veil__line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  background: var(--blue);
  transform: scaleX(0);
}
.intro-veil__mark {
  position: absolute;
  left: var(--gutter);
  top: calc(50% + 14px);
  color: var(--ink);
  font-size: 10px;
  letter-spacing: 0.14em;
}
</style>

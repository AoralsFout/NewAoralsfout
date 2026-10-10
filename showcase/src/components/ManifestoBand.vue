<!--
 * 用途：在文字区与日常区之间放置全站的视觉高潮：两条方向相反、交叉倾斜的蓝黄跑马条。
 * 职责：用 gsap.ticker 驱动无缝循环，速度与倾斜随页面滚动速度变化；离开视口或切到后台时停止，减少动态偏好下保持静止。
 * 关键导出：ManifestoBand 默认组件，无属性与事件；整体为装饰，对读屏隐藏。
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const root = ref<HTMLElement>();
const bands = [
  { tone: "blue", words: ["STAY CURIOUS.", "保持好奇", "BUILD THINGS.", "持续创造"] },
  { tone: "yellow", words: ["ENJOY THE EVERYDAY.", "认真生活", "KEEP EXPLORING.", "写下过程"] },
];
let media: gsap.MatchMedia | undefined;

onMounted(() => {
  if (!root.value) return;
  media = gsap.matchMedia();
  media.add(
    "(prefers-reduced-motion: no-preference)",
    () => {
      const tracks = gsap.utils.toArray<HTMLElement>(".manifesto__track", root.value);
      // 轨道内容重复两份，位移在 -50%–0 之间回绕即可无缝衔接。
      const wrap = gsap.utils.wrap(-50, 0);
      const positions: number[] = tracks.map((_, index) => (index ? -50 : 0));
      const skewTo = tracks.map((track) =>
        gsap.quickTo(track, "skewX", { duration: 0.5, ease: "power3.out" }),
      );
      let velocity = 0;
      let active = false;
      /** 基础速度每秒 2.2%，滚动越快推进越快；向上滚动时两条同时反向。 */
      const tick = (_time: number, deltaTime: number) => {
        const seconds = Math.min(deltaTime, 50) / 1000;
        const boost = gsap.utils.clamp(0, 14, Math.abs(velocity) / 320);
        const direction = velocity < -40 ? -1 : 1;
        tracks.forEach((track, index) => {
          const sign = index ? 1 : -1;
          positions[index] = wrap(
            positions[index] + sign * direction * (2.2 + boost) * seconds,
          );
          gsap.set(track, { xPercent: positions[index] });
        });
        velocity *= 0.92;
      };
      const start = () => {
        if (active || document.hidden) return;
        active = true;
        gsap.ticker.add(tick);
      };
      const stop = () => {
        active = false;
        gsap.ticker.remove(tick);
      };
      const trigger = ScrollTrigger.create({
        trigger: root.value,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => (self.isActive ? start() : stop()),
        onUpdate: (self) => {
          velocity = self.getVelocity();
          const skew = gsap.utils.clamp(-10, 10, velocity / -260);
          skewTo.forEach((to, index) => to(index ? -skew : skew));
        },
      });
      const onVisibility = () => {
        if (document.hidden) stop();
        else if (trigger.isActive) start();
      };
      if (trigger.isActive) start();
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        stop();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    root.value,
  );
});

onUnmounted(() => media?.revert());
</script>

<template>
  <div ref="root" class="manifesto" aria-hidden="true">
    <div
      v-for="band in bands"
      :key="band.tone"
      class="manifesto__band"
      :class="`manifesto__band--${band.tone}`"
    >
      <div class="manifesto__track">
        <template v-for="copy in 2" :key="copy">
          <template v-for="word in band.words" :key="copy + word">
            <span class="manifesto__word">{{ word }}</span
            ><span class="manifesto__star">✳</span>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 两条跑马条分别向相反方向倾斜并交叉重叠，外层裁切倾斜后露出的边角。 */
.manifesto {
  position: relative;
  overflow: clip;
  padding: clamp(60px, 9vw, 140px) 0;
  background: var(--ink);
}
.manifesto__band {
  width: 112vw;
  margin-left: -6vw;
  padding: clamp(14px, 1.6vw, 26px) 0;
  overflow: clip;
  border-block: 2px solid var(--ink);
}
.manifesto__band--blue {
  position: relative;
  z-index: 1;
  background: var(--blue);
  color: var(--yellow);
  rotate: -4deg;
}
.manifesto__band--yellow {
  background: var(--yellow);
  color: var(--ink);
  rotate: 3deg;
  margin-top: clamp(-34px, -2.4vw, -18px);
}
.manifesto__track {
  display: flex;
  align-items: center;
  gap: clamp(22px, 2.6vw, 44px);
  width: max-content;
  padding-right: clamp(22px, 2.6vw, 44px);
  font-family: var(--display);
  font-size: clamp(44px, 6.4vw, 112px);
  font-weight: 900;
  font-stretch: 112%;
  letter-spacing: -0.035em;
  line-height: 1;
  white-space: nowrap;
  will-change: transform;
}
.manifesto__star {
  font-size: 0.6em;
}
.manifesto__band--blue .manifesto__star {
  color: var(--white);
}
.manifesto__band--yellow .manifesto__star {
  color: var(--blue);
}
</style>

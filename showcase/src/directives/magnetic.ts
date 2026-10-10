/**
 * 用途：为按钮和入口提供磁吸效果，指针靠近时元素朝指针方向轻微偏移，离开后回弹。
 * 职责：只在可悬停的精细指针且允许动态时生效；用 quickTo 合并高频指针事件，卸载时清理监听与内联位移。
 * 关键导出：vMagnetic 指令，可选绑定值为吸附强度（默认 0.35，即偏移量占指针离中心距离的比例）。
 */
import type { Directive } from "vue";
import { gsap } from "gsap";

type MagneticState = {
  move: (event: PointerEvent) => void;
  leave: () => void;
};

const states = new WeakMap<HTMLElement, MagneticState>();
const finePointer =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export const vMagnetic: Directive<HTMLElement, number | undefined> = {
  mounted(element, binding) {
    const strength = binding.value ?? 0.35;
    const xTo = gsap.quickTo(element, "x", { duration: 0.45, ease: "power3.out" });
    const yTo = gsap.quickTo(element, "y", { duration: 0.45, ease: "power3.out" });
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !window.matchMedia(finePointer).matches)
        return;
      // 包围盒已包含当前偏移，先扣除偏移再求中心，避免吸附量反复叠加。
      const rect = element.getBoundingClientRect();
      const offsetX = Number(gsap.getProperty(element, "x")) || 0;
      const offsetY = Number(gsap.getProperty(element, "y")) || 0;
      const centerX = rect.left - offsetX + rect.width / 2;
      const centerY = rect.top - offsetY + rect.height / 2;
      xTo((event.clientX - centerX) * strength);
      yTo((event.clientY - centerY) * strength);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    states.set(element, { move, leave });
  },
  unmounted(element) {
    const state = states.get(element);
    if (state) {
      element.removeEventListener("pointermove", state.move);
      element.removeEventListener("pointerleave", state.leave);
    }
    gsap.killTweensOf(element);
    gsap.set(element, { clearProps: "transform" });
    states.delete(element);
  },
};

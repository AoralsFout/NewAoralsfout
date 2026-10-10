/**
 * 用途：为展示页建立分段滚动入场，统一管理标题、说明、卡片与内部滚动列表。
 * 职责：标题先由矩形遮罩扫过、字符错位后归位，标签侧移并乱码解码，其余片段上移淡入；
 * 只注册新增节点，完整离开视口后允许重播，处理键盘焦点、减少动态偏好和卸载清理。
 * 关键导出：useScrollMotion，返回 sync；调用方在公开数据或筛选更新 DOM 后同步布局。
 */
import { onMounted, onUnmounted, type Ref } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type MotionRecord = {
  targets: HTMLElement[];
  context: gsap.Context;
  tween: gsap.core.Timeline;
  started: boolean;
  done: boolean;
  inside: boolean;
  entryReady: boolean;
  restoreHints: () => void;
  restoreGeometry: () => void;
};

const segmentSelector = [
  "main [data-motion-segment]",
  "main .section-label",
  ".section-title-row > p",
  ".section-title-row > div",
  ".work-toolbar",
  ".subheading",
  ".contribution-summary",
  ".heatmap-foot",
  ".collection-heading",
  ".source-row",
  ".anime-filters",
  ".about-symbol",
  ".profile-heading",
  ".about-copy > p",
  ".profile-source",
  ".about-copy > .text-link",
  ".now-status",
  ".contact-top",
].join(",");
const itemSelector = [
  "main [data-motion-item]",
  ".repo-card",
  ".article-card",
  ".media-collection__item",
  ".profile-stats > span",
  ".goal",
  ".contact-links > a",
].join(",");

/** 用正常文档滚动触发章节，使用裁切感知观察器处理开发动态的内部滚动。 */
export function useScrollMotion(root: Ref<HTMLElement | undefined>) {
  let media: gsap.MatchMedia | undefined;
  let register: (() => void) | undefined;
  let frame = 0;
  let mounted = false;
  // 弱引用仅用于跨偏好切换保留当前已显示内容，不阻止离开后再次入场。
  const presented = new WeakSet<HTMLElement>();

  /** 多个并发 API 更新合并到下一帧；不在滚动逐帧回调中刷新布局。 */
  function sync() {
    if (!mounted || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      register?.();
      ScrollTrigger.refresh();
    });
  }

  onMounted(() => {
    const page = root.value;
    if (!page) return;
    mounted = true;
    media = gsap.matchMedia();
    media.add({
      motion: "(prefers-reduced-motion: no-preference)",
      reduced: "(prefers-reduced-motion: reduce)",
    }, (preference) => {
      if (preference.conditions?.reduced) {
        register = () => page.querySelectorAll<HTMLElement>(
          `[data-motion-heading],${segmentSelector},${itemSelector},.activity-row`,
        ).forEach((node) => presented.add(node));
        register();
        sync();
        return () => { register = undefined; };
      }
      const records = new Map<HTMLElement, MotionRecord>();
      let active = true;

      /** 读取当前可视范围，开发动态同时受内部列表的溢出裁切影响。 */
      function isVisible(node: HTMLElement) {
        const rect = node.getBoundingClientRect();
        const list = node.closest<HTMLElement>(".activity-list");
        const clip = list?.getBoundingClientRect();
        return rect.bottom > Math.max(0, clip?.top ?? 0)
          && rect.top < Math.min(window.innerHeight, clip?.bottom ?? window.innerHeight)
          && rect.right > Math.max(0, clip?.left ?? 0)
          && rect.left < Math.min(window.innerWidth, clip?.right ?? window.innerWidth);
      }

      // 暂不依赖 visibility/inert 隐藏条目，焦点进入时能立即恢复完整可见状态。
      function finish(record: MotionRecord) {
        if (record.done) return;
        record.started = true;
        record.tween.delay(0).progress(1).pause();
        record.restoreHints();
      }

      /** 只有完整离开可视范围后复位；暂停并回到零点会重新写入被 clearProps 清除的初始样式。 */
      function reset(node: HTMLElement, record: MotionRecord) {
        if (node.contains(document.activeElement) || (!record.started && !record.done)) return;
        record.tween.delay(0).pause(0, true);
        record.started = false;
        record.done = false;
        // 条目本身就是观察目标，等待期间恢复自然几何，避免 y 位移把刚离屏的条目推回视口。
        record.restoreGeometry();
        record.restoreHints();
      }

      /** 同一滚动片段内的条目错峰播放，同一次停留期间不重复启动。 */
      function play(nodes: Element[]) {
        const pending = nodes
          .map((node) => records.get(node as HTMLElement))
          .filter((record): record is MotionRecord =>
            Boolean(record && record.inside && !record.started && !record.done),
          );
        pending.forEach((record, index) => {
          record.started = true;
          record.tween.delay(Math.min(index, 5) * 0.075).restart(true);
        });
      }

      // 入口阈值和完整可视范围分别观察，越过入口线时仍可见的条目不会突然被隐藏。
      // 两个观察器都考虑 activity-list 裁切，支持内部列表上下滚动时重播。
      const visibilityObserver = new IntersectionObserver((entries) => {
        const ready: Element[] = [];
        entries.forEach((entry) => {
          const node = entry.target as HTMLElement;
          const record = records.get(node);
          if (!record) return;
          record.inside = entry.isIntersecting;
          if (!entry.isIntersecting) reset(node, record);
          else if (record.entryReady) ready.push(node);
        });
        play(ready);
      }, { threshold: 0 });
      const entryObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const record = records.get(entry.target as HTMLElement);
          if (record) record.entryReady = entry.isIntersecting && entry.intersectionRatio >= 0.12;
        });
        play(entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.12).map((entry) => entry.target));
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

      /** 仅使用位移、旋转、横向缩放和透明度；临时合成提示在播放结束和偏好切换时恢复。 */
      function createRecord(node: HTMLElement, heading = false) {
        // 每条记录独立持有 context，移除时完整清空 GSAP 内部引用，避免反复筛选积累旧 DOM。
        const context = gsap.context(() => {}, page);
        const targets = heading
          ? Array.from(node.querySelectorAll<HTMLElement>("[data-motion-char]"))
          : [node];
        const hints = targets.map((target) => target.style.willChange);
        const originalTransform = node.style.getPropertyValue("transform");
        const restoreGeometry = () => {
          // 字符标题观察稳定的标题根节点，字符自身位移不会改变标题矩形，无需清理。
          if (heading) return;
          if (originalTransform) node.style.setProperty("transform", originalTransform);
          else node.style.removeProperty("transform");
        };
        const restoreHints = () => targets.forEach((target, index) => {
          if (hints[index]) target.style.willChange = hints[index];
          else target.style.removeProperty("will-change");
        });
        const isLabel = node.matches(".section-label, .contact-top");
        const keepVisible = presented.has(node) && isVisible(node);
        const wipes = heading
          ? Array.from(node.querySelectorAll<HTMLElement>("[data-motion-wipe]"))
          : [];
        const scramble = isLabel
          ? node.querySelector<HTMLElement>("[data-scramble]")
          : null;
        // context.add 同步执行，暂停的时间线建立后才可能接收触发或焦点事件。
        let record!: MotionRecord;
        context.add(() => {
          const timeline = gsap.timeline({
            paused: true,
            onStart: () => targets.forEach((target) => {
              target.style.willChange = "transform, opacity";
            }),
            onComplete: () => {
              record.done = true;
              presented.add(node);
              restoreHints();
            },
          });
          if (heading) {
            // 每行遮罩从左侧展开盖住字面，字符在遮罩下交替从上下错位归位，遮罩再向右收回露出标题。
            timeline
              .fromTo(wipes,
                { scaleX: 0, transformOrigin: "0% 50%" },
                { scaleX: 1, duration: 0.42, ease: "power3.inOut", stagger: 0.08, immediateRender: true })
              .set(wipes, { transformOrigin: "100% 50%" })
              .fromTo(targets,
                { yPercent: (index: number) => (index % 2 ? -110 : 110), rotation: (index: number) => (index % 2 ? 7 : -7), opacity: 0 },
                {
                  yPercent: 0,
                  rotation: 0,
                  opacity: 1,
                  duration: 0.8,
                  ease: "expo.out",
                  stagger: { amount: 0.3 },
                  immediateRender: true,
                  clearProps: "opacity,transform",
                })
              .to(wipes, {
                scaleX: 0,
                duration: 0.5,
                ease: "power3.inOut",
                stagger: 0.08,
                clearProps: "transform,transformOrigin",
              }, "<");
          } else {
            timeline.fromTo(targets,
              { y: isLabel ? 0 : 26, x: isLabel ? -18 : 0, opacity: 0 },
              {
                y: 0,
                x: 0,
                opacity: 1,
                duration: 0.65,
                ease: "power3.out",
                immediateRender: true,
                clearProps: "opacity,transform",
              });
            // 乱码终点就是原文；时间线完成或被直接跳到终点时文字总能还原。
            if (scramble?.textContent) {
              timeline.to(scramble, {
                duration: 0.9,
                ease: "none",
                scrambleText: {
                  text: scramble.textContent,
                  chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/",
                  speed: 0.7,
                },
              }, 0);
            }
          }
          record = {
            targets,
            context,
            started: false,
            done: false,
            inside: isVisible(node),
            entryReady: false,
            restoreHints,
            restoreGeometry,
            tween: timeline,
          };
        });
        records.set(node, record);
        // 深链接、返回滚动位置或键盘导航已经越过的内容直接完成，避免重新遮住正文。
        if (keepVisible || node.getBoundingClientRect().bottom <= 0 || node.contains(document.activeElement)) {
          finish(record);
        } else {
          restoreGeometry();
        }
        return record;
      }

      register = () => {
        // 筛选和公开撤回会移除节点，及时释放观察、触发器及动画引用。
        records.forEach((record, node) => {
          if (page.contains(node)) return;
          visibilityObserver.unobserve(node);
          entryObserver.unobserve(node);
          record.context.revert();
          record.restoreHints();
          records.delete(node);
        });

        page.querySelectorAll<HTMLElement>(`[data-motion-heading],${segmentSelector},${itemSelector},.activity-row`)
          .forEach((node) => {
            if (records.has(node)) return;
            createRecord(node, node.hasAttribute("data-motion-heading"));
            visibilityObserver.observe(node);
            entryObserver.observe(node);
          });
      };

      /** 键盘焦点优先于入场时间，聚焦隐藏字符标题或卡片时立即完成对应动画。 */
      const handleFocus = (event: FocusEvent) => {
        if (!(event.target instanceof Node)) return;
        const target = event.target;
        records.forEach((record, node) => {
          if (node.contains(target)) finish(record);
        });
      };
      /** 焦点移走后再检查完全离开的条目，避免离屏聚焦造成条目永远无法复位。 */
      const handleBlur = (event: FocusEvent) => {
        if (!(event.target instanceof Node)) return;
        const target = event.target;
        queueMicrotask(() => {
          if (!active) return;
          records.forEach((record, node) => {
            if (node.contains(target) && !isVisible(node)) reset(node, record);
          });
        });
      };
      page.addEventListener("focusin", handleFocus);
      page.addEventListener("focusout", handleBlur);
      sync();
      return () => {
        register = undefined;
        active = false;
        visibilityObserver.disconnect();
        entryObserver.disconnect();
        page.removeEventListener("focusin", handleFocus);
        page.removeEventListener("focusout", handleBlur);
        records.forEach((record, node) => {
          record.context.revert();
          record.restoreHints();
          presented.add(node);
        });
        records.clear();
      };
    }, page);
    sync();
  });

  onUnmounted(() => {
    mounted = false;
    cancelAnimationFrame(frame);
    media?.revert();
    register = undefined;
  });
  return { sync };
}

<!--
 * 用途：以全部仓库的语言汇总展示技术栈，不展示逐项目明细。
 * 职责：以排版树图呈现语言占比（语言名本身即色块，面积按代码字节分配），配合文本图例、汇总指标、来源状态、零统计与响应式布局。
 * 关键导出：TechStack 默认组件，接收 stats、state、emptyMessage，不导出事件。
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import SourceStatus from "./SourceStatus.vue";
import type { ShowcaseLanguageStats, ShowcaseModuleState } from "../data/types";

const props = defineProps<{
  stats: ShowcaseLanguageStats | null;
  state?: ShowcaseModuleState;
  emptyMessage: string;
}>();

const numberFormatter = new Intl.NumberFormat("zh-CN");
const percentageFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const byteFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

/** 条段与图例共用明亮、高饱和度配色；超出基础配色时按黄金角分散色相，避免重复循环同一组颜色。 */
const languageColors = ["#3288ff", "#16c784", "#ff793f", "#ffc52f", "#a56eff", "#ff527d", "#00bfd1", "#6475ff", "#ffab26", "#e649cb", "#8dcc2e", "#ff4b45"];
const languages = computed(() => (props.stats?.languages ?? []).map((language, index) => ({
  ...language,
  color: languageColors[index] ?? `hsl(${((index - languageColors.length) * 137.508 + 15) % 360} 85% 58%)`,
})));

type TreemapBox = { x: number; y: number; w: number; h: number };
type TreemapTile = TreemapBox & {
  name: string;
  color: string;
  ink: boolean;
  percentage: number;
  fontSize: number;
  showName: boolean;
  showPercentage: boolean;
};

const treemap = ref<HTMLElement>();
const size = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | undefined;

/** 根据背景亮度选择黑字或白字，保证色块上的语言名清晰。 */
function prefersInk(color: string) {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return false;
  probe.fillStyle = color;
  const hex = probe.fillStyle;
  if (!hex.startsWith("#")) return false;
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
}

/**
 * Squarified 树图：按面积从大到小沿短边逐行排布，每行持续加入色块直到最差长宽比变坏再换行，
 * 让大多数色块接近正方形，便于放下语言名。输入面积需已排序，输出与容器同一像素坐标系。
 */
function squarify(areas: number[], width: number, height: number): TreemapBox[] {
  const boxes: TreemapBox[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: number[] = [];
  const worst = (items: number[], side: number) => {
    const sum = items.reduce((total, item) => total + item, 0);
    const max = Math.max(...items);
    const min = Math.min(...items);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const place = (items: number[]) => {
    const sum = items.reduce((total, item) => total + item, 0);
    if (w >= h) {
      const column = sum / h;
      let offset = y;
      items.forEach((item) => {
        boxes.push({ x, y: offset, w: column, h: item / column });
        offset += item / column;
      });
      x += column;
      w -= column;
    } else {
      const band = sum / w;
      let offset = x;
      items.forEach((item) => {
        boxes.push({ x: offset, y, w: item / band, h: band });
        offset += item / band;
      });
      y += band;
      h -= band;
    }
  };
  for (const area of areas) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, area], side) <= worst(row, side)) {
      row.push(area);
    } else {
      place(row);
      row = [area];
    }
  }
  if (row.length) place(row);
  return boxes;
}

/** 只有字节数大于零的语言进入树图；零字节语言仍在下方图例中完整列出。 */
const tiles = computed<TreemapTile[]>(() => {
  const { width, height } = size.value;
  const measured = languages.value.filter((language) => language.bytes > 0);
  const total = measured.reduce((sum, language) => sum + language.bytes, 0);
  if (!width || !height || !total) return [];
  const boxes = squarify(
    measured.map((language) => (language.bytes / total) * width * height),
    width,
    height,
  );
  return measured.map((language, index) => {
    const box = boxes[index] ?? { x: 0, y: 0, w: 0, h: 0 };
    // 字号随色块尺寸变化，同时受语言名长度约束（宽体粗字每字符约 0.8em），确保名称能放进色块。
    const nameLength = Math.max(Array.from(language.name).length, 2);
    const fontSize = Math.max(
      12,
      Math.min(box.h * 0.36, (box.w - 28) / (nameLength * 0.8), 128),
    );
    return {
      ...box,
      name: language.name,
      color: language.color,
      ink: prefersInk(language.color),
      percentage: language.percentage,
      fontSize,
      showName: box.w > 54 && box.h > 34,
      showPercentage: box.w > 90 && box.h > 74,
    };
  });
});

// 树图容器只在取得语言数据后渲染，随节点出现或移除重新绑定尺寸观察。
watch(treemap, (element) => {
  resizeObserver?.disconnect();
  if (!element) return;
  resizeObserver ??= new ResizeObserver(([entry]) => {
    if (!entry) return;
    size.value = {
      width: Math.round(entry.contentRect.width),
      height: Math.round(entry.contentRect.height),
    };
  });
  resizeObserver.observe(element);
}, { flush: "post" });
onUnmounted(() => resizeObserver?.disconnect());

/** 代码量以二进制单位缩写，精确字节数仍通过文本提示提供；零字节保留为 0 B。 */
function formatBytes(bytes: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const index = bytes > 0 ? Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1) : 0;
  return `${byteFormatter.format(bytes / 1024 ** index)} ${units[index]}`;
}
</script>

<template>
  <div class="tech-stack" aria-labelledby="tech-title" :aria-busy="state?.state === 'loading'">
    <div class="tech-stack__intro" data-motion-segment>
      <div>
        <span class="mono tech-stack__eyebrow">LANGUAGE / STATISTICS</span>
        <h3 id="tech-title">代码里的<span class="blue-text">语言。</span></h3>
      </div>
      <div class="tech-stack__description">
        <p>汇总全部仓库的语言构成，<br />看看每种语言在代码中占了多少。</p>
        <SourceStatus :state="state" />
      </div>
    </div>
    <!-- 有效零统计也保留汇总指标；未取得数据时只显示对应的加载、错误或不可用提示。 -->
    <dl v-if="stats" class="tech-stack__summary" data-motion-segment>
      <div>
        <dt>语言种类</dt>
        <dd class="mono">{{ numberFormatter.format(stats.languages.length) }}</dd>
      </div>
      <div>
        <dt>统计仓库</dt>
        <dd class="mono">{{ numberFormatter.format(stats.repositoryCount) }}</dd>
      </div>
      <div>
        <dt>含代码的仓库</dt>
        <dd class="mono">{{ numberFormatter.format(stats.repositoriesWithLanguages) }}</dd>
      </div>
      <div>
        <dt>总代码量</dt>
        <dd class="mono" :title="`${numberFormatter.format(stats.totalBytes)} 字节`">{{ formatBytes(stats.totalBytes) }}</dd>
      </div>
    </dl>
    <div v-if="languages.length" class="language-statistics" data-motion-segment>
      <!-- 按原始字节分配面积；色块只作视觉呈现，完整数据由下方文本图例提供。 -->
      <div ref="treemap" class="language-treemap" aria-hidden="true">
        <span
          v-for="tile in tiles"
          :key="tile.name"
          class="language-treemap__tile"
          :class="{ 'is-ink': tile.ink }"
          data-motion-item
          :style="{
            left: `${tile.x}px`,
            top: `${tile.y}px`,
            width: `${tile.w}px`,
            height: `${tile.h}px`,
            backgroundColor: tile.color,
          }"
          :title="`${tile.name} ${percentageFormatter.format(tile.percentage)}%`"
        >
          <strong v-if="tile.showName" :style="{ fontSize: `${tile.fontSize}px` }">{{ tile.name }}</strong>
          <span v-if="tile.showPercentage" class="mono">{{ percentageFormatter.format(tile.percentage) }}%</span>
        </span>
      </div>
      <ul class="language-statistics__legend" aria-label="语言占比图例，按代码量排列">
        <li v-for="language in languages" :key="language.name" class="language-statistics__legend-item">
          <span class="language-statistics__swatch" :style="{ backgroundColor: language.color }" aria-hidden="true"></span>
          <span class="language-statistics__name">{{ language.name }}</span>
          <span class="language-statistics__percentage mono">{{ percentageFormatter.format(language.percentage) }}%</span>
        </li>
      </ul>
    </div>
    <p v-else class="empty-message" role="status">{{ emptyMessage }}</p>
    <p v-if="stats" class="tech-stack__footnote">统计包含公开、私有、Fork 和归档仓库。占比按代码字节数计算，因四舍五入可能不合计为 100%，不代表技能熟练度。</p>
  </div>
</template>

<style scoped>
/* 延续代码展区的网格，用横向堆积条压缩语言统计高度，图例通过颜色和文本共同表达构成。 */
.tech-stack {
  margin-top: 64px;
  padding-top: 34px;
  border-top: 1px solid var(--ink);
}
.tech-stack__intro {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  align-items: end;
  gap: 32px;
  margin-bottom: 28px;
}
.tech-stack__eyebrow { display: block; margin-bottom: 12px; color: var(--muted); }
.tech-stack__intro h3 { font-size: clamp(28px, 3.3vw, 42px); letter-spacing: -0.055em; }
.tech-stack__description p { font-size: 14px; line-height: 1.8; margin-bottom: 10px; }
.tech-stack__summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 24px; border: 1px solid var(--line); background: var(--surface); }
.tech-stack__summary > div { min-width: 0; padding: 22px; }
.tech-stack__summary > div + div { border-left: 1px solid var(--line); }
.tech-stack__summary dt { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
.tech-stack__summary dd { margin: 0; font-size: clamp(20px, 2.5vw, 30px); font-weight: 700; overflow-wrap: anywhere; }
/* 树图容器按比例给出画布，色块用 1px 内描边分隔，语言名以超大字号贴在左下角。 */
.language-treemap { position: relative; aspect-ratio: 2.4; background: var(--ink); overflow: hidden; }
.language-treemap__tile { position: absolute; display: flex; flex-direction: column; justify-content: space-between; padding: 12px 14px; overflow: hidden; color: var(--white); box-shadow: inset 0 0 0 1px var(--ink); }
.language-treemap__tile.is-ink { color: var(--ink); }
.language-treemap__tile strong { order: 2; font-family: var(--display); font-weight: 900; font-stretch: 112%; line-height: 0.9; letter-spacing: -0.05em; white-space: nowrap; }
.language-treemap__tile .mono { order: 1; font-size: 12px; font-weight: 700; }
.language-statistics__legend { display: flex; flex-wrap: wrap; gap: 12px 24px; list-style: none; margin: 18px 0 0; padding: 0; }
.language-statistics__legend-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 100%; font-size: 14px; line-height: 1.6; }
.language-statistics__swatch { flex: 0 0 10px; height: 10px; border-radius: 50%; align-self: baseline; position: relative; top: 1px; }
.language-statistics__name { min-width: 0; font-family: var(--mono); font-weight: 700; overflow-wrap: anywhere; }
.language-statistics__percentage { color: var(--muted); white-space: nowrap; }
.tech-stack__footnote { font-size: 12px; line-height: 1.8; color: var(--muted); margin-top: 16px; }
@media (max-width: 900px) {
  .tech-stack__summary > div { padding: 18px 14px; }
}
@media (max-width: 640px) {
  .tech-stack { margin-top: 44px; padding-top: 26px; }
  .tech-stack__intro { grid-template-columns: 1fr; gap: 16px; }
  .tech-stack__intro h3 { font-size: 30px; }
  .tech-stack__summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tech-stack__summary > div:nth-child(3) { border-left: 0; }
  .tech-stack__summary > div:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .language-statistics__legend { gap: 10px 18px; }
  .language-treemap { aspect-ratio: 1; }
}
</style>

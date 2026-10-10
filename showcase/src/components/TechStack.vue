<!--
 * 用途：以全部仓库的语言汇总展示技术栈，不展示逐项目明细。
 * 职责：以彩色横向堆积条和图例呈现语言占比，保留汇总指标、来源状态、零统计与响应式布局。
 * 关键导出：TechStack 默认组件，接收 stats、state、emptyMessage，不导出事件。
-->
<script setup lang="ts">
import { computed } from "vue";
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
      <!-- 按原始字节分配宽度，避免占比舍入留下空隙或丢失微小语言；完整数据由下方文本图例提供。 -->
      <div class="language-statistics__bar" aria-hidden="true">
        <span
          v-for="language in languages"
          :key="language.name"
          class="language-statistics__segment"
          :style="{ flexGrow: language.bytes, backgroundColor: language.color }"
          :title="`${language.name} ${percentageFormatter.format(language.percentage)}%`"
        ></span>
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
.language-statistics__bar { display: flex; height: 18px; overflow: hidden; border-radius: 5px; background: var(--surface); }
.language-statistics__segment { flex-basis: 0; min-width: 0; }
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
}
</style>

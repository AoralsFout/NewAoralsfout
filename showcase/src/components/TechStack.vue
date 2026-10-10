<!--
 * 用途：以全部仓库的语言汇总展示技术栈，不展示逐项目明细。
 * 职责：呈现语言占比、代码字节数和仓库数量，保留来源状态、零统计与响应式布局。
 * 关键导出：TechStack 默认组件，接收 stats、state、emptyMessage，不导出事件。
-->
<script setup lang="ts">
import SourceStatus from "./SourceStatus.vue";
import type { ShowcaseLanguageStats, ShowcaseModuleState } from "../data/types";

defineProps<{
  stats: ShowcaseLanguageStats | null;
  state?: ShowcaseModuleState;
  emptyMessage: string;
}>();

const numberFormatter = new Intl.NumberFormat("zh-CN");
const percentageFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const byteFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

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
    <ol v-if="stats?.languages.length" class="language-statistics" aria-label="按代码量排列的语言统计">
      <li v-for="(language, index) in stats.languages" :key="language.name" class="language-stat" data-motion-item>
        <span class="language-stat__rank mono" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="language-stat__composition">
          <div class="language-stat__heading">
            <h4>{{ language.name }}</h4>
            <span class="language-stat__percentage mono">{{ percentageFormatter.format(language.percentage) }}%</span>
          </div>
          <!-- 比例条仅辅助比较，语言名称与精确占比始终以文本呈现。 -->
          <div class="language-stat__track" aria-hidden="true">
            <span :style="{ width: `${language.percentage}%` }"></span>
          </div>
        </div>
        <dl class="language-stat__details">
          <div>
            <dt>代码量</dt>
            <dd class="mono" :title="`${numberFormatter.format(language.bytes)} 字节`">{{ formatBytes(language.bytes) }}</dd>
          </div>
          <div>
            <dt>使用仓库</dt>
            <dd><span class="mono">{{ numberFormatter.format(language.repositoryCount) }}</span> 个</dd>
          </div>
        </dl>
      </li>
    </ol>
    <p v-else class="empty-message" role="status">{{ emptyMessage }}</p>
    <p v-if="stats" class="tech-stack__footnote">统计包含公开、私有、Fork 和归档仓库。占比按代码字节数计算，因四舍五入可能不合计为 100%，不代表技能熟练度。</p>
  </div>
</template>

<style scoped>
/* 延续代码展区的色彩和网格，用统一比例尺展示语言构成，避免将语言数据表达为技能评分。 */
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
.language-statistics { list-style: none; margin: 0; padding: 0; }
.language-stat { display: grid; grid-template-columns: 40px minmax(0, 1fr) minmax(210px, 0.45fr); align-items: center; gap: 24px; padding: 24px 0; border-top: 1px solid var(--line); }
.language-stat__rank { color: var(--muted); font-size: 13px; }
.language-stat__composition { min-width: 0; }
.language-stat__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.language-stat__heading h4 { margin: 0; font-family: var(--mono); font-size: 20px; overflow-wrap: anywhere; min-width: 0; }
.language-stat__percentage { font-size: 20px; font-weight: 700; color: var(--blue); white-space: nowrap; }
.language-stat__track { height: 8px; background: var(--surface); }
.language-stat__track > span { display: block; height: 100%; background: var(--blue); }
.language-stat__details { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0; padding-left: 24px; border-left: 1px solid var(--line); }
.language-stat__details dt { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.language-stat__details dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.tech-stack__footnote { font-size: 12px; line-height: 1.8; color: var(--muted); margin-top: 16px; }
@media (max-width: 900px) {
  .tech-stack__summary > div { padding: 18px 14px; }
  .language-stat { grid-template-columns: 32px minmax(0, 1fr) 200px; gap: 16px; }
  .language-stat__details { padding-left: 16px; }
}
@media (max-width: 640px) {
  .tech-stack { margin-top: 44px; padding-top: 26px; }
  .tech-stack__intro { grid-template-columns: 1fr; gap: 16px; }
  .tech-stack__intro h3 { font-size: 30px; }
  .tech-stack__summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tech-stack__summary > div:nth-child(3) { border-left: 0; }
  .tech-stack__summary > div:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .language-stat { grid-template-columns: 24px minmax(0, 1fr); gap: 14px; padding: 20px 0; }
  .language-stat__heading h4, .language-stat__percentage { font-size: 18px; }
  .language-stat__details { grid-column: 2; border-left: 0; padding-left: 0; }
}
</style>

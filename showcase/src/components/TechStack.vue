<!--
 * 用途：以公开仓库的真实语言构成展示技术栈，连接技术名称和具体项目。
 * 职责：提供技术筛选、逐仓库比例和可读图例，保留来源状态，不推断技能熟练度。
 * 关键导出：TechStack 默认组件，接收 repositories、state、emptyMessage；layout 通知父层更新动效位置。
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import SourceStatus from "./SourceStatus.vue";
import type { ShowcaseModuleState, ShowcaseRepositoryLanguages } from "../data/types";

const props = defineProps<{
  repositories: ShowcaseRepositoryLanguages[];
  state?: ShowcaseModuleState;
  emptyMessage: string;
}>();
const emit = defineEmits<{ layout: [] }>();
const selected = ref("");
const percentageFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
// 排列是展示顺序，仓库数量和比例全部来自 API，不用该顺序表达熟练度。
const languageOrder = ["TypeScript", "Vue", "Rust", "JavaScript", "CSS", "HTML"];
const languageMarks: Record<string, string> = {
  TypeScript: "TS", Vue: "VUE", Rust: "RS", JavaScript: "JS", CSS: "CSS", HTML: "HTML",
};
const languageColors: Record<string, string> = {
  TypeScript: "var(--blue)",
  Vue: "var(--ink)",
  Rust: "var(--yellow)",
  JavaScript: "color-mix(in srgb, var(--blue) 60%, var(--white))",
  CSS: "var(--muted)",
  HTML: "color-mix(in srgb, var(--blue) 22%, var(--white))",
};
const technologies = computed(() => {
  const usage = new Map<string, number>();
  props.repositories.forEach((repository) => {
    // 同一仓库的重复语言只计一次；零字节不代表该项目实际使用了该语言。
    new Set(repository.languages.filter((language) => language.bytes > 0).map((language) => language.name))
      .forEach((name) => usage.set(name, (usage.get(name) ?? 0) + 1));
  });
  return Array.from(usage, ([name, count]) => ({ name, count })).sort((a, b) => {
    const aIndex = languageOrder.indexOf(a.name);
    const bIndex = languageOrder.indexOf(b.name);
    return (aIndex < 0 ? 100 : aIndex) - (bIndex < 0 ? 100 : bIndex) || a.name.localeCompare(b.name);
  });
});
const repositories = computed(() => props.repositories.filter((repository) =>
  !selected.value || repository.languages.some((language) => language.name === selected.value && language.bytes > 0),
));
const selectionLabel = computed(() => `${selected.value || "全部技术"} · ${repositories.value.length} 个项目`);

/** 再次点击当前技术恢复全部；使用按钮确保键盘与触屏具有相同的筛选入口。 */
function selectLanguage(name: string) {
  selected.value = selected.value === name ? "" : name;
}
function color(name: string) {
  return languageColors[name] ?? "var(--muted)";
}
/** 仓库名来自公开接口，仅接受 GitHub 仓库路径，不能把任意数据作为外部链接。 */
function repositoryUrl(fullName: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) return undefined;
  return `https://github.com/${fullName.split("/").map(encodeURIComponent).join("/")}`;
}
watch(technologies, (items) => {
  if (selected.value && !items.some((item) => item.name === selected.value)) selected.value = "";
});
// 筛选属于组件内部状态，DOM 行数更新后主动通知父层刷新下方章节的位置。
watch([selected, () => props.repositories], async () => {
  await nextTick();
  emit("layout");
}, { flush: "post" });
</script>

<template>
  <div class="tech-stack" aria-labelledby="tech-title" :aria-busy="state?.state === 'loading'">
    <div class="tech-stack__intro" data-motion-segment>
      <div>
        <span class="mono tech-stack__eyebrow">TOOLS / LANGUAGES</span>
        <h3 id="tech-title">写进项目的<span class="blue-text">技术。</span></h3>
      </div>
      <div class="tech-stack__description">
        <p>从公开置顶仓库中，看看这些技术用在哪里。<br />选一个技术，展开它对应的项目。</p>
        <SourceStatus :state="state" />
      </div>
    </div>
    <template v-if="technologies.length">
      <div class="tech-stack__technologies" role="group" aria-label="按技术筛选项目">
        <button
          v-for="technology in technologies"
          :key="technology.name"
          class="technology-card"
          :class="{ 'technology-card--selected': selected === technology.name }"
          :aria-pressed="selected === technology.name"
          :aria-label="`${technology.name}，${technology.count} 个项目`"
          aria-controls="repository-tech-list"
          data-motion-item
          @click="selectLanguage(technology.name)"
        >
          <span class="technology-card__mark mono" aria-hidden="true">{{ languageMarks[technology.name] || technology.name.slice(0, 3) }}</span>
          <strong>{{ technology.name }}</strong>
          <span class="technology-card__usage">{{ technology.count }} 个项目<AppIcon :size="15" /></span>
        </button>
      </div>
      <div class="tech-stack__selection" data-motion-segment>
        <p role="status" aria-live="polite" aria-atomic="true">{{ selectionLabel }}</p>
        <!-- 保留重置按钮的键盘焦点；无筛选时只标注不可用，点击不改变当前内容。 -->
        <button :aria-disabled="!selected" @click="selected = ''">显示全部<AppIcon name="close" :size="14" /></button>
      </div>
      <div id="repository-tech-list" class="repository-tech-list">
        <article v-for="repository in repositories" :key="repository.fullName" class="repository-tech-row" data-motion-item>
          <div class="repository-tech-row__name">
            <h4>
              <a v-if="repositoryUrl(repository.fullName)" :href="repositoryUrl(repository.fullName)" target="_blank" rel="noopener noreferrer">
                {{ repository.name }}<AppIcon :size="15" />
              </a>
              <template v-else>{{ repository.name }}</template>
            </h4>
            <span class="mono">{{ repository.fullName }}</span>
          </div>
          <div class="repository-tech-row__composition">
            <div class="language-bar" aria-hidden="true">
              <span
                v-for="language in repository.languages"
                :key="language.name"
                :style="{ flexBasis: `${language.percentage}%`, background: color(language.name) }"
                :class="{ 'language-bar__muted': selected && selected !== language.name }"
              ></span>
            </div>
            <ul class="language-legend" :aria-label="repository.name + ' 的语言构成'">
              <li v-for="language in repository.languages" :key="language.name" :class="{ 'language-legend__selected': selected === language.name }">
                <i :style="{ background: color(language.name) }" aria-hidden="true"></i>
                {{ language.name }}<span class="mono">{{ percentageFormatter.format(language.percentage) }}%</span>
              </li>
            </ul>
          </div>
        </article>
      </div>
      <p class="tech-stack__footnote">比例为各仓库的代码构成，来自 GitHub 语言统计。</p>
    </template>
    <p v-else class="empty-message" role="status">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped>
/* 与代码展区共享蓝、黄、黑色；技术卡片和对应仓库建立直接的视觉联系。 */
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
.tech-stack__technologies { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.technology-card {
  min-width: 0;
  padding: 22px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.technology-card:hover { background: #edf0ff; border-color: var(--blue); }
.technology-card--selected, .technology-card--selected:hover { background: var(--blue); color: var(--white); border-color: var(--blue); }
.technology-card__mark {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.03em;
  background: var(--white);
  color: var(--blue);
  border: 1px solid var(--line);
}
.technology-card--selected .technology-card__mark { background: var(--yellow); color: var(--ink); border-color: var(--yellow); }
.technology-card strong { font-family: var(--mono); font-size: clamp(15px, 1.5vw, 21px); letter-spacing: -0.055em; }
.technology-card__usage { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; }
.tech-stack__selection { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 25px 0 10px; }
.tech-stack__selection p { font-size: 13px; }
.tech-stack__selection button { display: inline-flex; gap: 10px; align-items: center; min-height: 44px; background: transparent; font-size: 12px; }
.tech-stack__selection button[aria-disabled="true"] { opacity: 0.45; cursor: default; }
.repository-tech-row { display: grid; grid-template-columns: minmax(150px, 0.7fr) minmax(0, 1.6fr); gap: 32px; padding: 25px 0; border-top: 1px solid var(--line); }
.repository-tech-row__name { min-width: 0; }
.repository-tech-row h4 { font-size: 18px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.repository-tech-row h4 a { display: inline-flex; align-items: center; gap: 12px; min-height: 44px; }
.repository-tech-row h4 a:hover { color: var(--blue); }
.repository-tech-row h4 svg { flex-shrink: 0; }
.repository-tech-row__name > span { color: var(--muted); display: block; overflow-wrap: anywhere; }
.repository-tech-row__composition { min-width: 0; padding-top: 12px; }
.language-bar { display: flex; gap: 2px; height: 10px; overflow: hidden; background: var(--surface); margin-bottom: 16px; }
.language-bar > span { flex-shrink: 1; }
.language-bar__muted { opacity: 0.22; }
.language-legend { display: flex; flex-wrap: wrap; gap: 10px 18px; }
.language-legend li { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.language-legend li > span { color: var(--muted); letter-spacing: 0; }
.language-legend i { width: 8px; height: 8px; flex-shrink: 0; }
.language-legend__selected { font-weight: 700; }
.tech-stack__footnote { font-size: 12px; color: var(--muted); margin-top: 10px; }
@media (max-width: 1100px) {
  .tech-stack__technologies { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .technology-card strong { font-size: 21px; }
  .repository-tech-row { grid-template-columns: minmax(140px, 0.7fr) minmax(0, 1.3fr); gap: 24px; }
}
@media (max-width: 640px) {
  .tech-stack { margin-top: 44px; padding-top: 26px; }
  .tech-stack__intro { grid-template-columns: 1fr; gap: 16px; }
  .tech-stack__intro h3 { font-size: 30px; }
  .tech-stack__technologies { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .technology-card { padding: 18px 14px 14px; }
  .technology-card strong { font-size: 19px; }
  .repository-tech-row { grid-template-columns: 1fr; gap: 12px; padding: 20px 0; }
  .repository-tech-row__composition { padding-top: 0; }
  .language-legend { gap: 10px 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .technology-card { transition: none; }
}
</style>

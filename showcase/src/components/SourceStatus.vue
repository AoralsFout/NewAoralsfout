<!--
 * 用途：在模块标题旁展示公开数据的来源和后端提供的更新时间。
 * 职责：翻译模块来源与 freshness，区分读取中状态，忽略缺失或无效的时间。
 * 关键导出：SourceStatus 默认组件；接收可选 state，不导出事件，不推断实时状态。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ShowcaseModuleState } from "../data/types";

const props = defineProps<{ state?: ShowcaseModuleState }>();

const sourceNames: Record<ShowcaseModuleState["source"], string> = {
  github: "GitHub",
  steam: "Steam",
  bangumi: "Bangumi",
  neoblog: "NeoBlog",
  local: "个人记录",
};

const freshnessNames = {
  fresh: "已更新",
  stale: "缓存",
  unavailable: "暂不可用",
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const sourceName = computed(() =>
  props.state ? sourceNames[props.state.source] : "",
);

/** 读取状态优先显示；其余标签完全依据后端元数据，不从页面加载时间推断。 */
const statusLabel = computed(() => {
  if (props.state?.state === "loading") return "读取中";
  return props.state?.meta ? freshnessNames[props.state.meta.freshness] : "";
});

/** 仅格式化后端提供的合法日期，缺失或非法值不会产生默认更新时间。 */
const updatedDate = computed(() => {
  const value = props.state?.meta?.updatedAt;
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
});
</script>

<template>
  <small v-if="state" class="source-status">
    <span>{{ sourceName }}</span>
    <template v-if="statusLabel">
      <span class="source-status__separator" aria-hidden="true">/</span>
      <span>{{ statusLabel }}</span>
    </template>
    <template v-if="updatedDate">
      <span class="source-status__separator" aria-hidden="true">/</span>
      <time
        :datetime="state.meta?.updatedAt || undefined"
        :aria-label="`更新时间 ${updatedDate}`"
      >
        {{ updatedDate }}
      </time>
    </template>
  </small>
</template>

<style scoped>
.source-status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.7;
}

.source-status__separator {
  opacity: 0.55;
}

.source-status time {
  white-space: nowrap;
}
</style>

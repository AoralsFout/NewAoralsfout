<!--
 * 用途：展示公开 Steam 游戏与 Bangumi 动画收藏，保留真实图片、链接和收藏信息。
 * 职责：区分游戏小图列表与动画海报网格，呈现加载、错误、空列表及图片失败状态；可悬停设备上海报默认为蓝白网点印刷效果，悬停或聚焦时还原原图。
 * 关键导出：MediaCollection 默认组件；接收 items、kind、loading、error、emptyMessage，不导出事件。
-->
<script setup lang="ts">
import { ref } from "vue";
import type { ShowcaseCollection } from "../data/types";

const props = withDefaults(
  defineProps<{
    items: ShowcaseCollection[];
    kind: "game" | "anime";
    loading?: boolean;
    error?: string | null;
    emptyMessage?: string;
  }>(),
  {
    loading: false,
    error: null,
    emptyMessage: "当前分类暂无公开收藏。",
  },
);

const failedImages = ref(new Set<string>());
const hoursFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 把地址也纳入失败记录，切换收藏或图片更新后不会误用其他条目的降级状态。 */
function imageKey(item: ShowcaseCollection) {
  return `${props.kind}:${item.id}:${item.image ?? ""}`;
}

function markImageFailed(item: ShowcaseCollection) {
  failedImages.value.add(imageKey(item));
}

/** 图片不可用时直接显示名称首字，不生成与实际收藏无关的示意图。 */
function titleInitials(title: string) {
  const cleanTitle = title.trim();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^[a-z0-9]/i.test(cleanTitle)) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase();
  }
  return Array.from(cleanTitle).slice(0, 2).join("").toUpperCase() || "—";
}

/** 只有后端提供有效分钟数时才展示时长；零分钟仍是有效数据。 */
function playtimeLabel(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return "";
  return value < 60
    ? `${Math.floor(value)} 分钟`
    : `${hoursFormatter.format(value / 60)} 小时`;
}

/** 忽略缺失或非法日期，避免把未知的最近游玩时间伪装成默认日期。 */
function lastPlayedLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

function collectionStatusLabel(status: ShowcaseCollection["collectionStatus"]) {
  if (!status) return "";
  return {
    watched: "已看",
    watching: "在看",
    want: "想看",
    on_hold: "搁置",
    dropped: "弃看",
  }[status];
}

/** Bangumi 的零分代表没有评分；不将其显示为用户打出的零分。 */
function rateLabel(rate: number | undefined) {
  return typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate > 0 &&
    rate <= 10
    ? `${rate} / 10`
    : "";
}
</script>

<template>
  <div
    class="media-collection"
    :class="`media-collection--${kind}`"
    :aria-busy="loading"
  >
    <p v-if="loading" class="media-collection__notice" role="status">
      <span class="media-collection__notice-mark" aria-hidden="true">↗</span>
      正在读取 {{ kind === "game" ? "Steam 游戏" : "Bangumi 动画" }}收藏…
    </p>
    <div
      v-if="error"
      class="media-collection__notice media-collection__notice--error"
      role="status"
    >
      <p class="media-collection__notice-title">暂时无法读取收藏</p>
      <p>{{ error }}</p>
    </div>
    <p
      v-if="!loading && !error && !items.length"
      class="media-collection__notice media-collection__notice--empty"
      role="status"
    >
      {{ emptyMessage }}
    </p>

    <ul v-if="items.length" class="media-collection__grid">
      <li
        v-for="item in items"
        :key="`${kind}:${item.id}`"
        class="media-collection__item"
      >
        <component
          :is="item.url ? 'a' : 'div'"
          class="media-card"
          :class="`media-card--${kind}`"
          :href="item.url || undefined"
          :target="item.url ? '_blank' : undefined"
          :rel="item.url ? 'noopener noreferrer' : undefined"
          :aria-label="
            item.url
              ? `${item.title}，在 ${kind === 'game' ? 'Steam' : 'Bangumi'} 中查看（新窗口打开）`
              : undefined
          "
        >
          <div class="media-card__image-frame">
            <img
              v-if="item.image && !failedImages.has(imageKey(item))"
              class="media-card__image"
              :src="item.image"
              :alt="kind === 'anime' ? `${item.title} 海报` : ''"
              :width="kind === 'game' ? 64 : 240"
              :height="kind === 'game' ? 64 : 336"
              loading="lazy"
              decoding="async"
              @error="markImageFailed(item)"
            />
            <span v-else class="media-card__image-fallback" aria-hidden="true">
              {{ titleInitials(item.title) }}
            </span>
          </div>

          <div class="media-card__body">
            <div class="media-card__heading">
              <h3 class="media-card__title" :title="item.title">
                {{ item.title }}
              </h3>
              <span
                v-if="item.url && kind === 'anime'"
                class="media-card__arrow"
                aria-hidden="true"
                >↗</span
              >
            </div>
            <p v-if="item.subtitle" class="media-card__subtitle">
              {{ item.subtitle }}
            </p>

            <div v-if="kind === 'game'" class="media-card__facts">
              <span v-if="playtimeLabel(item.playtimeMinutes)">
                {{ playtimeLabel(item.playtimeMinutes) }}
              </span>
              <time
                v-if="lastPlayedLabel(item.lastPlayedAt)"
                :datetime="item.lastPlayedAt || undefined"
                class="media-card__last-played"
              >
                最近游玩 {{ lastPlayedLabel(item.lastPlayedAt) }}
              </time>
            </div>
            <div v-else class="media-card__facts">
              <span
                v-if="collectionStatusLabel(item.collectionStatus)"
                class="media-card__status"
              >
                {{ collectionStatusLabel(item.collectionStatus) }}
              </span>
              <span v-if="rateLabel(item.rate)" class="media-card__rating">
                <span aria-hidden="true">★</span> {{ rateLabel(item.rate) }}
              </span>
            </div>
          </div>
          <span
            v-if="item.url && kind === 'game'"
            class="media-card__arrow"
            aria-hidden="true"
            >↗</span
          >
        </component>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.media-collection {
  width: 100%;
  color: var(--ink);
}

.media-collection__notice {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  padding: 25px 0;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
}

.media-collection__notice + .media-collection__grid {
  margin-top: 24px;
}

.media-collection__notice-mark {
  color: var(--blue);
  font: 24px var(--mono);
}

.media-collection__notice--error {
  display: block;
  padding-left: 18px;
  border-left: 3px solid var(--blue);
}

.media-collection__notice--error p {
  margin: 0;
  overflow-wrap: anywhere;
}

.media-collection__notice-title {
  color: var(--ink);
  font-weight: 700;
}

.media-collection__notice--empty {
  min-height: 132px;
}

.media-collection__grid {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.media-collection--game .media-collection__grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 32px;
  border-top: 1px solid var(--ink);
}

.media-collection--anime .media-collection__grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 32px 20px;
}

.media-collection__item {
  min-width: 0;
}

.media-card {
  color: inherit;
  text-decoration: none;
}

.media-card--game {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 13px;
  align-items: center;
  gap: 14px;
  height: 100%;
  min-height: 126px;
  padding: 23px 0;
  border-bottom: 1px solid var(--line);
}

.media-card--anime {
  display: flex;
  height: 100%;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.media-card__image-frame {
  overflow: hidden;
  flex-shrink: 0;
  background: var(--surface);
}

.media-card--game .media-card__image-frame {
  width: 64px;
  height: 64px;
}

.media-card--anime .media-card__image-frame {
  width: 100%;
  aspect-ratio: 5 / 7;
}

.media-card__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card__image-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: var(--blue);
  font: 700 23px / 1 var(--display);
  letter-spacing: -0.06em;
}

.media-card--anime .media-card__image-fallback {
  min-height: 100%;
  font-size: clamp(30px, 3vw, 48px);
}

.media-card__body {
  min-width: 0;
}

.media-card--anime .media-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.media-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.media-card__title {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  font-family: var(--body);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.media-card--anime .media-card__title {
  font-size: 15px;
}

.media-card__subtitle {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.media-card__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 10px;
  margin-top: 8px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
}

.media-card--anime .media-card__facts {
  margin-top: auto;
  padding-top: 12px;
}

.media-card__last-played {
  flex-basis: 100%;
}

.media-card__status {
  color: var(--blue);
}

.media-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 5px;
  color: var(--ink);
  background: var(--yellow);
}

.media-card__arrow {
  flex-shrink: 0;
  color: var(--ink);
  font: 18px / 1.3 var(--mono);
  transition:
    color 160ms ease,
    transform 160ms ease;
}

a.media-card:hover .media-card__title,
a.media-card:hover .media-card__arrow {
  color: var(--blue);
}

a.media-card:hover .media-card__arrow {
  transform: translate(2px, -2px);
}

a.media-card:focus-visible {
  outline: 3px solid var(--blue);
  outline-offset: 6px;
}

/* 网点印刷：灰度原图叠蓝色滤色形成双色调，再叠一层网点；只在可悬停设备上使用，触屏直接显示原图。 */
@media (hover: hover) {
  .media-card--anime .media-card__image-frame:has(> img) {
    position: relative;
    isolation: isolate;
  }

  .media-card--anime .media-card__image {
    filter: grayscale(1) contrast(1.25) brightness(1.04);
    transition:
      filter 0.45s ease,
      transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .media-card--anime .media-card__image-frame:has(> img)::before,
  .media-card--anime .media-card__image-frame:has(> img)::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    transition: opacity 0.45s ease;
  }

  .media-card--anime .media-card__image-frame:has(> img)::before {
    z-index: 1;
    background: var(--blue);
    mix-blend-mode: screen;
  }

  .media-card--anime .media-card__image-frame:has(> img)::after {
    z-index: 2;
    background-image: radial-gradient(rgb(17 17 17 / 0.5) 28%, transparent 34%);
    background-size: 4px 4px;
    mix-blend-mode: multiply;
  }

  a.media-card:is(:hover, :focus-visible) .media-card__image {
    filter: none;
    transform: scale(1.05);
  }

  a.media-card:is(:hover, :focus-visible) .media-card__image-frame::before,
  a.media-card:is(:hover, :focus-visible) .media-card__image-frame::after {
    opacity: 0;
  }
}

@media (max-width: 1080px) {
  .media-collection--game .media-collection__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 28px;
  }

  .media-collection--anime .media-collection__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .media-collection--game .media-collection__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .media-collection--anime .media-collection__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px 16px;
  }

  .media-card--game {
    min-height: 112px;
    padding: 20px 0;
  }

  .media-card__title {
    font-size: 17px;
  }

  .media-card--anime .media-card__title {
    font-size: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-card__arrow,
  .media-card__image {
    transition: none;
  }

  a.media-card:is(:hover, :focus-visible) .media-card__image {
    transform: none;
  }

  a.media-card:hover .media-card__arrow {
    transform: none;
  }
}
</style>

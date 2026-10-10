<!-- 展示站主体：按公开 API 编排代码、文章、游戏与动画展区，管理筛选、分页、原生弹窗、滚动动效与背景装饰。 -->
<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AppIcon from "./components/AppIcon.vue";
import ContributionCalendar from "./components/ContributionCalendar.vue";
import MediaCollection from "./components/MediaCollection.vue";
import MotionHeading from "./components/MotionHeading.vue";
import PatternAccent from "./components/PatternAccent.vue";
import SourceStatus from "./components/SourceStatus.vue";
import TechStack from "./components/TechStack.vue";
import { useScrollMotion } from "./composables/useScrollMotion";
import { useShowcaseData } from "./data/useShowcaseData";
import type {
  BangumiCategory,
  ModuleId,
  ShowcaseArticle,
  ShowcaseProject,
} from "./data/types";
import { contactHref } from "./config/contact";

// 三维装置延迟加载，文字、导航和公开数据不依赖 WebGL 初始化。
const HeroSculpture = defineAsyncComponent(
  () => import("./components/HeroSculpture.vue"),
);
const {
  data,
  loading,
  error,
  isMock,
  refresh,
  moduleStates,
  bangumiCategory,
  setBangumiCategory,
  loadMore,
} = useShowcaseData({
  modules: [
    "github.profile",
    "github.pinned",
    "github.language-stats",
    "github.activity",
    "github.contributions",
    "neoblog.articles",
    "steam.profile",
    "steam.status",
    "steam.games",
    "bangumi.collections",
    "L07",
    "L08",
    "contacts",
  ],
  pageSize: 12,
});
const page = ref<HTMLElement>();
const scrollMotion = useScrollMotion(page);
const dialog = ref<HTMLDialogElement>();
const menuOpen = ref(false);
const activeSection = ref("home");
const projectFilter = ref("全部");
const selectedProject = ref<ShowcaseProject | null>(null);
const selectedArticle = ref<ShowcaseArticle | null>(null);
const showContact = ref(false);
const copyMessage = ref("");
const failedImages = ref(new Set<string>());
const categories = computed(() => [
  "全部",
  ...new Set(data.value.projects.map((item) => item.language || item.category)),
]);
const projects = computed(() =>
  data.value.projects.filter(
    (item) =>
      projectFilter.value === "全部" ||
      (item.language || item.category) === projectFilter.value,
  ),
);
const games = computed(() =>
  data.value.collections.filter((item) => item.category === "game"),
);
const anime = computed(() =>
  data.value.collections.filter((item) => item.category === "anime"),
);
const bangumiCategories: { id: BangumiCategory; label: string }[] = [
  { id: "watched", label: "看过" },
  { id: "watching", label: "在看" },
  { id: "want", label: "想看" },
  { id: "on_hold", label: "搁置" },
  { id: "dropped", label: "抛弃" },
];
const goalLabels = {
  active: "学习中",
  planned: "计划中",
  paused: "暂停中",
  completed: "已完成",
};
const nav = computed(() => [
  ...(exposed("github.pinned", "github.language-stats", "github.activity", "github.contributions")
    ? [{ id: "work", label: "代码" }]
    : []),
  ...(exposed("neoblog.articles") ? [{ id: "journal", label: "文字" }] : []),
  ...(exposed("steam.profile", "steam.games", "bangumi.collections")
    ? [{ id: "offscreen", label: "日常" }]
    : []),
  { id: "about", label: "关于" },
  ...(exposed('contacts') ? [{ id: "contact", label: "联系" }] : []),
]);
const firstSection = computed(() => nav.value[0]?.id ?? "about");
const dialogTitle = computed(
  () =>
    selectedProject.value?.title ??
    selectedArticle.value?.title ??
    "从一句你好开始。",
);
let media: gsap.MatchMedia | undefined;
let observer: IntersectionObserver | undefined;
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
let copyTimer: ReturnType<typeof setTimeout> | undefined;

/** 模块关闭时移除展区，读取中、空内容和请求失败分别保持自己的状态。 */
function exposed(...ids: ModuleId[]) {
  return ids.some((id) => moduleStates.value[id]?.state !== "hidden");
}
function busy(id: ModuleId) {
  return ["idle", "loading"].includes(moduleStates.value[id]?.state ?? "idle");
}
function total(id: ModuleId, count: number) {
  return moduleStates.value[id]?.pagination?.total ?? count;
}
/** 追加读取时保留按钮节点，让键盘焦点不会因临时加载状态丢失。 */
function moreVisible(id: ModuleId) {
  const state = moduleStates.value[id];
  return (
    state?.pagination?.hasMore === true &&
    ["ready", "loading"].includes(state.state)
  );
}
async function showMore(id: ModuleId, event: MouseEvent) {
  const trigger =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const region = trigger?.closest(
    ".collection-block, .activity-panel, .goals-list, section",
  );
  await loadMore(id);
  await nextTick();
  // 最后一页或公开撤回会移除按钮，焦点转到仍在页面中的展区标题或首页入口。
  if (trigger?.isConnected && document.activeElement === document.body) {
    trigger.focus({ preventScroll: true });
  } else if (trigger && !trigger.isConnected && document.activeElement === document.body) {
    const heading = region?.isConnected
      ? region.querySelector<HTMLElement>("h3, h2")
      : null;
    const target =
      heading || page.value?.querySelector<HTMLElement>(".wordmark");
    if (target) {
      if (heading) heading.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
}
/** 分类读取期间不展示上一分类的总量，避免旧分页元数据被误解成新的计数。 */
function countLabel(id: ModuleId, count: number, suffix = "") {
  const state = moduleStates.value[id]?.state;
  if (busy(id)) return "读取中…";
  if (state === "unavailable") return "暂不可用";
  if (state === "error") return "读取失败";
  return String(total(id, count)) + suffix;
}
function emptyMessage(id: ModuleId, empty: string) {
  const state = moduleStates.value[id];
  if (busy(id)) return "正在读取公开内容…";
  if (state?.state === "error") return state.error || "内容读取失败，请重试。";
  if (state?.state === "unavailable") return "公开内容暂不可用。";
  return empty;
}
function dateLabel(value: string) {
  // 日历日期直接格式化，避免时区换算让贡献日期偏移一天。
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ".");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "日期未知"
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(date)
        .replaceAll("/", ".");
}
function imageFailed(key: string) {
  failedImages.value.add(key);
}
function navigate() {
  menuOpen.value = false;
}
function closeMenu() {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  page.value?.querySelector<HTMLButtonElement>(".mobile-toggle")?.focus();
}

/** 原生 dialog 约束焦点并支持 Escape；关闭后恢复触发按钮和页面滚动。 */
async function openDetail(
  kind: "project" | "article" | "contact",
  value?: ShowcaseProject | ShowcaseArticle,
) {
  selectedProject.value =
    kind === "project" ? (value as ShowcaseProject) : null;
  selectedArticle.value =
    kind === "article" ? (value as ShowcaseArticle) : null;
  showContact.value = kind === "contact";
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  await nextTick();
  if (!dialog.value || dialog.value.open) return;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  dialog.value.showModal();
  dialog.value.scrollTop = 0;
}
function closeDetail() {
  dialog.value?.close();
}
function afterClose() {
  document.body.style.overflow = previousOverflow;
  // 公开条目撤回后，原触发按钮可能已移除，此时把焦点交还稳定的首页入口。
  const focusTarget = previousFocus?.isConnected
    ? previousFocus
    : page.value?.querySelector<HTMLElement>(".wordmark");
  focusTarget?.focus({ preventScroll: true });
  selectedProject.value = null;
  selectedArticle.value = null;
  showContact.value = false;
  copyMessage.value = "";
  clearTimeout(copyTimer);
}
/** 剪贴板不可用时保留可选中的联系方式文本；不要求自定义账号必须有跳转链接。 */
async function copyContact(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copyMessage.value = "联系方式已复制";
  } catch {
    copyMessage.value = "请选中联系方式文字后手动复制";
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyMessage.value = "";
  }, 4000);
}
/** 公开模块、筛选和分页改变布局后，保留已有动效状态并注册新节点。 */
async function syncSections() {
  await nextTick();
  observer?.disconnect();
  page.value
    ?.querySelectorAll("section[id]")
    .forEach((section) => observer?.observe(section));
  scrollMotion.sync();
}
onMounted(() => {
  if (!page.value) return;
  media = gsap.matchMedia();
  media.add(
    "(prefers-reduced-motion: no-preference)",
    () => {
      gsap.to(".hero-name", {
        y: -52,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      });
      gsap.to(".manifesto-text", {
        xPercent: -12,
        ease: "none",
        scrollTrigger: {
          trigger: ".manifesto",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.7,
        },
      });
    },
    page.value,
  );
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) activeSection.value = entry.target.id;
    },
    { rootMargin: "-15% 0px -65% 0px" },
  );
  void syncSections();
});
watch([data, moduleStates, projectFilter], syncSections, { deep: true });
// 模块关闭后联系弹窗同步退出，避免保留已经撤回的入口。
watch(() => exposed('contacts'), visible => { if (!visible && showContact.value) closeDetail(); });
// 刷新、分页失败或模块撤回都可能清除公开列表，弹窗不能继续保留已撤回的数据副本。
watch([() => data.value.projects, () => data.value.articles], () => {
  if (selectedProject.value) {
    const current = data.value.projects.find(
      (item) => item.slug === selectedProject.value?.slug,
    );
    if (!current) closeDetail();
    else selectedProject.value = current;
  }
  if (selectedArticle.value) {
    const current = data.value.articles.find(
      (item) => item.id === selectedArticle.value?.id,
    );
    if (!current) closeDetail();
    else selectedArticle.value = current;
  }
});
watch(categories, (next) => {
  if (!next.includes(projectFilter.value)) projectFilter.value = "全部";
});
onUnmounted(() => {
  media?.revert();
  observer?.disconnect();
  clearTimeout(copyTimer);
  if (dialog.value?.open) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <div ref="page" class="exhibition" @keydown.esc="closeMenu">
    <a class="skip-link" href="#main">跳到正文</a>
    <header class="site-header">
      <a
        class="wordmark"
        href="#home"
        aria-label="AoralsFout 首页"
        @click="navigate"
        >af<span class="wordmark-dot">.</span></a
      >
      <span class="header-note mono">INDEPENDENT MIND. CURIOUS HANDS.</span>
      <nav class="desktop-nav" aria-label="主要导航">
        <a
          v-for="item in nav"
          :key="item.id"
          :href="'#' + item.id"
          :aria-current="activeSection === item.id ? 'location' : undefined"
          ><span>{{ item.label }}</span
          ><AppIcon :size="12"
        /></a>
      </nav>
      <button
        class="mobile-toggle icon-button"
        :aria-expanded="menuOpen"
        aria-controls="mobile-nav"
        :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
        @click="menuOpen = !menuOpen"
      >
        <AppIcon :name="menuOpen ? 'close' : 'menu'" />
      </button>
    </header>
    <nav
      v-if="menuOpen"
      id="mobile-nav"
      class="mobile-nav"
      aria-label="移动端导航"
    >
      <a
        v-for="item in nav"
        :key="item.id"
        :href="'#' + item.id"
        @click="navigate"
        >{{ item.label }}<AppIcon
      /></a>
    </nav>
    <main id="main">
      <section id="home" class="hero textured-section" aria-labelledby="hero-title">
        <PatternAccent variant="matrix" tone="light" class="hero-pattern-accent" />
        <div class="hero-topline mono">
          <span>PERSONAL DIGITAL EXHIBITION</span
          ><span>CODE × EVERYDAY LIFE</span
          ><span class="hero-edition">VOL. 01 / ONGOING</span>
        </div>
        <div class="hero-grid">
          <div class="hero-kicker" data-motion-segment>
            <span class="small-cross">+</span><span>保持好奇。持续创造。</span>
          </div>
          <h1 id="hero-title" class="hero-name" aria-label="AoralsFout" data-motion-heading>
            <span class="hero-name-line" aria-hidden="true"><span data-motion-char>AORALS</span></span
            ><span class="hero-name-line" aria-hidden="true"
              ><span data-motion-char>FOUT<span class="name-period">.</span></span></span
            >
          </h1>
          <div class="hero-sculpture-stage">
            <HeroSculpture /><span class="sculpture-note mono"
              >FORM / IN MOTION</span
            >
          </div>
          <div class="hero-intro" data-motion-segment>
            <span class="hero-intro-label mono">HELLO, I'M AORALSFOUT.</span>
            <p>
              代码里的一点想法，<br />和屏幕之外的<span class="yellow-underline"
                >日常。</span
              >
            </p>
            <a :href="'#' + firstSection" class="hero-cta"
              >逛逛我的小世界<AppIcon :size="19"
            /></a>
          </div>
          <div class="hero-coordinate mono" aria-hidden="true">
            <span>GITHUB / NEOBLOG</span><span>STEAM / BANGUMI</span
            ><span>ALWAYS EXPLORING</span>
          </div>
        </div>
        <div class="hero-bottom mono">
          <span>BUILDING, LEARNING, REPEAT.</span
          ><a :href="'#' + firstSection"
            >SCROLL TO EXPLORE<AppIcon name="down" :size="17" /></a
          ><span>想法、记录，以及喜欢的事物。</span>
        </div>
      </section>

      <section
        v-if="
          exposed('github.pinned', 'github.language-stats', 'github.activity', 'github.contributions')
        "
        id="work"
        class="work-section section-shell textured-section"
        aria-labelledby="work-title"
      >
        <PatternAccent variant="stripes" class="work-pattern-accent" />
        <div class="section-label mono">
          <span class="label-square"></span>01 / BUILT IN CODE
          <span v-if="isMock" class="sample-label">演示数据</span>
        </div>
        <div class="section-title-row">
          <MotionHeading
            id="work-title"
            :lines="[[{ text: '想法，' }], [{ text: '变成代码。', tone: 'muted' }]]"
          />
          <p>
            桌面 AI、个人网站、音乐与游戏。<br />从 GitHub
            置顶仓库，看看我正在做的事。
          </p>
        </div>
        <template v-if="exposed('github.pinned')">
          <div class="work-toolbar">
            <div class="filter-list" role="group" aria-label="筛选项目语言">
              <button
                v-for="category in categories"
                :key="category"
                :class="{ active: projectFilter === category }"
                :aria-pressed="projectFilter === category"
                @click="projectFilter = category"
              >
                {{ category
                }}<span v-if="category === '全部'" class="mono">{{
                  total("github.pinned", data.projects.length)
                }}</span>
              </button>
            </div>
            <SourceStatus :state="moduleStates['github.pinned']" />
          </div>
          <div class="repo-grid">
            <button
              v-for="(project, index) in projects"
              :key="project.slug"
              class="repo-card"
              :class="{
                'repo-featured': index === 0 && projectFilter === '全部',
              }"
              @click="openDetail('project', project)"
            >
              <div class="repo-top mono">
                <span
                  >{{ String(index + 1).padStart(2, "0") }} /
                  {{ project.language || project.category }}</span
                ><span v-if="project.stars !== undefined"
                  >☆ {{ project.stars }}</span
                >
              </div>
              <h3>{{ project.title }}</h3>
              <p>{{ project.description || "这个仓库暂时没有填写介绍。" }}</p>
              <div class="repo-bottom">
                <span class="mono">{{ project.fullName || project.title }}</span
                ><span class="repo-open"><AppIcon :size="22" /></span>
              </div>
            </button>
          </div>
          <p v-if="!projects.length" class="empty-message" role="status">
            {{ emptyMessage("github.pinned", "暂无公开置顶项目。") }}
          </p>
          <button
            v-if="moreVisible('github.pinned')"
            class="load-more"
            :disabled="busy('github.pinned')"
            @click="showMore('github.pinned', $event)"
          >
            {{ busy("github.pinned") ? "读取中…" : "加载更多项目"
            }}<AppIcon name="down" :size="16" />
          </button>
        </template>
        <TechStack
          v-if="exposed('github.language-stats')"
          :stats="data.languageStats"
          :state="moduleStates['github.language-stats']"
          :empty-message="emptyMessage('github.language-stats', '暂无语言统计数据。')"
        />
        <div
          v-if="exposed('github.contributions', 'github.activity')"
          class="code-records"
        >
          <div
            v-if="exposed('github.contributions')"
            class="contribution-panel"
          >
            <div class="subheading">
              <h3>持续留下痕迹。</h3>
              <SourceStatus :state="moduleStates['github.contributions']" />
            </div>
            <ContributionCalendar
              v-if="data.contributions"
              :contributions="data.contributions"
            />
            <p v-else class="empty-message" role="status">
              {{ emptyMessage("github.contributions", "暂无公开贡献记录。") }}
            </p>
          </div>
          <div v-if="exposed('github.activity')" class="activity-panel">
            <div class="subheading">
              <h3>最近的开发动态</h3>
              <SourceStatus :state="moduleStates['github.activity']" />
            </div>
            <div class="activity-list">
              <component
                :is="item.url ? 'a' : 'div'"
                v-for="item in data.activity"
                :key="item.id"
                class="activity-row"
                :href="item.url"
                :target="item.url ? '_blank' : undefined"
                :rel="item.url ? 'noopener noreferrer' : undefined"
                ><span class="activity-dot"></span>
                <div>
                  <span class="activity-label">{{ item.title }}</span
                  ><strong>{{ item.repo }}</strong>
                </div>
                <span class="mono">{{ dateLabel(item.date) }}</span
                ><AppIcon v-if="item.url" :size="15"
              /></component>
            </div>
            <p v-if="!data.activity.length" class="empty-message" role="status">
              {{ emptyMessage("github.activity", "暂无公开开发动态。") }}
            </p>
            <button
              v-if="moreVisible('github.activity')"
              class="load-more"
              :disabled="busy('github.activity')"
              @click="showMore('github.activity', $event)"
            >
              {{ busy("github.activity") ? "读取中…" : "更多动态"
              }}<AppIcon name="down" :size="16" />
            </button>
            <p
              v-if="
                moduleStates['github.activity']?.error && data.activity.length
              "
              class="inline-error"
              role="status"
            >
              {{ moduleStates["github.activity"]?.error }}
            </p>
          </div>
        </div>
      </section>

      <section
        v-if="exposed('neoblog.articles')"
        id="journal"
        class="journal-section section-shell textured-section"
        aria-labelledby="journal-title"
      >
        <div class="section-label mono">
          <span class="label-square"></span>02 / NOTES & THOUGHTS
        </div>
        <div class="section-title-row">
          <MotionHeading
            id="journal-title"
            :lines="[[{ text: '写下来的' }, { text: '过程。', tone: 'blue' }]]"
          />
          <div>
            <p>
              把探索变成记录，再把记录变成下一步。<br />{{
                total("neoblog.articles", data.articles.length)
              }}
              篇来自 NeoBlog 的文章。
            </p>
            <SourceStatus :state="moduleStates['neoblog.articles']" />
          </div>
        </div>
        <div class="article-grid">
          <button
            v-for="article in data.articles"
            :key="article.id"
            class="article-card"
            @click="openDetail('article', article)"
          >
            <div class="article-cover">
              <img
                v-if="
                  article.coverImage &&
                  !failedImages.has('article-' + article.id)
                "
                :src="article.coverImage"
                alt=""
                loading="lazy"
                @error="imageFailed('article-' + article.id)"
              />
              <div v-else class="cover-fallback" aria-hidden="true">
                <span class="mono">NEOBLOG / FIELD NOTES</span
                ><strong>记录<br />进行时<span>.</span></strong>
              </div>
              <span class="article-arrow"><AppIcon :size="22" /></span>
            </div>
            <div class="article-card-body">
              <div class="article-top mono">
                <span>{{ dateLabel(article.date) }}</span
                ><span v-if="article.readingMinutes > 0"
                  >{{ article.readingMinutes }} 分钟阅读</span
                >
              </div>
              <h3>{{ article.title }}</h3>
              <p>{{ article.summary }}</p>
              <div class="article-tags">
                <span v-for="tag in article.tags" :key="tag">{{ tag }}</span>
              </div>
            </div>
          </button>
        </div>
        <p v-if="!data.articles.length" class="empty-message" role="status">
          {{ emptyMessage("neoblog.articles", "暂无公开文章。") }}
        </p>
        <button
          v-if="moreVisible('neoblog.articles')"
          class="load-more"
          :disabled="busy('neoblog.articles')"
          @click="showMore('neoblog.articles', $event)"
        >
          {{ busy("neoblog.articles") ? "读取中…" : "加载更多文章"
          }}<AppIcon name="down" :size="16" />
        </button>
      </section>

      <div class="manifesto" aria-hidden="true">
        <div class="manifesto-text">
          STAY CURIOUS.<span>✳</span>ENJOY THE EVERYDAY.<span>✳</span>STAY
          CURIOUS.
        </div>
      </div>

      <section
        v-if="exposed('steam.profile', 'steam.games', 'bangumi.collections')"
        id="offscreen"
        class="offscreen-section section-shell textured-section"
        aria-labelledby="offscreen-title"
      >
        <PatternAccent variant="dots" class="offscreen-pattern-accent" />
        <div class="section-label mono">
          <span class="label-square"></span>03 / AFTER THE SCREEN
        </div>
        <div class="section-title-row">
          <MotionHeading
            id="offscreen-title"
            :lines="[[{ text: '也有，' }, { text: '喜欢的日常。', tone: 'blue' }]]"
          />
          <p>
            游戏里的时间，动画里的故事。<br />从 Steam 与 Bangumi
            收集一些生活切片。
          </p>
        </div>
        <div
          v-if="exposed('steam.profile', 'steam.games')"
          class="collection-block"
        >
          <div class="collection-heading">
            <div class="collection-identity">
              <img
                v-if="
                  data.steamProfile?.avatar && !failedImages.has('steam-avatar')
                "
                :src="data.steamProfile.avatar"
                alt=""
                width="48"
                height="48"
                loading="lazy"
                @error="imageFailed('steam-avatar')"
              />
              <div>
                <span class="mono">STEAM / PLAY</span>
                <h3>{{ data.steamProfile?.name || "游戏库" }}</h3>
              </div>
            </div>
            <div class="collection-heading-meta">
              <span v-if="exposed('steam.games')" class="collection-count">{{
                countLabel("steam.games", games.length, " 项游戏")
              }}</span
              ><a
                v-if="data.steamProfile?.url"
                :href="data.steamProfile.url"
                target="_blank"
                rel="noopener noreferrer"
                >Steam 主页<AppIcon :size="14"
              /></a>
            </div>
          </div>
          <div class="source-row">
            <SourceStatus
              :state="
                moduleStates['steam.games'] || moduleStates['steam.profile']
              "
            /><span v-if="data.steamStatus" class="steam-status"
              >{{ data.steamStatus.label
              }}<template v-if="data.steamStatus.gameName">
                · {{ data.steamStatus.gameName }}</template
              ></span
            ><span
              v-else-if="exposed('steam.status') && !busy('steam.status')"
              class="steam-status"
              >当前状态暂不可用</span
            >
          </div>
          <template v-if="exposed('steam.games')"
            ><MediaCollection
              :items="games"
              kind="game"
              :loading="busy('steam.games')"
              :error="moduleStates['steam.games']?.error"
              :empty-message="emptyMessage('steam.games', '暂无公开游戏。')" />
            <div class="collection-bottom">
              <span class="mono"
                >已显示 {{ games.length }} /
                {{ total("steam.games", games.length) }}</span
              ><button
                v-if="moreVisible('steam.games')"
                class="load-more"
                :disabled="busy('steam.games')"
                @click="showMore('steam.games', $event)"
              >
                {{ busy("steam.games") ? "读取中…" : "更多游戏"
                }}<AppIcon name="down" :size="16" />
              </button></div
          ></template>
        </div>
        <div
          v-if="exposed('bangumi.collections')"
          class="collection-block anime-block"
        >
          <div class="collection-heading">
            <div>
              <span class="mono">BANGUMI / WATCH</span>
              <h3>我的动画书架</h3>
            </div>
            <div class="collection-heading-meta">
              <span class="collection-count">{{
                countLabel(
                  "bangumi.collections",
                  anime.length,
                  " 部" +
                    bangumiCategories.find(
                      (item) => item.id === bangumiCategory,
                    )?.label,
                )
              }}</span
              ><SourceStatus :state="moduleStates['bangumi.collections']" />
            </div>
          </div>
          <div
            class="filter-list anime-filters"
            role="group"
            aria-label="筛选动画收藏状态"
          >
            <button
              v-for="category in bangumiCategories"
              :key="category.id"
              :class="{ active: bangumiCategory === category.id }"
              :aria-pressed="bangumiCategory === category.id"
              @click="setBangumiCategory(category.id)"
            >
              {{ category.label }}
            </button>
          </div>
          <MediaCollection
            :items="anime"
            kind="anime"
            :loading="busy('bangumi.collections')"
            :error="moduleStates['bangumi.collections']?.error"
            :empty-message="
              emptyMessage('bangumi.collections', '这个分类暂无公开动画。')
            "
          />
          <div class="collection-bottom">
            <span class="mono"
              >已显示 {{ anime.length }} /
              {{ countLabel("bangumi.collections", anime.length) }}</span
            ><button
              v-if="moreVisible('bangumi.collections')"
              class="load-more"
              :disabled="busy('bangumi.collections')"
              @click="showMore('bangumi.collections', $event)"
            >
              {{ busy("bangumi.collections") ? "读取中…" : "更多动画"
              }}<AppIcon name="down" :size="16" />
            </button>
          </div>
        </div>
      </section>

      <section
        id="about"
        class="about-section section-shell textured-section"
        aria-labelledby="about-title"
      >
        <div class="about-grid">
          <div class="about-side">
            <div class="section-label mono">
              <span class="label-square"></span>04 / A LITTLE ABOUT ME
            </div>
            <div class="about-symbol" aria-hidden="true">
              <span>a</span><span>f</span><i></i>
            </div>
          </div>
          <div class="about-copy">
            <MotionHeading
              id="about-title"
              class="about-statement"
              :lines="[[{ text: '写代码。' }], [{ text: '也' }, { text: '认真生活。', tone: 'blue' }]]"
            />
            <div class="profile-heading">
              <img
                v-if="data.profile.avatar && !failedImages.has('github-avatar')"
                :src="data.profile.avatar"
                alt=""
                width="56"
                height="56"
                loading="lazy"
                @error="imageFailed('github-avatar')"
              />
              <div>
                <strong>{{ data.profile.name }}</strong
                ><span class="mono">@{{ data.profile.handle }}</span>
              </div>
            </div>
            <p v-if="data.profile.bio">{{ data.profile.bio }}</p>
            <div
              v-if="data.profile.publicRepos !== undefined"
              class="profile-stats"
            >
              <span
                ><strong>{{ data.profile.publicRepos }}</strong
                >公开仓库</span
              ><span v-if="data.profile.followers !== undefined"
                ><strong>{{ data.profile.followers }}</strong
                >关注者</span
              ><span v-if="data.profile.following !== undefined"
                ><strong>{{ data.profile.following }}</strong
                >正在关注</span
              >
            </div>
            <div v-if="exposed('github.profile')" class="profile-source">
              <SourceStatus :state="moduleStates['github.profile']" />
            </div>
            <a
              v-if="data.profile.githubUrl"
              class="text-link"
              :href="data.profile.githubUrl"
              target="_blank"
              rel="noopener noreferrer"
              >我的 GitHub<AppIcon :size="16"
            /></a>
          </div>
        </div>
        <div v-if="data.status || data.goals.length" class="now-panel">
          <div class="section-label mono">NOW / 此刻</div>
          <div class="now-content">
            <div v-if="data.status" class="now-status">
              <h3>{{ data.status.label || "最近在折腾什么？" }}</h3>
              <p>{{ data.status.text }}</p>
            </div>
            <div v-if="data.goals.length" class="goals-list">
              <div v-for="goal in data.goals" :key="goal.id" class="goal">
                <div class="goal-top">
                  <span>{{ goal.title }}</span
                  ><span class="mono">{{
                    goal.progress !== null
                      ? goal.progress + "%"
                      : goalLabels[goal.status]
                  }}</span>
                </div>
                <progress
                  v-if="goal.progress !== null"
                  :value="goal.progress"
                  max="100"
                  :aria-label="
                    goal.title +
                    '，' +
                    goalLabels[goal.status] +
                    '，进度 ' +
                    goal.progress +
                    '%'
                  "
                ></progress
                ><span class="goal-label">{{
                  goal.description || goalLabels[goal.status]
                }}</span>
              </div>
              <button
                v-if="moreVisible('L08')"
                class="load-more"
                :disabled="busy('L08')"
                @click="showMore('L08', $event)"
              >
                更多学习目标
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="exposed('contacts')"
        id="contact"
        class="contact-section section-shell textured-section"
        aria-labelledby="contact-title"
      >
        <div class="contact-top mono">
          <span><span class="label-square"></span>LET'S MAKE SOMETHING</span
          ><span>GOOD IDEAS START WITH A HELLO.</span>
        </div>
        <div class="contact-main">
          <MotionHeading
            id="contact-title"
            :lines="[[{ text: '有个想法？' }], [{ text: '聊' }, { text: '聊看。', tone: 'outline' }]]"
          />
          <button
            class="contact-orb"
            aria-label="查看联系方式"
            @click="openDetail('contact')"
          >
            <AppIcon :size="60" />
          </button>
        </div>
        <div class="contact-links">
          <div v-for="contact in data.contacts" :key="contact.id" class="contact-link-item">
            <span>{{ contact.label }}</span>
            <a v-if="contactHref(contact)" :href="contactHref(contact)" :target="contact.url ? '_blank' : undefined" rel="noopener noreferrer">{{ contact.value }}<AppIcon :size="18" /></a>
            <span v-else class="contact-value">{{ contact.value }}</span>
          </div>
        </div>
        <p v-if="!data.contacts.length" role="status">{{ emptyMessage('contacts', '暂无公开联系方式。') }}</p>
        <button v-if="moreVisible('contacts')" class="load-more" :disabled="busy('contacts')" @click="showMore('contacts', $event)">{{ busy('contacts') ? '读取中…' : '更多联系方式' }}</button>
      </section>
    </main>
    <footer class="site-footer">
      <span class="footer-brand">AoralsFout<span>.</span></span
      ><span class="mono">DESIGNED WITH INTENT. BUILT WITH CURIOSITY.</span
      ><a href="#home">回到顶部<AppIcon :size="15" /></a>
    </footer>
    <div v-if="loading || error || isMock" class="data-notice" role="status">
      <span>{{
        loading
          ? "正在读取公开内容…"
          : error
            ? "部分公开内容读取失败。"
            : "当前为演示数据模式。"
      }}</span
      ><button v-if="error && !loading" @click="refresh">重新加载</button>
    </div>
    <dialog
      ref="dialog"
      class="detail-dialog"
      aria-labelledby="detail-title"
      @close="afterClose"
      @click="
        (event) => {
          if (event.target === dialog) closeDetail();
        }
      "
    >
      <div class="detail-inner">
        <button
          class="detail-close icon-button"
          aria-label="关闭详情"
          autofocus
          @click="closeDetail"
        >
          <AppIcon name="close" />
        </button>
        <div v-if="selectedProject" class="detail-body project-detail">
          <span class="section-label mono"
            >GITHUB /
            {{ selectedProject.fullName || selectedProject.title }}</span
          >
          <h2 id="detail-title">{{ dialogTitle }}</h2>
          <div class="repo-detail-stats">
            <span v-if="selectedProject.language">{{
              selectedProject.language
            }}</span
            ><span v-if="selectedProject.stars !== undefined"
              >☆ {{ selectedProject.stars }} Stars</span
            >
          </div>
          <p class="detail-lead">
            {{ selectedProject.description || "这个仓库暂时没有填写介绍。" }}
          </p>
          <template v-if="selectedProject.challenge"
            ><h3>从问题出发</h3>
            <p
              v-for="(paragraph, index) in selectedProject.challenge"
              :key="index"
            >
              {{ paragraph }}
            </p></template
          ><template v-if="selectedProject.outcome"
            ><h3>把想法落地</h3>
            <p
              v-for="(paragraph, index) in selectedProject.outcome"
              :key="index"
            >
              {{ paragraph }}
            </p></template
          >
          <div class="detail-links">
            <a
              v-if="selectedProject.url"
              class="text-link"
              :href="selectedProject.url"
              target="_blank"
              rel="noopener noreferrer"
              >查看 GitHub 仓库<AppIcon :size="18" /></a
            ><a
              v-if="selectedProject.homepage"
              class="text-link"
              :href="selectedProject.homepage"
              target="_blank"
              rel="noopener noreferrer"
              >项目主页<AppIcon :size="18"
            /></a>
          </div>
        </div>
        <div v-else-if="selectedArticle" class="detail-body article-detail">
          <span class="section-label mono"
            >NEOBLOG / {{ dateLabel(selectedArticle.date) }}</span
          >
          <h2 id="detail-title">{{ dialogTitle }}</h2>
          <p class="detail-lead">{{ selectedArticle.summary }}</p>
          <p
            v-for="(paragraph, index) in selectedArticle.content || []"
            :key="index"
          >
            {{ paragraph }}
          </p>
          <div class="article-tags">
            <span v-for="tag in selectedArticle.tags" :key="tag">{{
              tag
            }}</span>
          </div>
          <a
            v-if="selectedArticle.url"
            class="text-link"
            :href="selectedArticle.url"
            target="_blank"
            rel="noopener noreferrer"
            >阅读原文<AppIcon :size="18"
          /></a>
          <p v-else class="detail-footnote">
            这篇文章暂时没有可访问的原文链接。
          </p>
        </div>
        <div v-else-if="showContact" class="detail-body contact-detail">
          <span class="section-label mono">SAY HELLO</span>
          <h2 id="detail-title">{{ dialogTitle }}</h2>
          <p class="detail-lead">关于一个项目、一点灵感，或者只是打个招呼。</p>
          <div v-for="contact in data.contacts" :key="contact.id" class="contact-detail-row">
            <div><span>{{ contact.label }}</span><a v-if="contactHref(contact)" :href="contactHref(contact)" :target="contact.url ? '_blank' : undefined" rel="noopener noreferrer">{{ contact.value }}</a><span v-else class="contact-value">{{ contact.value }}</span></div>
            <button class="icon-button" :aria-label="'复制' + contact.label" @click="copyContact(contact.value)"><AppIcon name="copy" :size="19" /></button>
          </div>
          <p v-if="!data.contacts.length" role="status">{{ emptyMessage('contacts', '暂无公开联系方式。') }}</p>
          <button v-if="moreVisible('contacts')" class="load-more" :disabled="busy('contacts')" @click="loadMore('contacts')">更多联系方式</button>
          <p class="copy-status" role="status">{{ copyMessage }}</p>
        </div>
      </div>
    </dialog>
  </div>
</template>

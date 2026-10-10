/** 展示数据组合式函数；默认读取公开 API，导出内容与联系方式、模块状态、分类和分页操作，样例模式须显式启用。 */
import { computed, onMounted, onScopeDispose, ref } from "vue";
import { createMockShowcaseData } from "./mock";
import type {
  Accent,
  BangumiCategory,
  ContributionDay,
  DataMode,
  GoalStatus,
  ModuleId,
  ModuleSource,
  ShowcaseActivity,
  ShowcaseArticle,
  ShowcaseCollection,
  ShowcaseContributions,
  ShowcaseContactMethod,
  ShowcaseData,
  ShowcaseGoal,
  ShowcaseMetadata,
  ShowcaseModuleState,
  ShowcasePagination,
  ShowcaseProfile,
  ShowcaseProject,
  ShowcaseRepositoryLanguages,
  ShowcaseStatus,
  ShowcaseSteamProfile,
  ShowcaseSteamStatus,
} from "./types";

type JsonObject = Record<string, unknown>;
interface PublicModule {
  id: ModuleId;
  source: ModuleSource;
  available: boolean;
}
interface ApiEnvelope {
  data: unknown;
  pagination?: ShowcasePagination;
  meta?: ShowcaseMetadata;
}
export interface ShowcaseDataOptions {
  mode?: DataMode;
  apiBase?: string;
  /** 仅加载页面实际使用的模块；活动、贡献图和语言构成默认不请求。 */
  modules?: readonly ModuleId[];
  pageSize?: number;
}

const moduleIds: ModuleId[] = [
  "github.profile",
  "github.pinned",
  "github.languages",
  "github.activity",
  "github.contributions",
  "steam.profile",
  "steam.status",
  "steam.games",
  "bangumi.collections",
  "neoblog.articles",
  "L07",
  "L08",
  "contacts",
];
const defaultModules = moduleIds.filter(
  (id) => id !== "github.activity" && id !== "github.contributions" && id !== "github.languages",
);
const listModules = new Set<ModuleId>([
  "github.pinned",
  "github.languages",
  "github.activity",
  "steam.games",
  "bangumi.collections",
  "neoblog.articles",
  "L08",
  "contacts",
]);
const bangumiCategories: BangumiCategory[] = [
  "watched",
  "watching",
  "want",
  "on_hold",
  "dropped",
];
const requestTimeout = 8_000;
const activityTitles: Record<string, string> = {
  PushEvent: "更新项目代码",
  CreateEvent: "创建新的项目内容",
  PullRequestEvent: "提交项目改进",
  IssuesEvent: "记录新的问题与想法",
  ReleaseEvent: "发布新的版本",
  WatchEvent: "收藏一个项目",
  ForkEvent: "探索一个开源项目",
  IssueCommentEvent: "参与项目讨论",
  PullRequestReviewEvent: "评审项目改进",
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}
function text(value: unknown, limit = 500): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, 100) : [];
}
function number(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;
}
function date(value: unknown): string {
  const input = text(value, 40);
  const timestamp = input ? Date.parse(input) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}
function sourceOf(id: ModuleId): ModuleSource {
  return id.startsWith("github.")
    ? "github"
    : id.startsWith("steam.")
      ? "steam"
      : id.startsWith("bangumi.")
        ? "bangumi"
        : id.startsWith("neoblog.")
          ? "neoblog"
          : "local";
}

/** 所有可操作链接和图片均限制为无内嵌凭据的 HTTP(S) 地址。 */
function safeUrl(value: unknown): string | undefined {
  const input = text(value, 2_000);
  if (!input) return undefined;
  try {
    const url = new URL(input);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** 固定身份与定位属于已确认的页面文案；公开资料缺失时不添加经历、统计或样例条目。 */
function emptyData(): ShowcaseData {
  return {
    profile: {
      name: "AoralsFout",
      handle: "aoralsfout",
      tagline: "设计与开发，把想法变成可触摸的体验。",
      bio: "",
      location: "",
    },
    status: null,
    projects: [],
    languages: [],
    articles: [],
    goals: [],
    contacts: [],
    activity: [],
    contributions: null,
    steamProfile: null,
    steamStatus: null,
    collections: [],
    sampleSections: [],
  };
}

/** 接受可展示的联系方式记录；无效链接保留为纯文本，不从外部数据推断额外联系方式。 */
function mapContacts(value: unknown): ShowcaseContactMethod[] {
  return list(value).flatMap(raw => {
    const item = object(raw), id = item?.id;
    const type = text(item?.type, 32), label = text(item?.label, 100), content = text(item?.value, 500);
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && type && label && content
      ? [{ id: String(id), type, label, value: content, url: safeUrl(item?.url) || null }]
      : [];
  });
}
function mapProfile(value: unknown): ShowcaseProfile {
  const base = emptyData().profile;
  const item = object(value);
  if (!item) return base;
  return {
    ...base,
    name: text(item.name, 100) || text(item.login, 100) || base.name,
    handle: text(item.login, 100) || base.handle,
    bio: text(item.bio, 1_000),
    avatar: safeUrl(item.avatar),
    githubUrl: safeUrl(item.url),
    publicRepos: number(item.publicRepos),
    followers: number(item.followers),
    following: number(item.following),
  };
}
function mapProjects(value: unknown): ShowcaseProject[] {
  const accents: Accent[] = ["blue", "yellow", "ink"];
  return list(value).flatMap((raw, index) => {
    const item = object(raw);
    const title = text(item?.name, 200);
    if (!item || !title) return [];
    const language = text(item.language, 60);
    const description = text(item.description, 2_000);
    const fullName = text(item.fullName, 300);
    return [
      {
        slug: fullName || title,
        title,
        subtitle: description,
        description,
        category: "开源项目",
        year: "",
        stack: language ? [language] : [],
        accent: accents[index % accents.length]!,
        featured: true,
        fullName,
        stars: number(item.stars),
        language: language || undefined,
        url: safeUrl(item.url),
        homepage: safeUrl(item.homepage),
      },
    ];
  });
}
/** 仅保留公开响应中的仓库和精确语言数值，不推断框架、技能或隐藏仓库。 */
function mapLanguages(value: unknown): ShowcaseRepositoryLanguages[] {
  return list(value).flatMap((raw) => {
    const item = object(raw);
    const name = text(item?.name, 200);
    const fullName = text(item?.fullName, 300);
    if (!item || !name || !fullName || !Array.isArray(item.languages)) return [];
    const languages = list(item.languages).flatMap((rawLanguage) => {
      const language = object(rawLanguage);
      const languageName = text(language?.name, 100);
      const bytes = language?.bytes;
      const percentage = language?.percentage;
      // 拒绝非法数值而不截断或重算，保持后端的字节数与百分比精度。
      if (!languageName || typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0 || typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return [];
      return [{ name: languageName, bytes, percentage }];
    });
    return [{ name, fullName, languages }];
  });
}

function mapStatus(value: unknown): ShowcaseStatus | null {
  const item = object(value);
  const content = text(item?.text, 500);
  if (!item || !content || item.visible === false) return null;
  const expiresAt = date(item.expiresAt);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
  return { text: content, label: "最近在做", updatedAt: date(item.updatedAt) };
}
function mapArticles(value: unknown): ShowcaseArticle[] {
  return list(value).flatMap((raw, index) => {
    const item = object(raw);
    const title = text(item?.title, 200);
    if (!item || !title) return [];
    const tags = list(item.tags)
      .map((tag) => text(tag, 60))
      .filter(Boolean)
      .slice(0, 12);
    const createdAt = date(item.createdAt);
    return [
      {
        id: text(String(item.id ?? index), 100),
        title,
        summary: text(item.summary, 1_000),
        category: tags[0] || "文章",
        date: createdAt,
        createdAt,
        updatedAt: date(item.updatedAt),
        tags,
        coverImage: safeUrl(item.coverImage),
        url: safeUrl(item.url),
        // 列表没有正文或阅读时长；摘要单独展示，不重复填入正文，也不猜测完整阅读时间。
        readingMinutes: 0,
        content: undefined,
      },
    ];
  });
}
function mapGoals(value: unknown): ShowcaseGoal[] {
  const statuses: GoalStatus[] = ["planned", "active", "paused", "completed"];
  return list(value).flatMap((raw, index) => {
    const item = object(raw);
    const title = text(item?.title, 100);
    if (!item || !title || item.visible === false) return [];
    const status = statuses.includes(item.status as GoalStatus)
      ? (item.status as GoalStatus)
      : "planned";
    return [
      {
        id: text(String(item.id ?? index), 100),
        title,
        description: text(item.description, 1_000),
        progress: number(item.progress, 0, 100) ?? null,
        status,
      },
    ];
  });
}
function mapActivity(value: unknown): ShowcaseActivity[] {
  return list(value).flatMap((raw, index) => {
    const item = object(raw);
    const repo = text(item?.repo, 200);
    if (!item || !repo) return [];
    const type = text(item.type, 60);
    const createdAt = date(item.createdAt);
    return [
      {
        id: `${type}-${repo}-${createdAt}-${index}`,
        type,
        title: activityTitles[type] || "新的项目动态",
        repo,
        date: createdAt,
        url: safeUrl(item.url),
      },
    ];
  });
}

/** 日历按公开日期排序并去重，颜色由次数计算，保留零贡献的真实日历。 */
function mapContributions(value: unknown): ShowcaseContributions | null {
  const item = object(value);
  if (!item) return null;
  const weeks = Array.isArray(item.weeks) ? item.weeks.slice(0, 60) : [];
  const days: ContributionDay[] = weeks.flatMap((rawWeek) => {
    const week = object(rawWeek);
    const rawDays = Array.isArray(week?.contributionDays)
      ? week.contributionDays.slice(0, 7)
      : [];
    return rawDays.flatMap((raw) => {
      const day = object(raw);
      const dayDate = date(day?.date).slice(0, 10);
      const count = number(day?.contributionCount, 0, 100_000);
      if (!dayDate || count === undefined) return [];
      const level: ContributionDay["level"] =
        count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 12 ? 3 : 4;
      return [{ date: dayDate, count: Math.floor(count), level }];
    });
  });
  const sorted = [...new Map(days.map((day) => [day.date, day])).values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  let streak = 0,
    longestStreak = 0,
    previousDate = 0;
  const activeWeeks = new Set<number>();
  for (const day of sorted) {
    const timestamp = Date.parse(day.date);
    if (timestamp - previousDate !== 86_400_000) streak = 0;
    streak = day.count > 0 ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
    if (day.count > 0)
      activeWeeks.add(
        Math.floor((timestamp + 3 * 86_400_000) / (7 * 86_400_000)),
      );
    previousDate = timestamp;
  }
  return {
    total:
      number(item.totalContributions) ??
      sorted.reduce((sum, day) => sum + day.count, 0),
    days: sorted,
    longestStreak,
    activeWeeks: activeWeeks.size,
  };
}
function mapSteamProfile(value: unknown): ShowcaseSteamProfile | null {
  const item = object(value);
  const name = text(item?.name, 100);
  if (!item || !name) return null;
  return {
    steamId: text(item.steamId, 100),
    name,
    avatar: safeUrl(item.avatar),
    url: safeUrl(item.url),
  };
}
function mapSteamStatus(value: unknown): ShowcaseSteamStatus | null {
  const item = object(value);
  const state = number(item?.state, 0, 6);
  if (!item || state === undefined) return null;
  const labels = [
    "离线",
    "在线",
    "忙碌",
    "离开",
    "暂离",
    "寻找交易",
    "寻找游戏",
  ];
  return {
    state,
    label: labels[state] || "状态未知",
    gameId: item.gameId == null ? null : text(String(item.gameId), 100),
    gameName: text(item.gameName, 200) || null,
  };
}
function mapCollections(
  value: unknown,
  category: "game" | "anime",
): ShowcaseCollection[] {
  const accents: Accent[] = ["ink", "blue", "yellow"];
  return list(value).flatMap((raw, index) => {
    const item = object(raw);
    const title = text(item?.name, 200);
    if (!item || !title) return [];
    const sourceId = text(String(item.appId ?? item.subjectId ?? index), 100);
    const minutes = number(item.playtimeMinutes);
    const rate = number(item.rate, 0, 10);
    const collectionStatus = bangumiCategories.includes(
      item.category as BangumiCategory,
    )
      ? (item.category as BangumiCategory)
      : undefined;
    return [
      {
        id: `${category}-${sourceId}`,
        sourceId,
        title,
        category,
        accent: accents[index % accents.length]!,
        // 时长、评分与分类由展示组件按真实字段呈现，不复制到副标题造成重复。
        subtitle: "",
        playtimeMinutes: category === "game" ? minutes : undefined,
        lastPlayedAt:
          category === "game" ? date(item.lastPlayedAt) || null : undefined,
        rate: category === "anime" ? rate : undefined,
        collectionStatus,
        image: safeUrl(category === "game" ? item.icon : item.image),
        url: safeUrl(item.url),
      },
    ];
  });
}

class PublicApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super("公开数据读取失败");
  }
}
function mapPagination(value: unknown): ShowcasePagination | undefined {
  const item = object(value);
  const page = number(item?.page, 1, 1_000_000),
    limit = number(item?.limit, 1, 100),
    total = number(item?.total);
  return page === undefined || limit === undefined || total === undefined
    ? undefined
    : { page, limit, total, hasMore: page * limit < total };
}
function mapMeta(value: unknown): ShowcaseMetadata | undefined {
  const item = object(value);
  const id = text(item?.moduleId, 100) as ModuleId;
  const freshness = item?.freshness;
  if (
    !item ||
    !moduleIds.includes(id) ||
    !["fresh", "stale", "unavailable"].includes(String(freshness))
  )
    return undefined;
  return {
    moduleId: id,
    source: sourceOf(id),
    updatedAt: date(item.updatedAt) || null,
    freshness: freshness as ShowcaseMetadata["freshness"],
  };
}

/** 仅公开 GET 请求；响应体计入超时，错误页也保留 HTTP 状态，不发送身份 Cookie。 */
async function requestPublic(
  base: string,
  path: string,
  signal: AbortSignal,
): Promise<ApiEnvelope> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, requestTimeout);
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if ([401, 403, 404].includes(response.status))
      throw new PublicApiError(response.status, "ACCESS_DENIED");
    let payload: JsonObject | null;
    try {
      payload = object(await response.json());
    } catch {
      throw new PublicApiError(
        response.status,
        timedOut ? "REQUEST_TIMEOUT" : "INVALID_RESPONSE",
      );
    }
    if (
      !response.ok ||
      payload?.success !== true ||
      !Object.prototype.hasOwnProperty.call(payload, "data")
    )
      throw new PublicApiError(
        response.status,
        text(object(payload?.error)?.code, 100),
      );
    return {
      data: payload.data,
      pagination: mapPagination(payload.pagination),
      meta: mapMeta(payload.meta),
    };
  } catch (cause) {
    if (timedOut && !(cause instanceof PublicApiError))
      throw new PublicApiError(0, "REQUEST_TIMEOUT");
    throw cause;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
function apiBase(value: string | undefined): string {
  const input = value?.trim().replace(/\/+$/, "") || "/api";
  try {
    const url = new URL(
      input,
      globalThis.location?.origin || "http://localhost",
    );
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? input
      : "/api";
  } catch {
    return "/api";
  }
}
function merge<T>(previous: T[], incoming: T[], key: (item: T) => string): T[] {
  return [
    ...new Map(
      [...previous, ...incoming].map((item) => [key(item), item]),
    ).values(),
  ];
}

export function useShowcaseData(options: ShowcaseDataOptions = {}) {
  const mode: DataMode =
    options.mode ??
    (import.meta.env.VITE_SHOWCASE_DATA_MODE === "mock" ? "mock" : "api");
  const base = apiBase(
    options.apiBase ?? import.meta.env.VITE_SHOWCASE_API_BASE,
  );
  const requested = [...new Set(options.modules ?? defaultModules)].filter(
    (id) => moduleIds.includes(id),
  );
  const pageSize = Math.floor(number(options.pageSize, 1, 100) ?? 12);
  const data = ref<ShowcaseData>(
    mode === "mock" ? createMockShowcaseData() : emptyData(),
  );
  const moduleStates = ref<Partial<Record<ModuleId, ShowcaseModuleState>>>({});
  const bangumiCategory = ref<BangumiCategory>("watched");
  const bangumiCounts = ref<Partial<Record<BangumiCategory, number>>>({});
  const manifestState = ref<"idle" | "loading" | "ready" | "error">("idle");
  const loading = computed(
    () =>
      manifestState.value === "loading" ||
      Object.values(moduleStates.value).some(
        (state) => state?.state === "loading",
      ),
  );
  const error = ref<string | null>(null);
  const isMock = computed(() => mode === "mock");
  let version = 0;
  let manifestController: AbortController | null = null;
  let publicModules = new Map<ModuleId, PublicModule>();
  const controllers = new Map<ModuleId, AbortController>();
  const generations = new Map<ModuleId, number>();

  function abortAll() {
    manifestController?.abort();
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  }
  function clearModule(id: ModuleId) {
    switch (id) {
      case "github.profile":
        data.value.profile = emptyData().profile;
        break;
      case "github.pinned":
        data.value.projects = [];
        break;
      case "github.languages":
        data.value.languages = [];
        break;
      case "github.activity":
        data.value.activity = [];
        break;
      case "github.contributions":
        data.value.contributions = null;
        break;
      case "steam.profile":
        data.value.steamProfile = null;
        break;
      case "steam.status":
        data.value.steamStatus = null;
        break;
      case "steam.games":
        data.value.collections = data.value.collections.filter(
          (item) => item.category !== "game",
        );
        break;
      case "bangumi.collections":
        data.value.collections = data.value.collections.filter(
          (item) => item.category !== "anime",
        );
        break;
      case "neoblog.articles":
        data.value.articles = [];
        break;
      case "L07":
        data.value.status = null;
        break;
      case "L08":
        data.value.goals = [];
        break;
      case "contacts":
        data.value.contacts = [];
        break;
    }
  }
  function apply(id: ModuleId, value: unknown, append: boolean) {
    switch (id) {
      case "contacts": {
        const items = mapContacts(value);
        data.value.contacts = append && items.length ? merge(data.value.contacts, items, item => item.id) : items;
        break;
      }
      case "github.profile":
        data.value.profile = mapProfile(value);
        break;
      case "github.pinned": {
        const items = mapProjects(value);
        data.value.projects =
          append && items.length
            ? merge(data.value.projects, items, (item) => item.slug)
            : items;
        break;
      }
      case "github.activity": {
        const items = mapActivity(value);
        data.value.activity =
          append && items.length
            ? merge(data.value.activity, items, (item) => item.id)
            : items;
        break;
      }
      case "github.languages": {
        const items = mapLanguages(value);
        data.value.languages =
          append && items.length
            ? merge(data.value.languages, items, (item) => item.fullName)
            : items;
        break;
      }
      case "github.contributions":
        data.value.contributions = mapContributions(value);
        break;
      case "steam.profile":
        data.value.steamProfile = mapSteamProfile(value);
        break;
      case "steam.status":
        data.value.steamStatus = mapSteamStatus(value);
        break;
      case "neoblog.articles": {
        const items = mapArticles(value);
        data.value.articles =
          append && items.length
            ? merge(data.value.articles, items, (item) => item.id)
            : items;
        break;
      }
      case "L07":
        data.value.status = mapStatus(value);
        break;
      case "L08": {
        const items = mapGoals(value);
        data.value.goals =
          append && items.length
            ? merge(data.value.goals, items, (item) => item.id)
            : items;
        break;
      }
      case "steam.games":
      case "bangumi.collections": {
        const category = id === "steam.games" ? "game" : "anime";
        const items = mapCollections(value, category);
        const previous = data.value.collections.filter(
          (item) => item.category === category,
        );
        data.value.collections = [
          ...data.value.collections.filter(
            (item) => item.category !== category,
          ),
          ...(append && items.length
            ? merge(previous, items, (item) => item.id)
            : items),
        ];
        break;
      }
    }
  }
  function size(id: ModuleId): number {
    switch (id) {
      case "github.profile":
        return data.value.profile.publicRepos !== undefined ||
          !!data.value.profile.githubUrl ||
          !!data.value.profile.bio
          ? 1
          : 0;
      case "github.pinned":
        return data.value.projects.length;
      case "github.languages":
        return data.value.languages.length;
      case "github.activity":
        return data.value.activity.length;
      case "github.contributions":
        return data.value.contributions?.days.length ?? 0;
      case "steam.profile":
        return data.value.steamProfile ? 1 : 0;
      case "steam.status":
        return data.value.steamStatus ? 1 : 0;
      case "steam.games":
        return data.value.collections.filter((item) => item.category === "game")
          .length;
      case "bangumi.collections":
        return data.value.collections.filter(
          (item) => item.category === "anime",
        ).length;
      case "neoblog.articles":
        return data.value.articles.length;
      case "L07":
        return data.value.status ? 1 : 0;
      case "L08":
        return data.value.goals.length;
      case "contacts":
        return data.value.contacts.length;
    }
  }
  function updateError() {
    if (manifestState.value !== "error")
      error.value = requested.some(
        (id) => moduleStates.value[id]?.state === "error",
      )
        ? "部分公开内容读取失败，可以重新加载。"
        : null;
  }
  function path(id: ModuleId, page: number, category: BangumiCategory): string {
    if (id === "L07") return "/personal-status";
    const endpoint =
      id === "contacts"
        ? "/contacts"
        : id === "L08"
        ? "/learning-goals"
        : `/showcase/modules/${encodeURIComponent(id)}/data`;
    if (!listModules.has(id)) return endpoint;
    const query = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    if (id === "bangumi.collections") query.set("category", category);
    return `${endpoint}?${query}`;
  }

  /** 模块请求独立取消和提交，分类切换及刷新不会让较早响应覆盖较新的内容。 */
  async function fetchModule(
    id: ModuleId,
    page = 1,
    append = false,
  ): Promise<void> {
    if (
      !requested.includes(id) ||
      mode !== "api" ||
      manifestState.value !== "ready"
    )
      return;
    const module = publicModules.get(id);
    if (!module || !module.available) return;
    controllers.get(id)?.abort();
    const controller = new AbortController();
    controllers.set(id, controller);
    const generation = (generations.get(id) ?? 0) + 1;
    generations.set(id, generation);
    const epoch = version;
    const category = bangumiCategory.value;
    if (!append) clearModule(id);
    moduleStates.value[id] = {
      ...moduleStates.value[id],
      source: module.source,
      state: "loading",
      error: undefined,
    };
    try {
      const response = await requestPublic(
        base,
        path(id, page, category),
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        epoch !== version ||
        generations.get(id) !== generation
      )
        return;
      if (listModules.has(id) && !Array.isArray(response.data))
        throw new PublicApiError(200, "INVALID_LIST_RESPONSE");
      apply(id, response.data, append);
      moduleStates.value[id] = {
        state: size(id) ? "ready" : "empty",
        source: module.source,
        meta: response.meta,
        pagination: response.pagination,
      };
      if (id === "bangumi.collections" && response.pagination)
        bangumiCounts.value[category] = response.pagination.total;
    } catch (cause) {
      if (
        controller.signal.aborted ||
        epoch !== version ||
        generations.get(id) !== generation
      )
        return;
      // 不保留可能已被撤回的旧条目，也不使用样例补齐请求失败、隐藏或不可用的区域。
      clearModule(id);
      if (id === "bangumi.collections") bangumiCounts.value = {};
      const hidden =
        cause instanceof PublicApiError &&
        (cause.status === 404 || cause.code === "MODULE_HIDDEN");
      const unavailable =
        cause instanceof PublicApiError &&
        (cause.status === 503 || cause.code === "DATA_UNAVAILABLE");
      moduleStates.value[id] = {
        source: module.source,
        state: hidden ? "hidden" : unavailable ? "unavailable" : "error",
        error: hidden
          ? undefined
          : unavailable
            ? "内容暂不可用"
            : cause instanceof PublicApiError &&
                cause.code === "REQUEST_TIMEOUT"
              ? "读取超时，请重试"
              : "读取失败，请重试",
      };
      if (hidden) publicModules.delete(id);
    } finally {
      if (controllers.get(id) === controller) controllers.delete(id);
      if (epoch === version) updateError();
    }
  }

  /** 清单决定可见性；未列出为隐藏，available=false 保持真实空态或不可用态。 */
  async function refresh(): Promise<void> {
    const epoch = ++version;
    abortAll();
    error.value = null;
    bangumiCounts.value = {};
    if (mode === "mock") {
      const sample = createMockShowcaseData();
      // 刷新保留已选分类，并据此筛选样例，避免标签与重建的收藏列表不一致。
      sample.collections = sample.collections.filter(
        (item) =>
          item.category !== "anime" ||
          item.collectionStatus === bangumiCategory.value,
      );
      data.value = sample;
      manifestState.value = "ready";
      for (const id of moduleIds)
        moduleStates.value[id] = {
          source: sourceOf(id),
          state: requested.includes(id)
            ? size(id)
              ? "ready"
              : "empty"
            : "idle",
        };
      return;
    }
    data.value = emptyData();
    publicModules = new Map();
    moduleStates.value = {};
    manifestState.value = "loading";
    const controller = new AbortController();
    manifestController = controller;
    try {
      const response = await requestPublic(
        base,
        "/showcase/modules",
        controller.signal,
      );
      if (controller.signal.aborted || epoch !== version) return;
      if (!Array.isArray(response.data))
        throw new PublicApiError(200, "INVALID_MODULE_LIST");
      for (const raw of response.data.slice(0, 30)) {
        const item = object(raw);
        const id = text(item?.id, 100) as ModuleId;
        if (
          item &&
          moduleIds.includes(id) &&
          typeof item.available === "boolean"
        )
          publicModules.set(id, {
            id,
            source: sourceOf(id),
            available: item.available,
          });
      }
      manifestState.value = "ready";
      for (const id of moduleIds) {
        const module = publicModules.get(id);
        const state: ShowcaseModuleState["state"] = !module
          ? "hidden"
          : !module.available
            ? id === "L07" || id === "L08" || id === "contacts"
              ? "empty"
              : "unavailable"
            : "idle";
        moduleStates.value[id] = {
          source: sourceOf(id),
          state,
          pagination:
            (id === "L08" || id === "contacts") && state === "empty"
              ? { page: 1, limit: pageSize, total: 0, hasMore: false }
              : undefined,
        };
      }
      await Promise.all(requested.map((id) => fetchModule(id)));
    } catch {
      if (controller.signal.aborted || epoch !== version) return;
      manifestState.value = "error";
      error.value = "公开内容清单读取失败，请稍后重新加载。";
      // 清单失败无法推断隐藏设置，全部区域保持空，并明确区分读取失败与管理员隐藏。
      for (const id of requested)
        moduleStates.value[id] = {
          source: sourceOf(id),
          state: "error",
          error: "公开内容清单读取失败",
        };
    }
  }
  function canLoadMore(id: ModuleId): boolean {
    return (
      mode === "api" &&
      requested.includes(id) &&
      moduleStates.value[id]?.state === "ready" &&
      moduleStates.value[id]?.pagination?.hasMore === true
    );
  }
  async function loadMore(id: ModuleId): Promise<void> {
    if (!canLoadMore(id)) return;
    await fetchModule(
      id,
      (moduleStates.value[id]?.pagination?.page ?? 1) + 1,
      true,
    );
  }
  async function setBangumiCategory(category: BangumiCategory): Promise<void> {
    if (
      !bangumiCategories.includes(category) ||
      category === bangumiCategory.value
    )
      return;
    bangumiCategory.value = category;
    if (mode === "mock") {
      const sample = createMockShowcaseData();
      data.value.collections = [
        ...data.value.collections.filter((item) => item.category !== "anime"),
        ...sample.collections.filter(
          (item) =>
            item.category === "anime" && item.collectionStatus === category,
        ),
      ];
      moduleStates.value["bangumi.collections"] = {
        source: "bangumi",
        state: size("bangumi.collections") ? "ready" : "empty",
      };
      return;
    }
    clearModule("bangumi.collections");
    await fetchModule("bangumi.collections");
  }

  onMounted(() => {
    void refresh();
  });
  onScopeDispose(() => {
    version++;
    abortAll();
  });
  return {
    data,
    moduleStates,
    bangumiCategory,
    bangumiCounts,
    manifestState,
    loading,
    error,
    isMock,
    mode,
    refresh,
    loadMore,
    canLoadMore,
    setBangumiCategory,
  };
}

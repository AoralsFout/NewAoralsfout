/** 展示内容类型；统一静态样例与公开 API 的展示字段，导出页面、作品、文章及个人动态契约。 */
export type Accent = "blue" | "yellow" | "ink";
export type DataMode = "mock" | "api";
export type GoalStatus = "planned" | "active" | "paused" | "completed";
export type BangumiCategory =
  "watched" | "watching" | "want" | "on_hold" | "dropped";
export type ModuleSource = "github" | "steam" | "bangumi" | "neoblog" | "local";
export type ModuleId =
  | "github.profile"
  | "github.pinned"
  | "github.languages"
  | "github.activity"
  | "github.contributions"
  | "steam.profile"
  | "steam.status"
  | "steam.games"
  | "bangumi.collections"
  | "neoblog.articles"
  | "L07"
  | "L08"
  | "contacts";

export interface ShowcasePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ShowcaseMetadata {
  moduleId: string;
  source: ModuleSource;
  updatedAt: string | null;
  freshness: "fresh" | "stale" | "unavailable";
}

export interface ShowcaseModuleState {
  state:
    "idle" | "hidden" | "unavailable" | "loading" | "ready" | "empty" | "error";
  source: ModuleSource;
  meta?: ShowcaseMetadata;
  pagination?: ShowcasePagination;
  error?: string;
}

export interface ShowcaseProfile {
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  location: string;
  avatar?: string;
  email?: string;
  githubUrl?: string;
  publicRepos?: number;
  followers?: number;
  following?: number;
}

export interface ShowcaseSteamProfile {
  steamId: string;
  name: string;
  avatar?: string;
  url?: string;
}

export interface ShowcaseSteamStatus {
  state: number;
  label: string;
  gameId: string | null;
  gameName: string | null;
}

export interface ShowcaseStatus {
  text: string;
  label: string;
  updatedAt: string;
}

export interface ShowcaseProject {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  year: string;
  description: string;
  stack: string[];
  accent: Accent;
  featured: boolean;
  url?: string;
  challenge?: string[];
  outcome?: string[];
  fullName?: string;
  stars?: number;
  language?: string;
  homepage?: string;
}

/** GitHub 返回的语言规模与占比；表示代码构成，不表示个人技能熟练度。 */
export interface ShowcaseLanguage {
  name: string;
  bytes: number;
  percentage: number;
}

/** 按公开仓库保留语言数据，完整名称用于分页合并和界面关联。 */
export interface ShowcaseRepositoryLanguages {
  name: string;
  fullName: string;
  languages: ShowcaseLanguage[];
}

export interface ShowcaseArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  readingMinutes: number;
  tags: string[];
  url?: string;
  /** 样例提供正文；公开 API 仅提供摘要时不虚构原文内容。 */
  content?: string[];
  coverImage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShowcaseGoal {
  id: string;
  title: string;
  description: string;
  progress: number | null;
  status: GoalStatus;
}

/** 公开联系方式；类型可自定义，缺少链接时保留文本与复制操作。 */
export interface ShowcaseContactMethod {
  id: string;
  type: string;
  label: string;
  value: string;
  url: string | null;
}

export interface ShowcaseActivity {
  id: string;
  type: string;
  title: string;
  repo: string;
  date: string;
  url?: string;
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ShowcaseContributions {
  total: number;
  days: ContributionDay[];
  longestStreak: number;
  activeWeeks: number;
}

export interface ShowcaseCollection {
  id: string;
  title: string;
  subtitle: string;
  category: "game" | "anime" | "music" | "book";
  accent: Accent;
  image?: string;
  url?: string;
  sourceId?: string;
  playtimeMinutes?: number;
  lastPlayedAt?: string | null;
  rate?: number;
  collectionStatus?: BangumiCategory;
}

export interface ShowcaseData {
  profile: ShowcaseProfile;
  status: ShowcaseStatus | null;
  projects: ShowcaseProject[];
  languages: ShowcaseRepositoryLanguages[];
  articles: ShowcaseArticle[];
  goals: ShowcaseGoal[];
  contacts: ShowcaseContactMethod[];
  activity: ShowcaseActivity[];
  contributions: ShowcaseContributions | null;
  steamProfile: ShowcaseSteamProfile | null;
  steamStatus: ShowcaseSteamStatus | null;
  collections: ShowcaseCollection[];
  /** 以内容区域标记样例来源，供页面统一呈现样例提示。 */
  sampleSections: Array<
    | "profile"
    | "status"
    | "projects"
    | "languages"
    | "articles"
    | "goals"
    | "contacts"
    | "activity"
    | "contributions"
    | "collections"
  >;
}

/** 来源适配器；继承 AboutMe 字段映射和 NeoBlog 文章投影，完整采集仓库等来源后由 collect 输出白名单快照。 */
import { z } from 'zod';
import { env } from '../../config/env';
import prisma from '../../config/database';
import { categories } from './validation';
export type Item = Record<string, any>;
export type Payload = Item | Item[];
export interface Snapshot { payload: Payload; etag?: string; pollMs?: number; notModified?: boolean; parentSuccessAt?: string }
export class UpstreamError extends Error {
  /** 已明确撤回公开权限的仓库 ID，用于立即从父快照中剔除对应条目。 */
  withdrawnItem?: string;
  constructor(public result: string, public code: string, message: string, public status?: number, public retryMs?: number, public privateData = false) { super(message); }
}
const object = z.record(z.any());
const integer = z.number().int().nonnegative();
const githubHeaders = () => ({ Accept: 'application/vnd.github+json', 'User-Agent': 'Aoralsfout-showcase', ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}) });
/** 请求预算包含读取响应体；拒绝重定向以免携带凭据访问其他主机。 */
async function request(url: string, signal: AbortSignal, init: RequestInit = {}, private404 = false): Promise<{ data: any; headers: Headers; status: number }> {
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    if (response.status === 304) return { data: null, headers: response.headers, status: 304 };
    if (!response.ok) {
      const seconds = Number(response.headers.get('retry-after'));
      const retryDate = Date.parse(response.headers.get('retry-after') || '');
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const limited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
      const retryMs = Math.max(30000, Number.isFinite(seconds) ? seconds * 1000 : 0, Number.isFinite(retryDate) ? retryDate - Date.now() : 0, limited && reset ? reset - Date.now() : 0);
      if (limited) throw new UpstreamError('rate_limited', 'UPSTREAM_RATE_LIMIT', '上游请求额度不足，请稍后刷新', response.status, retryMs);
      if (response.status === 401 || response.status === 403) throw new UpstreamError('auth_error', 'UPSTREAM_AUTH', '上游凭据失效或权限不足', response.status);
      if (response.status === 404 && private404) throw new UpstreamError('private', 'UPSTREAM_PRIVATE', '上游内容不存在或不再公开', response.status, undefined, true);
      throw new UpstreamError('error', 'UPSTREAM_HTTP', '上游服务返回异常状态', response.status);
    }
    return { data: await response.json(), headers: response.headers, status: response.status };
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) throw new UpstreamError('timeout', 'UPSTREAM_TIMEOUT', '采集超时，保留最近完整快照');
    throw new UpstreamError('error', 'UPSTREAM_NETWORK', '上游连接或响应异常，保留最近完整快照');
  }
}
async function steam(path: string, params: Record<string, string>, signal: AbortSignal) {
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.search = new URLSearchParams({ key: env.steamKey, ...params }).toString();
  return (await request(url.toString(), signal)).data;
}
async function steamSnapshot(id: string, signal: AbortSignal): Promise<Snapshot> {
  if (id !== 'steam.games') {
    const data = await steam('ISteamUser/GetPlayerSummaries/v2/', { steamids: env.steamId }, signal);
    const players = z.array(object).parse(data?.response?.players);
    const player = players.find(p => p.steamid === env.steamId);
    if (!player || player.communityvisibilitystate !== 3) throw new UpstreamError('private', 'STEAM_PRIVATE', 'Steam 个人资料已隐藏', undefined, undefined, true);
    if (id === 'steam.profile') return { payload: { steamId: env.steamId, name: z.string().parse(player.personaname), avatar: z.string().parse(player.avatarfull), url: z.string().parse(player.profileurl) } };
    return { payload: { state: integer.max(6).parse(player.personastate), gameId: player.gameid ?? null, gameName: player.gameextrainfo ?? null } };
  }
  const response = (await steam('IPlayerService/GetOwnedGames/v1/', { steamid: env.steamId, include_appinfo: 'true', include_played_free_games: 'true', language: 'schinese' }, signal))?.response;
  if (!response || response.game_count === undefined) throw new UpstreamError('private', 'STEAM_GAMES_PRIVATE', 'Steam 游戏库未公开', undefined, undefined, true);
  const count = integer.parse(response.game_count);
  const games = z.array(object).parse(response.games ?? (count === 0 ? [] : undefined));
  if (games.length !== count) throw new UpstreamError('error', 'INCOMPLETE_DATA', '游戏库响应不完整');
  const payload = games.map(g => ({ itemId: String(integer.parse(g.appid)), appId: g.appid, name: z.string().parse(g.name), playtimeMinutes: integer.parse(g.playtime_forever), lastPlayedAt: g.rtime_last_played > 0 ? new Date(g.rtime_last_played * 1000).toISOString() : null, icon: g.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg` : null, url: `https://store.steampowered.com/app/${g.appid}/` }));
  payload.sort((a, b) => (Date.parse(b.lastPlayedAt || '') || 0) - (Date.parse(a.lastPlayedAt || '') || 0) || a.appId - b.appId);
  return { payload };
}
/** 五类收藏全部完成后才交给缓存层；重复 ID 或缺页均视为不完整。 */
async function bangumiSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const payload: Item[] = [];
  const types = [2, 3, 1, 4, 5];
  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
    let offset = 0, total = 0;
    const items: Item[] = [];
    do {
      const url = new URL(`https://api.bgm.tv/v0/users/${encodeURIComponent(env.bangumiUsername)}/collections`);
      url.search = new URLSearchParams({ subject_type: '2', type: String(types[categoryIndex]), limit: '100', offset: String(offset) }).toString();
      const { data } = await request(url.toString(), signal, { headers: { Accept: 'application/json', 'User-Agent': 'Aoralsfout-showcase/1.0' } }, true);
      const page = z.object({ total: integer, data: z.array(object) }).parse(data);
      if (offset > 0 && page.total !== total) throw new UpstreamError('error', 'COLLECTION_CHANGED', '收藏在采集期间变动，请稍后重试');
      total = page.total;
      if (page.data.length === 0 && offset < total) throw new UpstreamError('error', 'INCOMPLETE_DATA', '收藏分页不完整');
      items.push(...page.data); offset += page.data.length;
    } while (offset < total);
    if (items.length !== total || new Set(items.map(i => i.subject_id)).size !== total) throw new UpstreamError('error', 'INCOMPLETE_DATA', '收藏分页数量不一致');
    payload.push(...items.map(i => { const s = object.parse(i.subject); const subjectId = integer.parse(i.subject_id); return { itemId: String(subjectId), subjectId, name: z.string().parse(s.name_cn || s.name), image: s.images?.large || s.images?.common || null, category: categories[categoryIndex], rate: integer.max(10).parse(i.rate), url: `https://bgm.tv/subject/${subjectId}` }; }));
  }
  payload.sort((a, b) => b.rate - a.rate || a.subjectId - b.subjectId);
  return { payload };
}
async function graphql(query: string, signal: AbortSignal) {
  const { data } = await request('https://api.github.com/graphql', signal, { method: 'POST', headers: { ...githubHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { login: env.githubUsername } }) });
  if (data.errors?.length) {
    if (data.errors.some((e: Item) => e.type === 'RATE_LIMITED')) throw new UpstreamError('rate_limited', 'UPSTREAM_RATE_LIMIT', 'GitHub GraphQL 已限流', 200, 60_000);
    if (data.errors.some((e: Item) => e.type === 'NOT_FOUND')) throw new UpstreamError('private', 'GITHUB_NOT_FOUND', 'GitHub 用户或仓库不再公开', 200, undefined, true);
    throw new UpstreamError('auth_error', 'GRAPHQL_ERROR', 'GitHub GraphQL 权限或响应异常');
  }
  if (!data.data?.user) throw new UpstreamError('private', 'GITHUB_NOT_FOUND', 'GitHub 用户不存在', undefined, undefined, true);
  return data.data.user;
}
/** 取齐账号名下全部公开仓库（含 Fork 和归档）；分页失败或重复 ID 时拒绝发布不完整快照。 */
async function githubRepositoriesSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const payload: Item[] = [], seen = new Set<number>();
  for (let page = 1; ; page++) {
    // 按名称采集，避免仓库更新导致跨页顺序变化；不访问 Link 中的 URL，以免向其他主机发送凭据。
    const url = `https://api.github.com/users/${encodeURIComponent(env.githubUsername)}/repos?type=owner&sort=full_name&direction=asc&per_page=100&page=${page}`;
    const result = await request(url, signal, { headers: githubHeaders() }, true);
    const repos = z.array(object).max(100).parse(result.data);
    for (const repo of repos) {
      const repoId = integer.parse(repo.id);
      if (seen.has(repoId)) throw new UpstreamError('error', 'INCOMPLETE_DATA', '仓库分页出现重复条目，请稍后重试');
      seen.add(repoId);
      // 即使配置了能读取私有仓库的 Token，也仅缓存明确公开的条目。
      if (z.boolean().parse(repo.private)) continue;
      payload.push({
        itemId: String(repoId), id: repoId, name: z.string().parse(repo.name), fullName: z.string().parse(repo.full_name),
        description: z.string().nullable().parse(repo.description), url: z.string().parse(repo.html_url), homepage: z.string().nullable().parse(repo.homepage || null),
        stars: integer.parse(repo.stargazers_count), forks: integer.parse(repo.forks_count), language: z.string().nullable().parse(repo.language),
        fork: z.boolean().parse(repo.fork), archived: z.boolean().parse(repo.archived), defaultBranch: z.string().parse(repo.default_branch),
        topics: z.array(z.string()).parse(repo.topics ?? []), createdAt: z.string().datetime().parse(repo.created_at),
        updatedAt: z.string().datetime().parse(repo.updated_at), pushedAt: z.string().datetime().nullable().parse(repo.pushed_at),
      });
    }
    // 优先依据分页关系；没有 Link 时以不足一页作为结束条件，整页结果继续请求，避免截断到 100 条。
    const link = result.headers.get('link');
    const hasNext = link !== null ? /<[^>]+>;\s*rel="next"/.test(link) : repos.length === 100;
    if (!hasNext) break;
    if (!repos.length) throw new UpstreamError('error', 'INCOMPLETE_DATA', '仓库分页为空但仍有下一页');
  }
  payload.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id - b.id);
  return { payload };
}
async function githubSnapshot(id: string, signal: AbortSignal, etag?: string | null): Promise<Snapshot> {
  const login = encodeURIComponent(env.githubUsername);
  if (id === 'github.repositories') return githubRepositoriesSnapshot(signal);
  if (id === 'github.contributions') {
    const user = await graphql('query($login:String!){ user(login:$login){ contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount color } } } } } }', signal);
    const calendar = z.object({ totalContributions: integer, weeks: z.array(z.object({ contributionDays: z.array(z.object({ date: z.string(), contributionCount: integer, color: z.string() })) })) }).parse(user.contributionsCollection?.contributionCalendar);
    return { payload: calendar };
  }
  if (id === 'github.pinned') {
    const user = await graphql('query($login:String!){ user(login:$login){ pinnedItems(first:6,types:[REPOSITORY]) { nodes { ... on Repository { databaseId name nameWithOwner description url homepageUrl stargazerCount isPrivate primaryLanguage { name } } } } } }', signal);
    const nodes = z.array(object).parse(user.pinnedItems?.nodes);
    return { payload: nodes.filter(n => n.isPrivate === false).map(n => ({ itemId: String(integer.parse(n.databaseId)), name: z.string().parse(n.name), fullName: z.string().parse(n.nameWithOwner), description: n.description ?? null, url: z.string().parse(n.url), homepage: n.homepageUrl || null, stars: integer.parse(n.stargazerCount), language: n.primaryLanguage?.name ?? null })) };
  }
  if (id === 'github.languages') {
    const cache = await prisma.showcaseCache.findUnique({ where: { moduleId: 'github.pinned' } });
    if (!cache?.lastSuccessAt || cache.blocked || !Array.isArray(cache.payload) || Date.now() - cache.lastSuccessAt.getTime() > 7 * 86400000) throw new UpstreamError('error', 'PINNED_UNAVAILABLE', '请先成功刷新置顶仓库');
    const parentSuccessAt = cache.lastSuccessAt.toISOString();
    const payload: Item[] = [];
    for (const repo of cache.payload as Item[]) {
      let data: any;
      try { data = (await request(`https://api.github.com/repos/${repo.fullName.split('/').map(encodeURIComponent).join('/')}/languages`, signal, { headers: githubHeaders() }, true)).data; }
      catch (error) { if (error instanceof UpstreamError && error.privateData) error.withdrawnItem = String(repo.itemId); throw error; }
      const languages = z.record(integer).parse(data), total = Object.values(languages).reduce((a, b) => a + b, 0);
      payload.push({ itemId: repo.itemId, name: repo.name, fullName: repo.fullName, languages: Object.entries(languages).map(([name, bytes]) => ({ name, bytes, percentage: total ? Math.round(bytes / total * 10000) / 100 : 0 })) });
    }
    return { payload, parentSuccessAt };
  }
  if (id === 'github.profile') {
    const { data: u } = await request(`https://api.github.com/users/${login}`, signal, { headers: githubHeaders() }, true);
    return { payload: { login: z.string().parse(u.login), name: u.name ?? u.login, avatar: z.string().parse(u.avatar_url), bio: u.bio ?? null, url: z.string().parse(u.html_url), publicRepos: integer.parse(u.public_repos), followers: integer.parse(u.followers), following: integer.parse(u.following) } };
  }
  const headers = { ...githubHeaders(), ...(etag ? { 'If-None-Match': etag } : {}) };
  const events: Item[] = [];
  let responseEtag: string | undefined, pollMs = 0;
  for (let page = 1; page <= 3; page++) {
    const result = await request(`https://api.github.com/users/${login}/events/public?per_page=100&page=${page}`, signal, { headers: page === 1 ? headers : githubHeaders() }, true);
    pollMs = Math.max(pollMs, Number(result.headers.get('x-poll-interval') || 0) * 1000);
    if (page === 1) responseEtag = result.headers.get('etag') || undefined;
    if (result.status === 304) return { payload: [], notModified: true, etag: responseEtag, pollMs };
    const items = z.array(object).parse(result.data); events.push(...items);
    if (items.length < 100) break;
  }
  const unique = [...new Map(events.map(e => [e.id, e])).values()];
  unique.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || String(a.id).localeCompare(String(b.id)));
  return { payload: unique.map(e => ({ itemId: z.string().parse(e.id), type: z.string().parse(e.type), repo: z.string().parse(e.repo?.name), createdAt: z.string().datetime().parse(e.created_at), url: `https://github.com/${e.repo.name}` })), etag: responseEtag, pollMs };
}
/** 使用 NeoBlog 既有列表字段且不读取正文，不触发浏览计数；结果映射为 camelCase。 */
async function blogSnapshot(): Promise<Snapshot> {
  if (!env.blogUrl || !env.blogAssetUrl) throw new UpstreamError('error', 'BLOG_URL_UNCONFIGURED', '尚未配置 NeoBlog 原文和资源地址');
  const articles = await prisma.article.findMany({ select: { id: true, title: true, summary: true, cover_image: true, tags: true, created_at: true, updated_at: true }, orderBy: [{ created_at: 'desc' }, { id: 'asc' }] });
  return { payload: articles.map(a => ({ itemId: String(a.id), id: a.id, title: a.title, summary: a.summary, coverImage: a.cover_image ? new URL(a.cover_image, env.blogAssetUrl).toString() : null, tags: [...new Set((a.tags || '').split(',').map(t => t.trim()).filter(Boolean))], createdAt: a.created_at.toISOString(), updatedAt: a.updated_at.toISOString(), url: new URL(`/article/${a.id}`, env.blogUrl).toString() })) };
}
export async function collect(id: string, signal: AbortSignal, etag?: string | null): Promise<Snapshot> {
  if (id.startsWith('steam.')) return steamSnapshot(id, signal);
  if (id.startsWith('bangumi.')) return bangumiSnapshot(signal);
  if (id.startsWith('github.')) return githubSnapshot(id, signal, etag);
  if (id.startsWith('neoblog.')) return blogSnapshot();
  throw new UpstreamError('error', 'UNSUPPORTED_MODULE', '此模块无需同步');
}

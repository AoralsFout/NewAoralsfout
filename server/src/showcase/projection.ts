/** 公开数据投影；导出新鲜度、条目过滤、字段白名单和按可见文章派生标签/归档的纯函数。 */
import { ShowcaseCache } from '@prisma/client';
import { findModule } from './catalog';
import { Item, Payload } from './adapters';
const fields: Record<string, string[]> = {
  'steam.profile': ['steamId', 'name', 'avatar', 'url'], 'steam.status': ['state', 'gameId', 'gameName'],
  'steam.games': ['appId', 'name', 'playtimeMinutes', 'lastPlayedAt', 'icon', 'url'],
  'bangumi.collections': ['subjectId', 'name', 'image', 'category', 'rate', 'url'],
  'github.profile': ['login', 'name', 'avatar', 'bio', 'url', 'publicRepos', 'followers', 'following'],
  'github.activity': ['type', 'repo', 'createdAt', 'url'], 'github.pinned': ['name', 'fullName', 'description', 'url', 'homepage', 'stars', 'language'],
  'github.repositories': ['id', 'name', 'fullName', 'description', 'url', 'homepage', 'stars', 'forks', 'language', 'fork', 'archived', 'defaultBranch', 'topics', 'createdAt', 'updatedAt', 'pushedAt'],
  'neoblog.articles': ['id', 'title', 'summary', 'coverImage', 'tags', 'createdAt', 'updatedAt', 'url'],
};
export function freshness(id: string, cache: ShowcaseCache | null, now = Date.now()): 'fresh' | 'stale' | 'unavailable' {
  if (!cache?.lastSuccessAt || cache.payload === null || cache.blocked) return 'unavailable';
  const age = now - cache.lastSuccessAt.getTime();
  if (age > (id === 'steam.status' ? 5 * 60_000 : 7 * 86400000)) return 'unavailable';
  return age > (findModule(id)?.interval || 0) ? 'stale' : 'fresh';
}
export function visibleItems(items: Item[], hidden: Set<string>): Item[] { return items.filter(i => !hidden.has(String(i.itemId))); }
export function deriveArticles(id: string, articles: Item[]): Item[] {
  if (id === 'neoblog.tags') {
    const counts = new Map<string, number>();
    for (const article of articles) for (const tag of article.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  if (id === 'neoblog.archive') {
    const groups = new Map<string, Item[]>();
    for (const article of articles) { const month = article.createdAt.slice(0, 7); groups.set(month, [...(groups.get(month) || []), { id: article.id, title: article.title, url: article.url, createdAt: article.createdAt }]); }
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => ({ month, count: items.length, articles: items }));
  }
  return articles;
}
/** 嵌套 GraphQL 和语言结果也重新投影，不直接公开缓存对象。 */
export function publicProjection(id: string, payload: Payload): Payload {
  const pick = (item: Item) => Object.fromEntries((fields[id] || []).filter(k => k in item).map(k => [k, item[k]]));
  if (id === 'github.contributions' && !Array.isArray(payload)) return { totalContributions: payload.totalContributions, weeks: payload.weeks.map((w: Item) => ({ contributionDays: w.contributionDays.map((d: Item) => ({ date: d.date, contributionCount: d.contributionCount, color: d.color })) })) };
  if (id === 'github.languages' && Array.isArray(payload)) return payload.map(i => ({ name: i.name, fullName: i.fullName, languages: i.languages.map((l: Item) => ({ name: l.name, bytes: l.bytes, percentage: l.percentage })) }));
  if (id === 'neoblog.tags' && Array.isArray(payload)) return payload.map(i => ({ name: i.name, count: i.count }));
  if (id === 'neoblog.archive' && Array.isArray(payload)) return payload.map(i => ({ month: i.month, count: i.count, articles: i.articles.map((a: Item) => ({ id: a.id, title: a.title, url: a.url, createdAt: a.createdAt })) }));
  return Array.isArray(payload) ? payload.map(pick) : pick(payload);
}

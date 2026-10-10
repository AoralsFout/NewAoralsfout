/** 固定展示模块目录；导出模块白名单、依赖、刷新间隔及幂等初始化函数。 */
import prisma from '../../config/database';
import { env } from '../../config/env';
const minute = 60_000, hour = 60 * minute;
export const modules = [
  { id: 'steam.profile', name: 'Steam 名片', source: 'steam', interval: 6 * hour, list: false, items: false },
  { id: 'steam.status', name: 'Steam 当前状态', source: 'steam', interval: 2 * minute, list: false, items: false },
  { id: 'steam.games', name: 'Steam 游戏库', source: 'steam', interval: hour, list: true, items: true },
  { id: 'bangumi.collections', name: 'Bangumi 动画收藏', source: 'bangumi', interval: hour, list: true, items: true },
  { id: 'github.profile', name: 'GitHub 名片', source: 'github', interval: 6 * hour, list: false, items: false },
  { id: 'github.contributions', name: 'GitHub 贡献日历', source: 'github', interval: 24 * hour, list: false, items: false },
  { id: 'github.activity', name: 'GitHub 最近活动', source: 'github', interval: 30 * minute, list: true, items: true },
  { id: 'github.pinned', name: 'GitHub 置顶仓库', source: 'github', interval: 6 * hour, list: true, items: true },
  { id: 'github.repositories', name: 'GitHub 全部公开仓库', source: 'github', interval: 6 * hour, list: true, items: true },
  { id: 'github.languages', name: '置顶仓库语言构成', source: 'github', interval: 24 * hour, list: true, items: false, parent: 'github.pinned' },
  { id: 'neoblog.articles', name: 'NeoBlog 文章', source: 'neoblog', interval: 15 * minute, list: true, items: true },
  { id: 'neoblog.tags', name: 'NeoBlog 标签', source: 'neoblog', interval: 15 * minute, list: true, items: false, parent: 'neoblog.articles' },
  { id: 'neoblog.archive', name: 'NeoBlog 归档', source: 'neoblog', interval: 15 * minute, list: true, items: false, parent: 'neoblog.articles' },
  { id: 'L07', name: '当前状态', source: 'local', interval: 0, list: false, items: false },
  { id: 'L08', name: '学习目标', source: 'local', interval: 0, list: true, items: false },
] as const;
export type ModuleId = typeof modules[number]['id'];
export function findModule(id: string) { return modules.find(m => m.id === id); }
export function parentOf(id: string): string | undefined {
  const module = findModule(id);
  return module && 'parent' in module ? module.parent : undefined;
}
export function configured(id: string): boolean {
  if (id.startsWith('steam.')) return Boolean(env.steamKey && env.steamId);
  if (id.startsWith('bangumi.')) return Boolean(env.bangumiUsername);
  if (id.startsWith('github.')) return Boolean(env.githubUsername && (!['github.pinned', 'github.contributions', 'github.languages'].includes(id) || env.githubToken));
  if (id.startsWith('neoblog.')) return Boolean(env.blogUrl && env.blogAssetUrl);
  return true;
}
export async function initializeModules() {
  await prisma.$transaction(modules.map(m => prisma.showcaseModule.upsert({ where: { id: m.id }, update: {}, create: { id: m.id, source: m.source } })));
}

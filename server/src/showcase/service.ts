/** 展示业务服务；统一管理与公开读取的过滤、分页、来源状态和关联模块一致性。 */
import prisma from '../../config/database';
import { findModule, modules, parentOf, configured } from './catalog';
import { ApiError } from './errors';
import { Item, Payload } from './adapters';
import { freshness, deriveArticles, visibleItems, publicProjection } from './projection';
import { isRefreshing } from './sync';
export interface ListQuery { page: number; limit: number; category?: string }
async function hiddenIds(moduleId: string) {
  const records = await prisma.showcaseItemVisibility.findMany({ where: { moduleId, visible: false } });
  return new Set(records.map(r => r.itemId));
}
async function moduleOpen(id: string) { return Boolean((await prisma.showcaseModule.findUnique({ where: { id } }))?.visible); }
/** 公开读取先检查模块及父模块，再执行有效期、条目过滤和分页；管理读取保留完整内容。 */
export async function readData(id: string, query: ListQuery, admin: boolean) {
  const module = findModule(id);
  if (!module || module.source === 'local') throw new ApiError(404, 'MODULE_NOT_FOUND', '模块不存在');
  if (query.category && id !== 'bangumi.collections') throw new ApiError(400, 'INVALID_CATEGORY', '此模块不支持分类筛选');
  const parent = parentOf(id);
  if (!admin && (!(await moduleOpen(id)) || (parent && !(await moduleOpen(parent))))) throw new ApiError(404, 'MODULE_HIDDEN', '模块不存在');
  const cacheId = id.startsWith('neoblog.') ? 'neoblog.articles' : id;
  const cache = await prisma.showcaseCache.findUnique({ where: { moduleId: cacheId } });
  let fresh = freshness(cacheId, cache);
  if (!admin && fresh === 'unavailable') throw new ApiError(503, 'DATA_UNAVAILABLE', '模块数据暂不可用');
  if (admin && cache?.payload == null) return { data: module.list ? [] : null, ...(module.list ? { pagination: { page: query.page, limit: query.limit, total: 0 } } : {}), meta: { moduleId: id, source: module.source, updatedAt: null, freshness: 'unavailable' } };
  let payload = cache!.payload as Payload;
  if (Array.isArray(payload)) {
    let items: Item[] = payload;
    const hidden = await hiddenIds(parent || id);
    let effectiveIds: Set<string> | undefined;
    let parentAvailable = true;
    if (id === 'github.languages') {
      const pinned = await prisma.showcaseCache.findUnique({ where: { moduleId: 'github.pinned' } });
      const parentFreshness = freshness('github.pinned', pinned);
      parentAvailable = parentFreshness !== 'unavailable';
      if (!admin && !parentAvailable) throw new ApiError(503, 'DATA_UNAVAILABLE', '模块数据暂不可用');
      if (parentFreshness === 'stale' && fresh === 'fresh') fresh = 'stale';
      effectiveIds = new Set(Array.isArray(pinned?.payload) ? (pinned.payload as Item[]).map(p => String(p.itemId)) : []);
    }
    // 依赖模块的隐藏覆盖始终来自父模块；博客标签和归档在过滤后重新计算。
    if (!admin) { items = visibleItems(items, hidden); if (effectiveIds) items = items.filter(item => effectiveIds!.has(String(item.itemId))); }
    if (admin) {
      const open = await moduleOpen(id), parentOpen = !parent || await moduleOpen(parent);
      items = items.map(item => ({ ...item, itemVisible: !hidden.has(String(item.itemId)), visible: open && parentOpen && !hidden.has(String(item.itemId)) && (!effectiveIds || effectiveIds.has(String(item.itemId))) && parentAvailable && fresh !== 'unavailable' }));
    }
    if (id.startsWith('neoblog.') && id !== 'neoblog.articles') items = deriveArticles(id, items);
    if (id === 'bangumi.collections') items = items.filter(item => item.category === (query.category || 'watched'));
    const total = items.length, pageItems = items.slice((query.page - 1) * query.limit, query.page * query.limit);
    return { data: admin ? pageItems : publicProjection(id, pageItems), pagination: { page: query.page, limit: query.limit, total }, meta: { moduleId: id, source: module.source, updatedAt: cache?.lastSuccessAt, freshness: fresh } };
  }
  return { data: admin ? payload : publicProjection(id, payload), meta: { moduleId: id, source: module.source, updatedAt: cache?.lastSuccessAt, freshness: fresh } };
}
/** 新覆盖要求条目存在；已存在的覆盖可以恢复，即使上游快照暂时不含该条目。 */
export async function setItemVisibility(id: string, itemId: string, visible: boolean) {
  const module = findModule(id);
  if (!module?.items || itemId.length > 100) throw new ApiError(400, 'ITEM_VISIBILITY_UNSUPPORTED', '此模块不支持该条目设置');
  const [cache, existing] = await Promise.all([prisma.showcaseCache.findUnique({ where: { moduleId: id } }), prisma.showcaseItemVisibility.findUnique({ where: { moduleId_itemId: { moduleId: id, itemId } } })]);
  if (!existing && !(Array.isArray(cache?.payload) && (cache.payload as Item[]).some(item => String(item.itemId) === itemId))) throw new ApiError(404, 'ITEM_NOT_FOUND', '条目不存在');
  if (visible) await prisma.showcaseItemVisibility.deleteMany({ where: { moduleId: id, itemId } });
  else await prisma.showcaseItemVisibility.upsert({ where: { moduleId_itemId: { moduleId: id, itemId } }, update: { visible: false }, create: { moduleId: id, itemId, visible: false } });
}
/** 状态仅描述最近采集；列表总量是管理快照数量，不用于公开分页计数。 */
export async function moduleStatus() {
  const [settings, caches] = await Promise.all([prisma.showcaseModule.findMany(), prisma.showcaseCache.findMany()]);
  return modules.map(module => {
    const cache = caches.find(c => c.moduleId === (module.id.startsWith('neoblog.') ? 'neoblog.articles' : module.id));
    const raw = cache?.payload as Payload | undefined;
    const data = raw && Array.isArray(raw) && module.id.startsWith('neoblog.') ? deriveArticles(module.id, raw) : raw;
    return { ...module, visible: settings.find(s => s.id === module.id)?.visible || false, configured: configured(module.id), refreshing: isRefreshing(module.id), freshness: module.source === 'local' ? null : freshness(module.id, cache || null), count: Array.isArray(data) ? data.length : data ? 1 : 0, lastResult: cache?.lastResult || 'never', lastAttemptAt: cache?.lastAttemptAt || null, lastSuccessAt: cache?.lastSuccessAt || null, nextAttemptAt: cache?.nextAttemptAt || null, durationMs: cache?.durationMs ?? null, lastErrorCode: cache?.lastErrorCode || null, lastErrorMessage: cache?.lastErrorMessage || null, upstreamStatus: cache?.upstreamStatus || null };
  });
}
/** 汇总时保留部分未配置或失败的模块影响，避免将来源误报为全部正常。 */
export async function sourceStatus() {
  const status = await moduleStatus();
  return ['steam', 'bangumi', 'github', 'neoblog'].map(source => {
    const own = status.filter(m => m.source === source), enabled = own.filter(m => m.configured);
    const state = !enabled.length ? 'unconfigured' : own.every(m => m.lastResult === 'never') ? 'unknown' : own.every(m => m.configured && m.freshness === 'fresh' && m.lastResult === 'ok') ? 'ok' : own.every(m => m.freshness === 'unavailable') ? 'unavailable' : 'degraded';
    const latest = (key: 'lastAttemptAt' | 'lastSuccessAt') => own.map(m => m[key]).filter((v): v is Date => v instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0] || null;
    return { source, kind: source === 'neoblog' ? 'local' : 'external', configured: own.every(m => m.configured), state, lastAttemptAt: latest('lastAttemptAt'), lastSuccessAt: latest('lastSuccessAt') };
  });
}

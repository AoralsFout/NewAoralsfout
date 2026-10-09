/** 同步协调器；导出 refresh 和调度生命周期，管理采集预算、重入、限流与完整快照事务。 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { collect, UpstreamError, Snapshot } from './adapters';
import { findModule, modules, configured } from './catalog';
import { ApiError } from './errors';
const running = new Set<string>();
const canonical = (id: string) => id.startsWith('neoblog.') ? 'neoblog.articles' : id;
export const isRefreshing = (id: string) => running.has(canonical(id));
const blogIds = ['neoblog.articles', 'neoblog.tags', 'neoblog.archive'];
/** 全预算超时也涵盖本地数据库读取；超时后的结果不会进入缓存事务。 */
async function withinBudget(id: string, etag?: string | null): Promise<Snapshot> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new UpstreamError('timeout', 'SYNC_TIMEOUT', '模块采集超过 60 秒，保留最近完整快照')); }, 60000); });
  try { return await Promise.race([collect(id, controller.signal, etag), timeout]); }
  finally { clearTimeout(timer!); }
}
export async function refresh(requestId: string) {
  const module = findModule(requestId);
  if (!module || module.source === 'local') throw new ApiError(404, 'NOT_REFRESHABLE', '此模块不支持同步');
  const id = canonical(requestId), ids = id.startsWith('neoblog.') ? blogIds : [id];
  if (running.has(id)) throw new ApiError(409, 'ALREADY_REFRESHING', '模块正在刷新');
  running.add(id);
  try {
    const cache = await prisma.showcaseCache.findUnique({ where: { moduleId: id } });
    const sourceIds = modules.filter(m => m.source === module.source).map(m => m.id);
    const sourceLimits = await prisma.showcaseCache.findMany({ where: { moduleId: { in: sourceIds }, lastResult: 'rate_limited' } });
    // nextAttemptAt 包含正常轮询窗口和上游 Retry-After；手动请求遵循同一窗口。
    const earliest = Math.max(cache?.nextAttemptAt?.getTime() || 0, (cache?.lastAttemptAt?.getTime() || 0) + 30000, ...sourceLimits.map(c => c.nextAttemptAt?.getTime() || 0));
    if (earliest > Date.now()) throw new ApiError(429, 'REFRESH_TOO_SOON', '尚未到允许刷新时间', Math.ceil((earliest - Date.now()) / 1000));
    if (!configured(id)) throw new ApiError(503, 'SOURCE_UNCONFIGURED', '来源参数或凭据未配置');
    const start = Date.now(), attemptedAt = new Date(start);
    await prisma.$transaction(ids.map(moduleId => prisma.showcaseCache.upsert({ where: { moduleId }, update: { lastAttemptAt: attemptedAt }, create: { moduleId, lastAttemptAt: attemptedAt } })));
    try {
      const result = await withinBudget(id, cache?.etag);
      if (result.notModified && (!cache?.lastSuccessAt || cache.payload === null || cache.blocked)) throw new UpstreamError('error', 'EMPTY_NOT_MODIFIED', '上游返回未修改但本地快照不可用');
      const now = new Date();
      // 正常刷新仍允许三十秒后手动触发；定时调度另按模块刷新间隔判断。
      const nextAttemptAt = new Date(Date.now() + Math.max(30000, result.pollMs || 0));
      await prisma.$transaction(async tx => {
        if (id === 'github.languages') {
          const pinned = await tx.showcaseCache.findUnique({ where: { moduleId: 'github.pinned' } });
          if (pinned?.blocked || pinned?.lastSuccessAt?.toISOString() !== result.parentSuccessAt) throw new UpstreamError('error', 'PINNED_CHANGED', '置顶仓库在采集期间变化，稍后重新获取语言', undefined, 30000);
        }
        for (const moduleId of ids) await tx.showcaseCache.update({ where: { moduleId }, data: { ...(result.notModified ? {} : { payload: result.payload as Prisma.InputJsonValue }), lastSuccessAt: now, lastResult: 'ok', blocked: false, lastErrorCode: null, lastErrorMessage: null, upstreamStatus: null, durationMs: Date.now() - start, nextAttemptAt, etag: result.etag || null } });
        // 更新置顶列表即使语言采集随后失败，也不能继续公开上一组仓库的语言。
        if (id === 'github.pinned') await tx.showcaseCache.upsert({ where: { moduleId: 'github.languages' }, update: { blocked: true, nextAttemptAt: null }, create: { moduleId: 'github.languages', blocked: true } });
      });
      if (id === 'github.pinned') {
        try { await refresh('github.languages'); } catch { /* 语言失败的状态已由同一同步器保存；置顶列表本身仍刷新成功。 */ }
      }
      return { moduleId: requestId, updatedAt: now.toISOString() };
    } catch (error) {
      const failure = error instanceof UpstreamError ? error : new UpstreamError('error', 'INVALID_UPSTREAM_DATA', '来源数据格式异常，保留最近完整快照');
      const nextAttemptAt = new Date(Date.now() + Math.max(30000, failure.retryMs || module.interval));
      await prisma.$transaction(async tx => {
        for (const moduleId of ids) await tx.showcaseCache.update({ where: { moduleId }, data: { lastResult: failure.result, lastErrorCode: failure.code, lastErrorMessage: failure.message, upstreamStatus: failure.status ?? null, durationMs: Date.now() - start, nextAttemptAt, ...(failure.privateData ? { blocked: true } : {}) } });
        // 用户整体资料隐藏或消失时，立即停止同一账号的旧快照公开，不等待各自的下一次定时采集。
        if (failure.privateData && ['steam.profile', 'steam.status', 'github.profile', 'github.activity', 'github.pinned'].includes(id)) {
          for (const moduleId of sourceIds.filter(s => s !== id)) {
            if (await tx.showcaseCache.findUnique({ where: { moduleId } })) await tx.showcaseCache.update({ where: { moduleId }, data: { blocked: true, lastResult: 'private', lastErrorCode: 'ACCOUNT_NOT_PUBLIC', lastErrorMessage: '账号资料已隐藏或不存在', nextAttemptAt } });
          }
        }
        if (failure.withdrawnItem) {
          const pinned = await tx.showcaseCache.findUnique({ where: { moduleId: 'github.pinned' } });
          if (Array.isArray(pinned?.payload)) {
            // 确认单个仓库删除或转私有时，剔除该条公开信息；不虚构父模块的新成功采集时间。
            const payload = pinned.payload.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item) && String(item.itemId) !== failure.withdrawnItem);
            await tx.showcaseCache.update({ where: { moduleId: 'github.pinned' }, data: { payload: payload as Prisma.InputJsonValue } });
          }
        }
      });
      throw new ApiError(502, failure.code, failure.message, failure.result === 'rate_limited' ? Math.ceil((nextAttemptAt.getTime() - Date.now()) / 1000) : undefined);
    }
  } finally { running.delete(id); }
}
let timer: ReturnType<typeof setInterval> | undefined, ticking = false, stopped = false;
export function startScheduler() {
  if (!env.syncEnabled) return;
  stopped = false;
  const tick = async () => {
    if (ticking || stopped) return;
    ticking = true;
    try {
      for (const module of modules) {
        if (stopped) break;
        if (!module.interval || !configured(module.id) || isRefreshing(module.id) || ['neoblog.tags', 'neoblog.archive'].includes(module.id)) continue;
        const cache = await prisma.showcaseCache.findUnique({ where: { moduleId: module.id } });
        const next = Math.max(cache?.nextAttemptAt?.getTime() || 0, cache?.blocked ? (cache.lastAttemptAt?.getTime() || 0) + 30000 : (cache?.lastSuccessAt?.getTime() || 0) + module.interval);
        if (next <= Date.now()) { try { await refresh(module.id); } catch { /* 单个模块失败不阻断其他来源，脱敏状态保存在数据库。 */ } }
      }
    } catch { console.error('同步调度读取失败'); } finally { ticking = false; }
  };
  void tick(); timer = setInterval(() => void tick(), 30000); timer.unref();
}
export function stopScheduler() { stopped = true; if (timer) clearInterval(timer); }

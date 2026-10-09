/** 管理 API 契约；导出用户、内容、分页、模块状态及标准化缓存数据类型。 */
export interface User { id: number; username: string; role: 'admin' | 'member' }
export interface PersonalStatus { text: string; visible: boolean; expiresAt: string | null; updatedAt?: string }
export interface Goal { id: number; title: string; description: string | null; progress: number | null; status: 'planned' | 'active' | 'paused' | 'completed'; visible: boolean; sortOrder: number }
export interface Pagination { page: number; limit: number; total: number }
export interface Envelope<T> { success: boolean; data: T; pagination?: Pagination; meta?: { freshness: string; updatedAt: string | null } }
export interface Module { id: string; name: string; source: string; list: boolean; items: boolean; visible: boolean; configured: boolean; refreshing: boolean; freshness: string | null; count: number; lastResult: string; lastAttemptAt: string | null; lastSuccessAt: string | null; nextAttemptAt: string | null; durationMs: number | null; lastErrorMessage: string | null; parent?: string }
export interface Source { source: string; kind: string; configured: boolean; state: string; lastSuccessAt: string | null }
export type DataItem = Record<string, unknown> & { itemId?: string; visible?: boolean; name?: string; title?: string; repo?: string; fullName?: string };

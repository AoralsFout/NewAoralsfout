/** 基于 NeoBlog fetch 封装的同源 API 客户端；支持统一错误、无内容响应与刷新超时。 */
import type { Envelope } from './types';
export class HttpError extends Error { constructor(public status: number, message: string, public retryAfter?: number) { super(message); } }
export async function request<T>(path: string, method = 'GET', data?: unknown): Promise<Envelope<T>> {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: data === undefined ? undefined : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(130000) });
  if (response.status === 204) return { success: true, data: undefined as T };
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new HttpError(response.status, result?.error?.message || `请求失败 (${response.status})`, Number(response.headers.get('Retry-After')) || undefined);
  return result;
}
export const admin = '/api/showcase/admin';

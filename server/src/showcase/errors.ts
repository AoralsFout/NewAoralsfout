/** 受控错误类型与统一响应；不将数据库异常或上游请求对象返回浏览器。 */
import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues.map(i => `${i.path.join('.') || '请求'}: ${i.message}`).join('；') } }); return;
  }
  if (error instanceof ApiError) {
    if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } }); return;
  }
  if (error?.code === 'P2025') { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '资源不存在' } }); return; }
  if (error?.type === 'entity.parse.failed') { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '请求体不是有效 JSON' } }); return; }
  if (error?.type === 'entity.too.large') { res.status(413).json({ success: false, error: { code: 'BODY_TOO_LARGE', message: '请求体过大' } }); return; }
  console.error('服务处理失败', { code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR' });
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时无法处理请求' } });
};

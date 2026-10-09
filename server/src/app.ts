/** Express 应用工厂；导出 app 供启动和 HTTP 集成测试，统一安全头、限频和错误处理。 */
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import prisma from '../config/database';
import { authRouter } from './auth';
import { adminRouter, publicRouter } from './showcase/routes';
import { errorHandler } from './showcase/errors';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁' } } }));
app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ success: true, data: { status: 'ok' } }); }
  catch { res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: '数据库不可用' } }); }
});
app.use('/api/auth', authRouter);
app.use('/api/showcase/admin', adminRouter);
app.use('/api', publicRouter);
app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }));
app.use(errorHandler);

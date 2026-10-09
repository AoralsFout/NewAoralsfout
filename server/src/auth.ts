/** 独立服务鉴权路由；复用 NeoBlog 登录服务、数据库角色和令牌撤销，补充浏览器绑定与来源校验。 */
import { Router, RequestHandler } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { AUTH_COOKIE_NAME } from '../config/auth';
import { parseCookies } from '../utils/cookie';
import authService from '../services/auth.service';
import oauthService from '../services/oauth.service';
import prisma from '../config/database';
import { authenticate } from '../middleware/auth';
import { ApiError } from './showcase/errors';
const cookieOptions = { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax' as const, path: '/', ...(env.cookieDomain ? { domain: env.cookieDomain } : {}) };
export const checkOrigin: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  if (req.headers.origin !== new URL(env.frontendUrl).origin) throw new ApiError(403, 'INVALID_ORIGIN', '请求来源不允许');
  next();
};
export const authRouter = Router();
authRouter.get('/natayark', (_req, res) => {
  if (!env.clientId || !env.clientSecret) throw new ApiError(503, 'OAUTH_UNCONFIGURED', '尚未配置 OAuth 登录');
  const state = oauthService.generateState();
  // 绑定发起登录的浏览器，避免只验证 HMAC 时出现登录 CSRF；十分钟后失效。
  res.cookie('showcase_oauth_state', state, { ...cookieOptions, maxAge: 10 * 60_000 });
  res.redirect(oauthService.getAuthorizationUrl(state));
});
authRouter.get('/natayark/callback', async (req, res) => {
  const { code, state } = req.query;
  const expected = parseCookies(req.headers.cookie).showcase_oauth_state;
  res.clearCookie('showcase_oauth_state', cookieOptions);
  if (typeof code !== 'string' || typeof state !== 'string' || !expected || Buffer.byteLength(expected) !== Buffer.byteLength(state) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(state)) || !oauthService.validateState(state)) {
    throw new ApiError(400, 'INVALID_STATE', '登录已过期或无效，请重新登录');
  }
  try {
    const { user, token } = await authService.handleOAuthCallback(code, state);
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } });
    if (account?.status !== 'NORMAL') throw new ApiError(403, 'USER_DISABLED', '账号不可用');
    res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60_000 });
    res.redirect(`${env.frontendUrl.replace(/\/$/, '')}/auth/callback`);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'OAUTH_FAILED', '登录服务暂时不可用，请重试');
  }
});
authRouter.get('/me', authenticate, async (req, res) => res.json({ success: true, data: await authService.getUserProfile(req.user!.userId) }));
authRouter.post('/logout', authenticate, checkOrigin, async (req, res) => {
  await authService.revokeUserToken(req.user!.userId);
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
  res.json({ success: true, data: null });
});

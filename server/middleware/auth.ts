/** 复用 NeoBlog 的 middleware/auth.ts；承担同名模块职责并保留原有导出。 */
import { Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader, verifyToken, JwtPayload } from '../utils/jwt';
import { parseCookies } from '../utils/cookie';
import { AUTH_COOKIE_NAME } from '../config/auth';
import prisma from '../config/database';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * 会话解析失败的分类结果。
 * 用于让 authenticate 精确地映射到既有的 401 错误码分支，
 * 同时让 authenticateOptional 可以静默忽略。
 */
type SessionFailure = 'NO_TOKEN' | 'INVALID_TOKEN' | 'USER_DISABLED' | 'TOKEN_REVOKED';

interface SessionResult {
  payload: JwtPayload | null;
  failure: SessionFailure | null;
}

const FAILURE_RESPONSES: Record<SessionFailure, { code: string; message: string }> = {
  NO_TOKEN: { code: 'UNAUTHORIZED', message: '请先登录' },
  INVALID_TOKEN: { code: 'INVALID_TOKEN', message: '无效的认证令牌' },
  USER_DISABLED: { code: 'USER_DISABLED', message: '用户不存在或已被禁用' },
  TOKEN_REVOKED: { code: 'TOKEN_REVOKED', message: '认证令牌已失效，请重新登录' },
};

/**
 * 从 Authorization Bearer 头或 HttpOnly Cookie 中提取令牌
 */
const extractToken = (req: Request): string | null => {
  const cookieToken = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME];
  return extractTokenFromHeader(req.headers.authorization) ?? cookieToken;
};

/**
 * 会话解析：提取令牌 → 验证签名 → 校验用户存在、状态正常、令牌版本匹配。
 *
 * 这是**唯一**的会话权威实现。所有需要识别当前用户的入口
 * （必需认证与可选认证）都必须经过这里，避免出现校验强度不一致的旁路。
 *
 * 登出/降权立即生效依赖 token_version 比对，因此任何绕过此处直接使用
 * verifyToken 的写法都会破坏撤销语义。
 */
const resolveSession = async (req: Request): Promise<SessionResult> => {
  const token = extractToken(req);
  if (!token) {
    return { payload: null, failure: 'NO_TOKEN' };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { payload: null, failure: 'INVALID_TOKEN' };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, status: true, token_version: true },
  });

  if (!user || user.status !== 'NORMAL') {
    return { payload: null, failure: 'USER_DISABLED' };
  }

  if (user.token_version !== payload.tv) {
    return { payload: null, failure: 'TOKEN_REVOKED' };
  }

  // 以数据库中的最新角色为准（防止令牌中的角色过期）
  return {
    payload: { ...payload, role: user.role.toLowerCase() },
    failure: null,
  };
};

/**
 * 认证中间件（必需登录）：
 * 校验失败时按失败原因返回对应的 401 错误码。
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { payload, failure } = await resolveSession(req);

    if (!payload) {
      const { code, message } = FAILURE_RESPONSES[failure ?? 'INVALID_TOKEN'];
      return res.status(401).json({
        success: false,
        error: { code, message },
      });
    }

    req.user = payload;
    next();
  } catch (error) {
    logger.error('认证中间件错误:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: '认证过程发生错误' },
    });
  }
};

/**
 * 认证中间件（可选登录）：
 * 未登录或令牌失效时不阻断请求，仅不写入 req.user。
 * 适用于"登录后能看到个性化数据、未登录也能读"的接口（如评论列表）。
 */
export const authenticateOptional = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { payload } = await resolveSession(req);
    if (payload) {
      req.user = payload;
    }
    next();
  } catch (error) {
    logger.error('可选认证中间件错误:', error);
    // 会话解析异常不应阻断公开读取，按未登录处理
    next();
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '需要管理员权限' },
    });
  }
  next();
};

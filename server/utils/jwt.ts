/** 复用 NeoBlog 的 utils/jwt.ts；承担同名模块职责并保留原有导出。 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// JWT payload类型
export interface JwtPayload {
  userId: number;
  natayarkId: number;
  username: string;
  role: string;
  /** 令牌版本号，用于登出后整体撤销 */
  tv: number;
  iat?: number;
  exp?: number;
}

/**
 * 生成JWT令牌
 * @param payload JWT payload
 * @returns JWT令牌
 */
export const generateToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, env.jwtSecret as string, {
    expiresIn: env.jwtExpiresIn as any,
    algorithm: 'HS256' as any,
  });
};

/**
 * 验证JWT令牌
 * @param token JWT令牌
 * @returns 解码后的payload或null
 */
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch (error) {
    console.error('JWT验证失败:', error);
    return null;
  }
};

/**
 * 从请求头中提取令牌
 * @param authHeader Authorization头
 * @returns 令牌或null
 */
export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

/**
 * 解码令牌（不验证）
 * @param token JWT令牌
 * @returns 解码后的payload或null
 */
export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    console.error('JWT解码失败:', error);
    return null;
  }
};
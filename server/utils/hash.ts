/** 复用 NeoBlog 的 utils/hash.ts；承担同名模块职责并保留原有导出。 */
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * 哈希密码（用于client_secret的PASSWORD_HASH）
 * @param plainText 明文
 * @returns 哈希后的字符串
 */
export const hashPassword = async (plainText: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(plainText, saltRounds)
};

/**
 * 验证密码
 * @param plainText 明文
 * @param hash 哈希值
 * @returns 是否匹配
 */
export const verifyPassword = async (plainText: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(plainText, hash);
};

/**
 * 生成随机令牌（加密安全）
 * @param length 字节数
 * @returns 随机字符串
 */
export const generateRandomToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('base64url');
};
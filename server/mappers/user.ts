/** 复用 NeoBlog 的 mappers/user.ts；承担同名模块职责并保留原有导出。 */
import type { User, Role, Status } from '../types/user';

/**
 * 用户领域对象映射层
 *
 * 这是"数据库表示 ↔ API 表示"的**唯一**转换点。
 * 背景：role / status 在数据库中是 Prisma 大写枚举（ADMIN / NORMAL…），
 * 而对外 API 与前端使用小写（admin / normal…）。
 * 历史上该转换散落在 service、controller、middleware 三处且方向相反，
 * 没有任何一层是权威，任一轮遗漏都会产生静默错值。
 *
 * 约定：
 * - DB → API：读路径统一走 toApiUser()
 * - API → DB：写路径统一走 toDbRole() / toDbStatus()
 * - Controller 只做值域校验，**不得**再做大小写转换
 */

/** API 可接受的 role 值域（由类型派生，避免与类型定义脱节） */
export const API_ROLES = ['admin', 'member'] as const satisfies readonly Role[];

/**
 * 判断任意输入是否是合法的 API role 值
 */
export const isApiRole = (value: unknown): value is Role =>
  typeof value === 'string' && (API_ROLES as readonly string[]).includes(value.toLowerCase());

/**
 * 判断任意输入是否是合法的 API status 值。
 *
 * 值域直接内联，未像 API_ROLES 那样派生为常量——因为后端只有这一处
 * 需要它（没有第二个消费方）。若将来出现第二个消费方，再提取常量。
 */
export const isApiStatus = (value: unknown): value is Status =>
  typeof value === 'string' && ['normal', 'banned', 'frozen'].includes(value.toLowerCase());

/**
 * API role → 数据库枚举值（大写）
 */
export const toDbRole = (role: Role): string => role.toLowerCase().toUpperCase();

/**
 * API status → 数据库枚举值（大写）
 */
export const toDbStatus = (status: Status): string => status.toLowerCase().toUpperCase();

/** toApiUser 接受的 Prisma 用户形态（宽松类型，兼容 select 出的部分字段） */
export interface PrismaUserLike {
  id: number;
  natayark_id: number;
  username: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * 数据库用户记录 → API 用户对象（role / status 统一为小写）
 */
export const toApiUser = (prismaUser: PrismaUserLike): User => ({
  id: prismaUser.id,
  natayark_id: prismaUser.natayark_id,
  username: prismaUser.username,
  email: prismaUser.email,
  avatar: prismaUser.avatar || '',
  role: prismaUser.role.toLowerCase() as Role,
  created_at: toIso(prismaUser.created_at),
  updated_at: toIso(prismaUser.updated_at),
  status: prismaUser.status.toLowerCase() as Status,
});

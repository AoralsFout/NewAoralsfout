/** 请求白名单与字段校验；导出内容、开关、分页及资源 ID 校验器。 */
import { z } from 'zod';
export const goalStatus = z.enum(['planned', 'active', 'paused', 'completed']);
export const statusInput = z.object({
  text: z.string().max(500), visible: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable().refine(v => v === null || Date.parse(v) > Date.now(), '有效期必须晚于当前时间'),
}).strict();
const goalFields = z.object({
  title: z.string().trim().min(1).max(100), description: z.string().max(1000).nullable(),
  progress: z.number().int().min(0).max(100).nullable(), status: goalStatus,
  visible: z.boolean(), sortOrder: z.number().int().min(0).max(2147483647),
}).strict();
export const createGoal = goalFields.partial().extend({ title: goalFields.shape.title });
export const patchGoal = goalFields.partial().refine(v => Object.keys(v).length > 0, '至少修改一个字段');
export const visibilityInput = z.object({ visible: z.boolean() }).strict();
const integerQuery = (fallback: number, max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).optional().default(String(fallback));
export const paginationQuery = z.object({ page: integerQuery(1, 1000000), limit: integerQuery(20, 100) });
export const goalQuery = paginationQuery.extend({ status: goalStatus.optional(), visible: z.enum(['true', 'false']).optional() }).strict();
export const categories = ['watched', 'watching', 'want', 'on_hold', 'dropped'] as const;
export const moduleQuery = paginationQuery.extend({ category: z.enum(categories).optional() }).strict();
export const idInput = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647));

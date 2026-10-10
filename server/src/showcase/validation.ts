/** 请求白名单与字段校验；导出状态、目标、联系方式、开关、分页及资源 ID 校验器。 */
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
const contactText = (max: number) => z.string().trim().min(1, '不能为空').max(max, `最多 ${max} 字`).refine(value => !/[\u0000-\u001f\u007f]/.test(value), '不能包含控制字符');
/** 联系链接只允许无内嵌凭据的 HTTP(S)；邮箱和电话由展示页按类型生成操作链接。 */
const contactUrl = z.string().trim().max(2000, '链接最多 2000 字').url('链接格式无效').refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/[\s\u0000-\u001f\u007f]/.test(value); }
  catch { return false; }
}, '链接必须是无内嵌凭据的 HTTP(S) 地址').nullable();
const contactFields = z.object({
  type: contactText(32), label: contactText(100), value: contactText(500), url: contactUrl,
  visible: z.boolean(), sortOrder: z.number().int().min(0).max(2147483647),
}).strict();
export const createContact = contactFields.partial().extend({ type: contactFields.shape.type, label: contactFields.shape.label, value: contactFields.shape.value });
export const patchContact = contactFields.partial().refine(value => Object.keys(value).length > 0, '至少修改一个字段');
export const contactQuery = paginationQuery.extend({ type: contactText(32).optional(), visible: z.enum(['true', 'false']).optional() }).strict();

/** 展示站 HTTP 路由；导出公开读取和管理员维护路由，集中执行鉴权、Origin 与请求校验。 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../config/database';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { checkOrigin } from '../auth';
import { ApiError } from './errors';
import { createGoal, patchGoal, statusInput, goalQuery, moduleQuery, visibilityInput, idInput } from './validation';
import { findModule, parentOf } from './catalog';
import { readData, moduleStatus, sourceStatus, setItemVisibility } from './service';
import { refresh } from './sync';
export const publicRouter = Router(), adminRouter = Router();
const ok = (data: unknown) => ({ success: true, data });
const moduleVisible = async (id: string) => Boolean((await prisma.showcaseModule.findUnique({ where: { id } }))?.visible);
publicRouter.get('/showcase/modules', async (_req, res) => {
  const modules = await moduleStatus();
  const result = [];
  for (const m of modules.filter(m => m.visible)) {
    const parent = parentOf(m.id);
    if (parent && !modules.find(p => p.id === parent)?.visible) continue;
    let available = m.freshness !== 'unavailable';
    if (parent && modules.find(p => p.id === parent)?.freshness === 'unavailable') available = false;
    if (m.id === 'L07') { const status = await prisma.personalStatus.findUnique({ where: { id: 1 } }); available = Boolean(status?.visible && (!status.expiresAt || status.expiresAt.getTime() > Date.now())); }
    if (m.id === 'L08') available = (await prisma.learningGoal.count({ where: { visible: true, status: { not: 'completed' } } })) > 0;
    result.push({ id: m.id, source: m.source, available });
  }
  res.json(ok(result));
});
publicRouter.get('/showcase/modules/:moduleId/data', async (req, res) => res.json({ success: true, ...await readData(String(req.params.moduleId), moduleQuery.parse(req.query), false) }));
publicRouter.get('/personal-status', async (req, res) => {
  z.object({}).strict().parse(req.query);
  const status = await prisma.personalStatus.findUnique({ where: { id: 1 } });
  res.json(ok(await moduleVisible('L07') && status?.visible && (!status.expiresAt || status.expiresAt.getTime() > Date.now()) ? status : null));
});
publicRouter.get('/learning-goals', async (req, res) => {
  const query = goalQuery.omit({ visible: true }).parse(req.query);
  const where: Prisma.LearningGoalWhereInput = { visible: true, status: query.status || { not: 'completed' } };
  if (!(await moduleVisible('L08'))) { res.json({ ...ok([]), pagination: { page: query.page, limit: query.limit, total: 0 } }); return; }
  const [data, total] = await prisma.$transaction([prisma.learningGoal.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), prisma.learningGoal.count({ where })]);
  res.json({ ...ok(data), pagination: { page: query.page, limit: query.limit, total } });
});
adminRouter.use(authenticate, requireAdmin, checkOrigin);
adminRouter.get('/personal-status', async (_req, res) => res.json(ok(await prisma.personalStatus.findUnique({ where: { id: 1 } }))));
adminRouter.put('/personal-status', async (req, res) => {
  const input = statusInput.parse(req.body), data = { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null };
  res.json(ok(await prisma.personalStatus.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })));
});
adminRouter.get('/learning-goals', async (req, res) => {
  const query = goalQuery.parse(req.query);
  const where = { ...(query.status ? { status: query.status } : {}), ...(query.visible ? { visible: query.visible === 'true' } : {}) };
  const [data, total] = await prisma.$transaction([prisma.learningGoal.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), prisma.learningGoal.count({ where })]);
  res.json({ ...ok(data), pagination: { page: query.page, limit: query.limit, total } });
});
adminRouter.post('/learning-goals', async (req, res) => res.status(201).json(ok(await prisma.learningGoal.create({ data: createGoal.parse(req.body) }))));
adminRouter.patch('/learning-goals/:id', async (req, res) => res.json(ok(await prisma.learningGoal.update({ where: { id: idInput.parse(req.params.id) }, data: patchGoal.parse(req.body) }))));
adminRouter.delete('/learning-goals/:id', async (req, res) => { await prisma.learningGoal.delete({ where: { id: idInput.parse(req.params.id) } }); res.status(204).end(); });
adminRouter.get('/sources', async (_req, res) => res.json(ok(await sourceStatus())));
adminRouter.get('/modules', async (_req, res) => res.json(ok(await moduleStatus())));
adminRouter.get('/modules/:moduleId/data', async (req, res) => res.json({ success: true, ...await readData(String(req.params.moduleId), moduleQuery.parse(req.query), true) }));
adminRouter.patch('/modules/:moduleId', async (req, res) => {
  const id = String(req.params.moduleId);
  if (!findModule(id)) throw new ApiError(404, 'MODULE_NOT_FOUND', '模块不存在');
  res.json(ok(await prisma.showcaseModule.update({ where: { id }, data: visibilityInput.parse(req.body) })));
});
adminRouter.post('/modules/:moduleId/refresh', async (req, res) => {
  z.object({}).strict().parse(req.body ?? {});
  res.json(ok(await refresh(String(req.params.moduleId))));
});
adminRouter.put('/modules/:moduleId/items/:itemId/visibility', async (req, res) => {
  const { visible } = visibilityInput.parse(req.body);
  await setItemVisibility(String(req.params.moduleId), String(req.params.itemId), visible);
  res.json(ok({ visible }));
});

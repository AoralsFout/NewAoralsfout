/** 真实环境联调入口；检查共享数据库鉴权和来源采集，只更新展示站缓存，不编辑博客、账号或个人内容。 */
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { env } from '../config/env';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { app } from '../src/app';
import { refresh } from '../src/showcase/sync';
async function main() {
  const health = await supertest(app).get('/api/health'); assert.equal(health.status, 200);
  assert.equal((await supertest(app).get('/api/showcase/admin/modules')).status, 401);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'NORMAL' } });
  if (!admin) throw new Error('共享数据库没有可用管理员');
  // 本地验收使用现有签名器签发内存令牌，不写入浏览器、文件或输出。
  const cookie = `nb_token=${generateToken({ userId: admin.id, natayarkId: admin.natayark_id, username: admin.username, role: 'admin', tv: admin.token_version })}`;
  assert.equal((await supertest(app).get('/api/showcase/admin/modules').set('Cookie', cookie)).status, 200);
  assert.equal((await supertest(app).post('/api/showcase/admin/learning-goals').set('Cookie', cookie).set('Origin', 'https://invalid.example').send({ title: '不可写入' })).status, 403);
  console.log('真实数据库健康、管理员校验和 Origin 拒绝均通过');
  for (const id of ['neoblog.articles', 'steam.profile', 'steam.status', 'steam.games', 'bangumi.collections', 'github.profile', 'github.activity']) {
    try {
      await refresh(id);
      const cache = await prisma.showcaseCache.findUnique({ where: { moduleId: id } });
      const count = Array.isArray(cache?.payload) ? cache.payload.length : cache?.payload ? 1 : 0;
      console.log(`${id}：采集成功，${count} 条`);
      if (id === 'steam.games' && Array.isArray(cache?.payload)) console.log(`Steam 最近游玩时间字段：${cache.payload.some(i => typeof i === 'object' && i !== null && !Array.isArray(i) && i.lastPlayedAt) ? '本次响应存在有效值' : '本次响应无有效值，显示未知'}`);
    } catch (error) { console.log(`${id}：${error instanceof Error ? error.message : '采集失败'}`); }
  }
  console.log(`GitHub GraphQL 凭据：${env.githubToken ? '已配置' : '未配置'}`);
}
main().catch(() => { console.error('真实环境联调失败，请检查数据库与配置'); process.exitCode = 1; }).finally(() => prisma.$disconnect());

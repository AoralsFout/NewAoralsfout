/** 展示站集成验收；使用内存数据库替身和可控上游验证真实 HTTP 鉴权、过滤、同步与错误，不改共享业务数据。 */
import { before, beforeEach, afterEach, after, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
process.env.FRONTEND_URL = 'http://localhost:5174';
process.env.SYNC_ENABLED = 'false';
let prisma: any, app: any, env: any, generateToken: any, refresh: any;
let users: any[], goals: any[], personal: any, modules: any[], caches: Map<string, any>, overrides: any[];
const origin = 'http://localhost:5174';
const initialCache = (moduleId: string, payload: any = null): any => ({ moduleId, payload, lastAttemptAt: null, lastSuccessAt: payload === null ? null : new Date(), nextAttemptAt: null, lastResult: payload === null ? 'never' : 'ok', lastErrorCode: null, lastErrorMessage: null, upstreamStatus: null, durationMs: null, etag: null, blocked: false });
function token(id = 1, tv = 0) { return generateToken({ userId: id, natayarkId: id, username: '测试', role: 'admin', tv }); }
function http(id = 1) { return supertest(app).get('/api/showcase/admin/modules').set('Cookie', `nb_token=${token(id)}`); }
/** 替身模拟 Prisma 的查询、更新与事务接口，使鉴权、路由和同步代码保持原样运行。 */
before(async () => {
  const db = await import('../config/database'); prisma = db.default;
  // Prisma 委托由动态代理生成，没有标准方法描述符；测试中替换为禁止真实连接的普通委托。
  for (const model of ['user', 'showcaseModule', 'showcaseCache', 'showcaseItemVisibility', 'personalStatus', 'learningGoal', 'article']) {
    prisma[model] = Object.fromEntries(['findUnique', 'findMany', 'update', 'upsert', 'create', 'delete', 'deleteMany', 'count'].map(method => [method, () => { throw new Error(`测试未配置 ${model}.${method}`); }]));
  }
  prisma.$transaction = () => { throw new Error('测试未配置事务'); };
  env = (await import('../config/env')).env;
  app = (await import('../src/app')).app;
  generateToken = (await import('../utils/jwt')).generateToken;
  refresh = (await import('../src/showcase/sync')).refresh;
});
beforeEach(async () => {
  users = [{ id: 1, role: 'ADMIN', status: 'NORMAL', token_version: 0 }, { id: 2, role: 'MEMBER', status: 'NORMAL', token_version: 0 }]; goals = []; personal = null; overrides = []; caches = new Map();
  const catalog = (await import('../src/showcase/catalog')).modules;
  modules = catalog.map(m => ({ id: m.id, source: m.source, visible: true }));
  env.steamKey = 'fixture-key'; env.steamId = '123'; env.bangumiUsername = 'fixture'; env.githubUsername = 'fixture'; env.githubToken = 'fixture-token'; env.blogUrl = 'https://blog.example'; env.blogAssetUrl = 'https://blog.example';
  mock.method(prisma.user, 'findUnique', async ({ where }: any) => users.find(u => u.id === where.id) || null);
  mock.method(prisma.user, 'update', async ({ where, data }: any) => { const user = users.find(u => u.id === where.id); if (data.token_version) user.token_version += data.token_version.increment; return user; });
  mock.method(prisma.showcaseModule, 'findMany', async () => modules);
  mock.method(prisma.showcaseModule, 'findUnique', async ({ where }: any) => modules.find(m => m.id === where.id) || null);
  mock.method(prisma.showcaseModule, 'update', async ({ where, data }: any) => Object.assign(modules.find(m => m.id === where.id), data));
  mock.method(prisma.showcaseCache, 'findUnique', async ({ where }: any) => caches.get(where.moduleId) || null);
  mock.method(prisma.showcaseCache, 'findMany', async ({ where }: any = {}) => [...caches.values()].filter(c => !where || ((!where.moduleId || where.moduleId.in.includes(c.moduleId)) && (!where.lastResult || c.lastResult === where.lastResult))));
  mock.method(prisma.showcaseCache, 'upsert', async ({ where, create, update }: any) => { const record = caches.get(where.moduleId); if (record) return Object.assign(record, update); const created = { ...initialCache(where.moduleId), ...create }; caches.set(where.moduleId, created); return created; });
  mock.method(prisma.showcaseCache, 'update', async ({ where, data }: any) => Object.assign(caches.get(where.moduleId), data));
  mock.method(prisma.showcaseItemVisibility, 'findMany', async ({ where }: any) => overrides.filter(o => o.moduleId === where.moduleId && o.visible === where.visible));
  mock.method(prisma.showcaseItemVisibility, 'findUnique', async ({ where }: any) => overrides.find(o => o.moduleId === where.moduleId_itemId.moduleId && o.itemId === where.moduleId_itemId.itemId) || null);
  mock.method(prisma.showcaseItemVisibility, 'deleteMany', async ({ where }: any) => { overrides = overrides.filter(o => o.moduleId !== where.moduleId || o.itemId !== where.itemId); return { count: 1 }; });
  mock.method(prisma.showcaseItemVisibility, 'upsert', async ({ where, create, update }: any) => { const current = overrides.find(o => o.moduleId === where.moduleId_itemId.moduleId && o.itemId === where.moduleId_itemId.itemId); if (current) return Object.assign(current, update); overrides.push(create); return create; });
  mock.method(prisma.personalStatus, 'findUnique', async () => personal);
  mock.method(prisma.personalStatus, 'upsert', async ({ create, update }: any) => { personal = { ...(personal || create), ...(personal ? update : {}), updatedAt: new Date() }; return personal; });
  const filterGoals = (where: any = {}) => goals.filter(g => (where.visible === undefined || g.visible === where.visible) && (!where.status || (typeof where.status === 'string' ? g.status === where.status : g.status !== where.status.not)));
  mock.method(prisma.learningGoal, 'findMany', async ({ where, skip, take }: any) => filterGoals(where).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).slice(skip, skip + take));
  mock.method(prisma.learningGoal, 'count', async ({ where }: any) => filterGoals(where).length);
  mock.method(prisma.learningGoal, 'create', async ({ data }: any) => { const goal = { id: goals.length + 1, description: null, progress: null, status: 'planned', visible: false, sortOrder: 0, ...data }; goals.push(goal); return goal; });
  mock.method(prisma.learningGoal, 'update', async ({ where, data }: any) => { const goal = goals.find(g => g.id === where.id); if (!goal) throw { code: 'P2025' }; return Object.assign(goal, data); });
  mock.method(prisma.learningGoal, 'delete', async ({ where }: any) => { const goal = goals.find(g => g.id === where.id); if (!goal) throw { code: 'P2025' }; goals = goals.filter(g => g.id !== where.id); return goal; });
  mock.method(prisma, '$transaction', async (operation: any) => typeof operation === 'function' ? operation(prisma) : Promise.all(operation));
});
afterEach(() => mock.restoreAll());
after(async () => prisma.$disconnect());
test('未登录 401，普通成员 403；数据库最新角色、禁用状态和令牌版本立即生效', async () => {
  assert.equal((await supertest(app).get('/api/showcase/admin/modules')).status, 401);
  assert.equal((await http(2)).status, 403);
  assert.equal((await http()).status, 200);
  users[0].role = 'MEMBER'; assert.equal((await http()).status, 403);
  users[0].role = 'ADMIN'; users[0].status = 'BANNED'; assert.equal((await http()).status, 401);
  users[0].status = 'NORMAL'; users[0].token_version = 1; assert.equal((await http()).status, 401);
});
test('管理员写入拒绝缺失或错误 Origin；退出撤销既有 Cookie', async () => {
  const body = { title: '测试目标' }, cookie = `nb_token=${token()}`;
  assert.equal((await supertest(app).post('/api/showcase/admin/learning-goals').set('Cookie', cookie).send(body)).status, 403);
  assert.equal((await supertest(app).post('/api/showcase/admin/learning-goals').set('Cookie', cookie).set('Origin', 'https://evil.example').send(body)).status, 403);
  assert.equal((await supertest(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', origin).send({})).status, 200);
  assert.equal((await supertest(app).get('/api/showcase/admin/modules').set('Cookie', cookie)).status, 401);
});
test('状态完整保存、清空、过期与双层可见性；拒绝非法有效期和字段', async () => {
  const put = (body: any) => supertest(app).put('/api/showcase/admin/personal-status').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(body);
  assert.equal((await put({ text: '学习中', availability: 'open', visible: true, expiresAt: null })).status, 200);
  assert.equal((await supertest(app).get('/api/personal-status')).body.data.text, '学习中');
  personal.expiresAt = new Date(Date.now() - 1000); assert.equal((await supertest(app).get('/api/personal-status')).body.data, null);
  assert.equal((await put({ text: '', availability: 'unknown', visible: true, expiresAt: null })).status, 200);
  modules.find(m => m.id === 'L07').visible = false; assert.equal((await supertest(app).get('/api/personal-status')).body.data, null);
  assert.equal((await put({ text: '', availability: 'open', visible: true, expiresAt: '2000-01-01T00:00:00Z' })).status, 400);
  assert.equal((await put({ text: '', availability: 'open', visible: true, expiresAt: null, role: 'admin' })).status, 400);
});
test('目标默认隐藏，维护进度和归档，过滤后分页，删除返回 204', async () => {
  const create = (body: any) => supertest(app).post('/api/showcase/admin/learning-goals').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(body);
  assert.equal((await create({ title: '默认目标' })).body.data.visible, false);
  await create({ title: '学习目标', status: 'active', visible: true, progress: 20, sortOrder: 2 });
  await create({ title: '归档目标', status: 'completed', visible: true, progress: 100 });
  const active = await supertest(app).get('/api/learning-goals?limit=1'); assert.equal(active.body.pagination.total, 1); assert.equal(active.body.data[0].title, '学习目标');
  assert.equal((await supertest(app).get('/api/learning-goals?status=completed')).body.pagination.total, 1);
  assert.equal((await create({ title: '非法', progress: 101 })).status, 400);
  assert.equal((await supertest(app).get('/api/learning-goals?page=0')).status, 400);
  assert.equal((await supertest(app).get('/api/learning-goals?limit=101')).status, 400);
  assert.equal((await supertest(app).get('/api/learning-goals?visible=false')).status, 400);
  assert.equal((await supertest(app).patch('/api/showcase/admin/learning-goals/2').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({ progress: null, sortOrder: 0 })).status, 200);
  assert.equal((await supertest(app).delete('/api/showcase/admin/learning-goals/2').set('Cookie', `nb_token=${token()}`).set('Origin', origin)).status, 204);
  assert.equal((await supertest(app).delete('/api/showcase/admin/learning-goals/2').set('Cookie', `nb_token=${token()}`).set('Origin', origin)).status, 404);
});
test('隐藏博客文章立即影响标签、归档和数量，关闭父模块使关联接口 404', async () => {
  const articles = [{ itemId: '1', id: 1, title: '公开', tags: ['Vue'], createdAt: '2026-01-01T00:00:00Z' }, { itemId: '2', id: 2, title: '隐藏', tags: ['Secret'], createdAt: '2026-02-01T00:00:00Z', secret: '不应输出' }];
  caches.set('neoblog.articles', initialCache('neoblog.articles', articles));
  const put = await supertest(app).put('/api/showcase/admin/modules/neoblog.articles/items/2/visibility').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({ visible: false }); assert.equal(put.status, 200);
  const articleResponse = await supertest(app).get('/api/showcase/modules/neoblog.articles/data'); assert.equal(articleResponse.body.pagination.total, 1);
  const tags = await supertest(app).get('/api/showcase/modules/neoblog.tags/data'); assert.deepEqual(tags.body.data, [{ name: 'Vue', count: 1 }]);
  assert.equal((await supertest(app).get('/api/showcase/modules/neoblog.archive/data')).body.data[0].count, 1);
  const admin = await supertest(app).get('/api/showcase/admin/modules/neoblog.articles/data').set('Cookie', `nb_token=${token()}`); assert.equal(admin.body.pagination.total, 2); assert.equal(admin.body.data[1].visible, false);
  modules.find(m => m.id === 'neoblog.articles').visible = false;
  assert.equal((await supertest(app).get('/api/showcase/modules/neoblog.tags/data')).status, 404);
  assert.equal((await supertest(app).get('/api/showcase/modules/not-real/data')).status, 404);
});
test('公开字段白名单、Steam 五分钟失效、空快照成功、后台状态不泄露配置', async () => {
  const cache = initialCache('steam.status', { state: 1, gameName: null, gameId: null, token: 'secret' }); caches.set('steam.status', cache);
  const fresh = await supertest(app).get('/api/showcase/modules/steam.status/data'); assert.equal(fresh.status, 200); assert.equal(fresh.body.data.token, undefined); assert.equal(fresh.headers['cache-control'], 'no-store');
  cache.lastSuccessAt = new Date(Date.now() - 300001); assert.equal((await supertest(app).get('/api/showcase/modules/steam.status/data')).status, 503);
  caches.set('steam.games', initialCache('steam.games', [])); assert.equal((await supertest(app).get('/api/showcase/modules/steam.games/data')).status, 200);
  assert.equal((await http()).text.includes('fixture-key'), false);
  assert.equal((await supertest(app).get('/api/showcase/modules/steam.games/data?category=watched')).status, 400);
});
test('置顶仓库隐藏和移除同步过滤语言，父快照失效时停止公开语言', async () => {
  caches.set('github.pinned', initialCache('github.pinned', [{ itemId: '1', name: '保留' }, { itemId: '2', name: '隐藏' }]));
  caches.set('github.languages', initialCache('github.languages', [{ itemId: '1', name: '保留', languages: [] }, { itemId: '2', name: '隐藏', languages: [] }, { itemId: '3', name: '移除', languages: [] }]));
  overrides.push({ moduleId: 'github.pinned', itemId: '2', visible: false });
  const response = await supertest(app).get('/api/showcase/modules/github.languages/data'); assert.equal(response.body.pagination.total, 1); assert.equal(response.body.data[0].name, '保留');
  caches.get('github.pinned').blocked = true; assert.equal((await supertest(app).get('/api/showcase/modules/github.languages/data')).status, 503);
});
test('失败保留完整快照，成功空结果覆盖旧列表，隐私撤回停止公开且不清除隐藏设置', async () => {
  caches.set('steam.games', initialCache('steam.games', [{ itemId: '1', appId: 1, name: '原游戏' }])); overrides.push({ moduleId: 'steam.games', itemId: '1', visible: false });
  mock.method(globalThis, 'fetch', async () => { throw new Error('失败地址中含 secret-token'); });
  await assert.rejects(refresh('steam.games'), (e: any) => e.status === 502); assert.equal(caches.get('steam.games').payload[0].name, '原游戏'); assert.equal(caches.get('steam.games').lastErrorMessage.includes('secret-token'), false);
  caches.get('steam.games').nextAttemptAt = null; caches.get('steam.games').lastAttemptAt = null;
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ response: { game_count: 0 } })));
  await refresh('steam.games'); assert.deepEqual(caches.get('steam.games').payload, []); assert.equal(overrides.length, 1);
  caches.get('steam.games').nextAttemptAt = null; caches.get('steam.games').lastAttemptAt = null;
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ response: {} })));
  await assert.rejects(refresh('steam.games')); assert.equal(caches.get('steam.games').blocked, true); assert.equal((await supertest(app).get('/api/showcase/modules/steam.games/data')).status, 503);
});
test('同步重入返回 409，三十秒窗口和来源限流返回 429，普通 403 不当作隐私撤回', async () => {
  let unblock!: (response: Response) => void;
  mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { unblock = resolve; }));
  const pending = refresh('steam.games');
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(refresh('steam.games'), (e: any) => e.status === 409);
  unblock(new Response(JSON.stringify({ response: { game_count: 0 } }))); await pending;
  await assert.rejects(refresh('steam.games'), (e: any) => e.status === 429 && e.retryAfter > 0);
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }));
  await assert.rejects(refresh('steam.profile'), (e: any) => e.status === 502);
  await assert.rejects(refresh('steam.status'), (e: any) => e.status === 429 && e.retryAfter >= 119);
  caches.clear(); caches.set('github.profile', initialCache('github.profile', { login: 'fixture' }));
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 403 }));
  await assert.rejects(refresh('github.profile')); assert.equal(caches.get('github.profile').blocked, false); assert.equal(caches.get('github.profile').lastResult, 'auth_error');
});
test('Bangumi 五类完整分页后按本人评分排序；中途失败保留全部旧快照', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async (url: string) => { calls++; const parsed = new URL(url), offset = Number(parsed.searchParams.get('offset')), type = Number(parsed.searchParams.get('type')); const data = Array.from({ length: offset === 0 ? 100 : 2 }, (_, index) => ({ subject_id: type * 1000 + offset + index, rate: offset === 0 ? 0 : 10, subject: { name: '动画', images: { large: 'https://example.com/image.jpg' } } })); return new Response(JSON.stringify({ total: 102, data })); });
  await refresh('bangumi.collections'); assert.equal(calls, 10); assert.equal(caches.get('bangumi.collections').payload.length, 510);
  const result = await supertest(app).get('/api/showcase/modules/bangumi.collections/data?category=watching&limit=1'); assert.equal(result.body.pagination.total, 102); assert.equal(result.body.data[0].rate, 10);
  const cache = caches.get('bangumi.collections'), snapshot = cache.payload; cache.nextAttemptAt = null; cache.lastAttemptAt = null;
  mock.method(globalThis, 'fetch', async (url: string) => { if (Number(new URL(url).searchParams.get('offset')) > 0) throw new Error('分页失败'); return new Response(JSON.stringify({ total: 102, data: Array.from({ length: 100 }, (_, i) => ({ subject_id: i, rate: 1, subject: { name: '动画' } })) })); });
  await assert.rejects(refresh('bangumi.collections')); assert.equal(cache.payload, snapshot);
});
test('GitHub ETag 304 保留活动数据并更新成功时间；轮询窗口不被手动刷新绕过', async () => {
  const cache = initialCache('github.activity', [{ itemId: '1', type: 'PushEvent', repo: 'a/b', createdAt: '2026-01-01T00:00:00Z' }]); cache.etag = 'fixture-etag'; caches.set('github.activity', cache);
  mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => { assert.equal((options.headers as Record<string, string>)['If-None-Match'], 'fixture-etag'); return new Response(null, { status: 304, headers: { ETag: 'fixture-etag', 'X-Poll-Interval': '90' } }); });
  await refresh('github.activity'); assert.equal(cache.payload.length, 1); assert.equal(cache.lastResult, 'ok');
  await assert.rejects(refresh('github.activity'), (e: any) => e.retryAfter >= 89);
});
test('GitHub 贡献图、置顶白名单和关联语言完整采集，语言字节占比按仓库计算', async () => {
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    if (url.endsWith('/graphql')) {
      const query = JSON.parse(String(options.body)).query;
      const user = query.includes('contributionsCollection') ? { contributionsCollection: { contributionCalendar: { totalContributions: 2, weeks: [{ contributionDays: [{ date: '2026-01-01', contributionCount: 2, color: '#216e39' }] }] } } } : { pinnedItems: { nodes: [{ databaseId: 1, name: 'repo', nameWithOwner: 'fixture/repo', description: null, url: 'https://github.com/fixture/repo', homepageUrl: '', stargazerCount: 2, isPrivate: false, primaryLanguage: { name: 'TypeScript' } }, { databaseId: 2, isPrivate: true }] } };
      return new Response(JSON.stringify({ data: { user } }));
    }
    return new Response(JSON.stringify({ TypeScript: 75, JavaScript: 25 }));
  });
  await refresh('github.contributions'); await refresh('github.pinned');
  assert.equal(caches.get('github.contributions').payload.totalContributions, 2);
  assert.equal(caches.get('github.pinned').payload.length, 1);
  assert.equal(caches.get('github.languages').blocked, false);
  assert.equal(caches.get('github.languages').payload[0].languages[0].percentage, 75);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.languages/data')).body.pagination.total, 1);
});
test('语言采集期间父快照变动时不提交旧结果；未配置凭据返回 503', async () => {
  caches.set('github.pinned', initialCache('github.pinned', [{ itemId: '1', name: 'repo', fullName: 'fixture/repo' }]));
  caches.set('github.languages', initialCache('github.languages', [{ itemId: '1', name: '旧语言', languages: [] }]));
  mock.method(globalThis, 'fetch', async () => {
    caches.get('github.pinned').lastSuccessAt = new Date(Date.now() + 1000);
    caches.get('github.languages').blocked = true;
    return new Response(JSON.stringify({ TypeScript: 100 }));
  });
  await assert.rejects(refresh('github.languages'), (e: any) => e.code === 'PINNED_CHANGED');
  assert.equal(caches.get('github.languages').payload[0].name, '旧语言');
  assert.equal(caches.get('github.languages').blocked, true);
  env.githubToken = '';
  await assert.rejects(refresh('github.contributions'), (e: any) => e.status === 503);
});
test('已知账号隐藏立即阻止同源旧快照，语言接口确认仓库撤回时剔除父列表对应仓库', async () => {
  caches.set('steam.games', initialCache('steam.games', [{ itemId: '1', name: '旧游戏' }]));
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ response: { players: [{ steamid: '123', communityvisibilitystate: 1 }] } })));
  await assert.rejects(refresh('steam.profile'));
  assert.equal((await supertest(app).get('/api/showcase/modules/steam.games/data')).status, 503);
  caches.set('github.pinned', initialCache('github.pinned', [{ itemId: '1', name: '转私有', fullName: 'fixture/private' }, { itemId: '2', name: '公开', fullName: 'fixture/public' }]));
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));
  await assert.rejects(refresh('github.languages'));
  assert.equal(caches.get('github.pinned').payload.length, 1);
  assert.equal(caches.get('github.pinned').payload[0].itemId, '2');
});

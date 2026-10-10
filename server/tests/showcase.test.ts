/** 展示站集成验收；使用内存数据库替身和可控上游验证 HTTP 鉴权、联系方式维护、完整仓库分页、语言汇总及过滤，不改共享业务数据。 */
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
let contactMethods: any[], nextContactId: number;
const origin = 'http://localhost:5174';
const initialCache = (moduleId: string, payload: any = null): any => ({ moduleId, payload, lastAttemptAt: null, lastSuccessAt: payload === null ? null : new Date(), nextAttemptAt: null, lastResult: payload === null ? 'never' : 'ok', lastErrorCode: null, lastErrorMessage: null, upstreamStatus: null, durationMs: null, etag: null, blocked: false });
/** 构造仓库上游响应；包含 Fork、归档与空字段，以验证新增接口的实际字段映射。 */
const repository = (id: number) => ({ id, name: `repo-${id}`, full_name: `fixture/repo-${id}`, private: false, description: null, html_url: `https://github.com/fixture/repo-${id}`, homepage: '', stargazers_count: id, forks_count: 2, language: id === 1 ? null : 'TypeScript', fork: id === 1, archived: id === 2, default_branch: 'main', topics: ['web'], created_at: '2026-01-01T00:00:00Z', updated_at: id === 101 ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z', pushed_at: null });
function token(id = 1, tv = 0) { return generateToken({ userId: id, natayarkId: id, username: '测试', role: 'admin', tv }); }
function http(id = 1) { return supertest(app).get('/api/showcase/admin/modules').set('Cookie', `nb_token=${token(id)}`); }
/** 替身模拟 Prisma 的查询、更新与事务接口，使鉴权、路由和同步代码保持原样运行。 */
before(async () => {
  const db = await import('../config/database'); prisma = db.default;
  // Prisma 委托由动态代理生成，没有标准方法描述符；测试中替换为禁止真实连接的普通委托。
  for (const model of ['user', 'showcaseModule', 'showcaseCache', 'showcaseItemVisibility', 'personalStatus', 'learningGoal', 'contactMethod', 'article']) {
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
  contactMethods = []; nextContactId = 1;
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
  const filterContacts = (where: any = {}) => contactMethods.filter(contact => (where.visible === undefined || contact.visible === where.visible) && (!where.type || contact.type === where.type));
  mock.method(prisma.contactMethod, 'findMany', async ({ where, skip, take }: any) => filterContacts(where).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).slice(skip, skip + take));
  mock.method(prisma.contactMethod, 'count', async ({ where }: any) => filterContacts(where).length);
  mock.method(prisma.contactMethod, 'create', async ({ data }: any) => { const contact = { id: nextContactId++, url: null, visible: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...data }; contactMethods.push(contact); return contact; });
  mock.method(prisma.contactMethod, 'update', async ({ where, data }: any) => { const contact = contactMethods.find(item => item.id === where.id); if (!contact) throw { code: 'P2025' }; return Object.assign(contact, data, { updatedAt: new Date() }); });
  mock.method(prisma.contactMethod, 'delete', async ({ where }: any) => { const contact = contactMethods.find(item => item.id === where.id); if (!contact) throw { code: 'P2025' }; contactMethods = contactMethods.filter(item => item.id !== where.id); return contact; });
  mock.method(prisma, '$transaction', async (operation: any) => typeof operation === 'function' ? operation(prisma) : Promise.all(operation));
});
afterEach(() => mock.restoreAll());
after(async () => prisma.$disconnect());

test('联系方式自定义类型增删改，默认隐藏，公开投影、排序及过滤后分页，模块关闭即时生效', async () => {
  const create = (body: any) => supertest(app).post('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(body);
  const patch = (id: number, body: any) => supertest(app).patch(`/api/showcase/admin/contacts/${id}`).set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(body);
  assert.equal((await supertest(app).get('/api/showcase/modules')).body.data.find((m: any) => m.id === 'contacts').available, false);
  const hidden = await create({ type: 'wechat', label: '微信', value: 'hidden-account' });
  assert.equal(hidden.status, 201); assert.equal(hidden.body.data.visible, false); assert.equal(hidden.body.data.url, null); assert.equal(hidden.body.data.sortOrder, 0);
  const email = await create({ type: ' email ', label: ' 工作邮箱 ', value: ' hello@example.com ', visible: true, sortOrder: 2 });
  assert.equal(email.body.data.label, '工作邮箱');
  const custom = await create({ type: '自定义平台', label: '作品主页', value: '作品集', url: 'https://example.com/work', visible: true, sortOrder: 1 });
  const duplicateOrder = await create({ type: 'phone', label: '电话', value: '+86 123456789', visible: true, sortOrder: 1 });
  const first = await supertest(app).get('/api/contacts?limit=1');
  assert.equal(first.status, 200); assert.deepEqual(first.body.pagination, { page: 1, limit: 1, total: 3 });
  assert.deepEqual(Object.keys(first.body.data[0]).sort(), ['id', 'type', 'label', 'value', 'url', 'updatedAt'].sort());
  assert.equal(first.body.data[0].id, custom.body.data.id);
  assert.equal((await supertest(app).get('/api/contacts?page=2&limit=1')).body.data[0].id, duplicateOrder.body.data.id);
  assert.equal((await supertest(app).get('/api/contacts?type=email')).body.data[0].value, 'hello@example.com');
  assert.equal((await supertest(app).get('/api/showcase/modules')).body.data.find((m: any) => m.id === 'contacts').available, true);
  const adminList = await supertest(app).get('/api/showcase/admin/contacts?visible=false').set('Cookie', `nb_token=${token()}`);
  assert.equal(adminList.body.pagination.total, 1); assert.equal(adminList.body.data[0].value, 'hidden-account');
  assert.equal((await patch(email.body.data.id, { value: 'changed@example.com', sortOrder: 0 })).status, 200);
  assert.equal((await supertest(app).get('/api/contacts?limit=1')).body.data[0].value, 'changed@example.com');
  await patch(email.body.data.id, { visible: false }); assert.equal((await supertest(app).get('/api/contacts')).body.pagination.total, 2);
  await patch(custom.body.data.id, { url: null }); assert.equal((await supertest(app).get('/api/contacts?limit=1')).body.data[0].url, null);
  modules.find(m => m.id === 'contacts').visible = false;
  const closed = await supertest(app).get('/api/contacts'); assert.equal(closed.status, 200); assert.deepEqual(closed.body.data, []); assert.equal(closed.body.pagination.total, 0);
  assert.equal((await supertest(app).get('/api/showcase/modules')).body.data.some((m: any) => m.id === 'contacts'), false);
  assert.equal((await supertest(app).get('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token()}`)).body.pagination.total, 4);
  assert.equal((await supertest(app).delete(`/api/showcase/admin/contacts/${hidden.body.data.id}`).set('Cookie', `nb_token=${token()}`).set('Origin', origin)).status, 204);
  assert.equal((await supertest(app).delete(`/api/showcase/admin/contacts/${hidden.body.data.id}`).set('Cookie', `nb_token=${token()}`).set('Origin', origin)).status, 404);
});

test('联系方式管理拒绝未登录、普通成员与错误 Origin，未知字段、危险链接和非法分页不能写入或绕过隐藏', async () => {
  const body = { type: 'email', label: '邮箱', value: 'hello@example.com' };
  assert.equal((await supertest(app).get('/api/showcase/admin/contacts')).status, 401);
  assert.equal((await supertest(app).post('/api/showcase/admin/contacts').set('Origin', origin).send(body)).status, 401);
  assert.equal((await supertest(app).get('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token(2)}`)).status, 403);
  assert.equal((await supertest(app).post('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token()}`).send(body)).status, 403);
  assert.equal((await supertest(app).post('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token()}`).set('Origin', 'https://evil.example').send(body)).status, 403);
  const create = (data: any) => supertest(app).post('/api/showcase/admin/contacts').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(data);
  for (const change of [{ type: '' }, { label: ' ' }, { value: '' }, { value: 'line\nbreak' }, { type: 'x'.repeat(33) }, { value: 'x'.repeat(501) }, { sortOrder: -1 }, { sortOrder: 1.5 }, { visible: 'true' }, { id: 3 }, { createdAt: '2026-01-01' }, { url: 'javascript:alert(1)' }, { url: 'data:text/html,hello' }, { url: 'https://user:password@example.com' }, { url: 'https://exa\nmple.com' }]) assert.equal((await create({ ...body, ...change })).status, 400);
  assert.equal(contactMethods.length, 0);
  for (const query of ['page=0', 'limit=101', 'visible=false', 'type=', 'extra=true']) assert.equal((await supertest(app).get(`/api/contacts?${query}`)).status, 400);
  const patch = (id: string, data: any) => supertest(app).patch(`/api/showcase/admin/contacts/${id}`).set('Cookie', `nb_token=${token()}`).set('Origin', origin).send(data);
  assert.equal((await patch('1', {})).status, 400); assert.equal((await patch('0', { visible: true })).status, 400); assert.equal((await patch('999', { visible: true })).status, 404);
  assert.equal((await supertest(app).get('/api/showcase/modules/contacts/data')).status, 404);
});

test('新增仓库模块初始化为隐藏且重复初始化保留已有开关', async () => {
  modules = modules.filter(m => m.id !== 'github.repositories');
  mock.method(prisma.showcaseModule, 'upsert', async ({ where, create, update }: any) => {
    const current = modules.find(m => m.id === where.id);
    if (current) return Object.assign(current, update);
    const created = { visible: false, ...create }; modules.push(created); return created;
  });
  const { initializeModules } = await import('../src/showcase/catalog');
  await initializeModules();
  const added = modules.find(m => m.id === 'github.repositories');
  assert.equal(added.visible, false);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data')).status, 404);
  added.visible = true; await initializeModules(); assert.equal(added.visible, true);
});

test('全部仓库无需 Token，完整分页后映射、排序、过滤私有条目与分页隐藏，管理接口保留内部信息', async () => {
  env.githubToken = '';
  const pages: number[] = [];
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const parsed = new URL(url), page = Number(parsed.searchParams.get('page')); pages.push(page);
    assert.equal(parsed.pathname, '/users/fixture/repos');
    assert.equal(parsed.searchParams.get('per_page'), '100');
    assert.equal(parsed.searchParams.get('type'), 'owner');
    assert.equal(parsed.searchParams.get('sort'), 'full_name');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    const data = page === 1 ? Array.from({ length: 100 }, (_, i) => repository(i + 1)) : [repository(101), { id: 102, private: true, secret: '不得缓存' }];
    return new Response(JSON.stringify(data));
  });
  const refreshResponse = await supertest(app).post('/api/showcase/admin/modules/github.repositories/refresh').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({});
  assert.equal(refreshResponse.status, 200); assert.deepEqual(pages, [1, 2]);
  assert.equal(caches.get('github.repositories').payload.length, 101);
  assert.equal(caches.get('github.repositories').payload[0].id, 101);
  assert.equal((await supertest(app).get('/api/showcase/modules')).body.data.find((m: any) => m.id === 'github.repositories').available, true);
  const response = await supertest(app).get('/api/showcase/modules/github.repositories/data?limit=2');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.pagination, { page: 1, limit: 2, total: 101 });
  assert.deepEqual(response.body.data[1], { id: 1, name: 'repo-1', fullName: 'fixture/repo-1', description: null, url: 'https://github.com/fixture/repo-1', homepage: null, stars: 1, forks: 2, language: null, fork: true, archived: false, defaultBranch: 'main', topics: ['web'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', pushedAt: null });
  assert.equal(response.body.meta.moduleId, 'github.repositories');
  assert.equal(response.body.meta.freshness, 'fresh');
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data?page=51&limit=2')).body.data[0].id, 100);
  assert.equal((await supertest(app).put('/api/showcase/admin/modules/github.repositories/items/101/visibility').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({ visible: false })).status, 200);
  const filtered = await supertest(app).get('/api/showcase/modules/github.repositories/data?limit=2');
  assert.equal(filtered.body.pagination.total, 100); assert.equal(filtered.body.data[0].id, 1); assert.equal(filtered.body.data[1].archived, true);
  // 缓存含有额外内部字段时，公开投影仍只返回白名单。
  caches.get('github.repositories').payload[1].secret = '不得公开';
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data?limit=1')).body.data[0].secret, undefined);
  const managed = await supertest(app).get('/api/showcase/admin/modules/github.repositories/data?limit=1').set('Cookie', `nb_token=${token()}`);
  assert.equal(managed.body.pagination.total, 101); assert.equal(managed.body.data[0].itemId, '101'); assert.equal(managed.body.data[0].itemVisible, false);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data?limit=101')).status, 400);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data?category=watched')).status, 400);
  modules.find(m => m.id === 'github.repositories').visible = false;
  assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data')).status, 404);
});

test('仓库分页中途失败保留旧快照，成功空结果清除旧数据且保留隐藏设置', async () => {
  const cache = initialCache('github.repositories', [{ itemId: '1', name: '旧仓库' }]); caches.set('github.repositories', cache);
  const snapshot = cache.payload, successAt = cache.lastSuccessAt;
  overrides.push({ moduleId: 'github.repositories', itemId: '1', visible: false });
  mock.method(globalThis, 'fetch', async (url: string) => {
    if (new URL(url).searchParams.get('page') === '2') throw new Error('分页失败');
    return new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => repository(i + 1))));
  });
  await assert.rejects(refresh('github.repositories'), (e: any) => e.status === 502);
  assert.equal(cache.payload, snapshot); assert.equal(cache.lastSuccessAt, successAt);
  cache.nextAttemptAt = null; cache.lastAttemptAt = null;
  mock.method(globalThis, 'fetch', async () => new Response('[]'));
  await refresh('github.repositories'); assert.deepEqual(cache.payload, []); assert.equal(overrides.length, 1);
  const response = await supertest(app).get('/api/showcase/modules/github.repositories/data');
  assert.equal(response.status, 200); assert.equal(response.body.pagination.total, 0);
});

test('仓库采集依据 Link 获取短分页，重复条目或空中间页均不能覆盖快照', async () => {
  const next = '<https://api.github.com/users/fixture/repos?page=2>; rel="next"';
  mock.method(globalThis, 'fetch', async (url: string) => new Response(JSON.stringify([repository(Number(new URL(url).searchParams.get('page')))]), { headers: { Link: new URL(url).searchParams.get('page') === '1' ? next : '<https://api.github.com/users/fixture/repos?page=1>; rel="prev"' } }));
  await refresh('github.repositories');
  const cache = caches.get('github.repositories'), snapshot = cache.payload; assert.equal(snapshot.length, 2);
  for (const empty of [false, true]) {
    cache.nextAttemptAt = null; cache.lastAttemptAt = null;
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(empty ? [] : [repository(1)]), { headers: { Link: next } }));
    await assert.rejects(refresh('github.repositories'), (e: any) => e.code === 'INCOMPLETE_DATA');
    assert.equal(cache.payload, snapshot);
  }
});

test('仓库列表确认账号不存在时停止公开同源快照，其他 GitHub 模块确认撤回也阻止仓库列表', async () => {
  for (const moduleId of ['github.repositories', 'github.profile', 'github.pinned']) caches.set(moduleId, initialCache(moduleId, moduleId === 'github.profile' ? { login: 'fixture' } : [{ itemId: '1', name: '旧仓库' }]));
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));
  await assert.rejects(refresh('github.repositories'), (e: any) => e.status === 502);
  for (const moduleId of ['github.repositories', 'github.profile', 'github.pinned']) assert.equal((await supertest(app).get(`/api/showcase/modules/${moduleId}/data`)).status, 503);
  caches.clear(); caches.set('github.repositories', initialCache('github.repositories', [{ itemId: '1', name: '旧仓库' }]));
  await assert.rejects(refresh('github.profile'));
  assert.equal(caches.get('github.repositories').blocked, true);
});

test('全量语言统计取齐公开及私有仓库，按字节汇总且公开和管理响应均不包含私有仓库标识', async () => {
  const privateName = 'private-project-do-not-leak', pages: number[] = [];
  let languageRequests = 0, active = 0, maxActive = 0;
  mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const parsed = new URL(url);
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer fixture-token');
    if (parsed.pathname === '/user') return new Response(JSON.stringify({ login: 'FIXTURE', public_repos: 100, owned_private_repos: 1 }));
    if (parsed.pathname === '/user/repos') {
      const page = Number(parsed.searchParams.get('page')); pages.push(page);
      assert.equal(parsed.searchParams.get('visibility'), 'all'); assert.equal(parsed.searchParams.get('affiliation'), 'owner');
      const data = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...repository(i + 1), owner: { login: 'fixture' } })) : [{ id: 101, name: privateName, private: true, owner: { login: 'fixture' }, fork: true, archived: true }];
      return new Response(JSON.stringify(data));
    }
    languageRequests++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    assert.ok(parsed.pathname.startsWith('/repos/fixture/'));
    const languages = parsed.pathname.includes(privateName) ? { TypeScript: 50, Python: 100 } : parsed.pathname.endsWith('/repo-1/languages') ? { TypeScript: 100, JavaScript: 50, EmptyLanguage: 0 } : {};
    return new Response(JSON.stringify(languages));
  });
  const response = await supertest(app).post('/api/showcase/admin/modules/github.language-stats/refresh').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({});
  assert.equal(response.status, 200); assert.deepEqual(pages, [1, 2]); assert.equal(languageRequests, 101); assert.equal(maxActive, 4);
  const expected = { repositoryCount: 101, repositoriesWithLanguages: 2, totalBytes: 300, languages: [{ name: 'TypeScript', bytes: 150, repositoryCount: 2, percentage: 50 }, { name: 'Python', bytes: 100, repositoryCount: 1, percentage: 33.33 }, { name: 'JavaScript', bytes: 50, repositoryCount: 1, percentage: 16.67 }] };
  assert.deepEqual(caches.get('github.language-stats').payload, expected);
  assert.equal(JSON.stringify(caches.get('github.language-stats')).includes(privateName), false);
  const publicResponse = await supertest(app).get('/api/showcase/modules/github.language-stats/data');
  assert.equal(publicResponse.status, 200); assert.deepEqual(publicResponse.body.data, expected); assert.equal(publicResponse.body.pagination, undefined);
  assert.equal(publicResponse.body.meta.freshness, 'fresh'); assert.equal(publicResponse.text.includes('fixture-token'), false);
  const managed = await supertest(app).get('/api/showcase/admin/modules/github.language-stats/data').set('Cookie', `nb_token=${token()}`);
  assert.deepEqual(managed.body.data, expected); assert.equal(managed.text.includes(privateName), false);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.language-stats/data?category=watched')).status, 400);
  assert.equal((await supertest(app).put('/api/showcase/admin/modules/github.language-stats/items/101/visibility').set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({ visible: false })).status, 400);
  modules.find(m => m.id === 'github.language-stats').visible = false;
  assert.equal((await supertest(app).get('/api/showcase/modules/github.language-stats/data')).status, 404);
});

test('修正凭据后可在三十秒后手动重试语言统计，无需等待自动调度或清除失败缓存', async () => {
  let permitted = false;
  mock.method(globalThis, 'fetch', async (url: string) => new Response(JSON.stringify(
    new URL(url).pathname === '/user'
      ? { login: 'fixture', public_repos: 0, ...(permitted ? { owned_private_repos: 0 } : {}) }
      : [],
  )));
  const retry = () => supertest(app).post('/api/showcase/admin/modules/github.language-stats/refresh')
    .set('Cookie', `nb_token=${token()}`).set('Origin', origin).send({});
  assert.equal((await retry()).body.error.code, 'GITHUB_SCOPE_UNVERIFIED');
  const cache = caches.get('github.language-stats');
  assert.equal(cache.blocked, true);
  assert.ok(cache.nextAttemptAt.getTime() > Date.now() + 23 * 60 * 60 * 1000);
  permitted = true;
  assert.equal((await retry()).status, 429);
  // 仅模拟最短重试窗口已结束，不清除原来的失败记录或自动调度等待时间。
  cache.lastAttemptAt = new Date(Date.now() - 31000);
  caches.set('github.profile', { ...initialCache('github.profile'), lastResult: 'rate_limited', nextAttemptAt: new Date(Date.now() + 120000) });
  assert.equal((await retry()).status, 429);
  caches.delete('github.profile');
  assert.equal((await retry()).status, 200);
  assert.equal(cache.lastResult, 'ok');
  assert.equal(cache.lastErrorCode, null);
  assert.equal(cache.blocked, false);
  assert.equal((await supertest(app).get('/api/showcase/modules/github.language-stats/data')).status, 200);
});

test('全量语言网络失败保留旧汇总，私有仓库 404 或权限失效停止公开旧汇总且不影响公开仓库模块', async () => {
  const payload = { repositoryCount: 1, repositoriesWithLanguages: 1, totalBytes: 5, languages: [{ name: 'TypeScript', bytes: 5, percentage: 100, repositoryCount: 1 }] };
  const cache = initialCache('github.language-stats', payload); caches.set('github.language-stats', cache);
  caches.set('github.repositories', initialCache('github.repositories', [{ itemId: '1', name: '公开' }]));
  const successAt = cache.lastSuccessAt;
  let failStatus = 0;
  mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/user') return new Response(JSON.stringify({ login: 'fixture', public_repos: 0, owned_private_repos: 1 }));
    if (path === '/user/repos') return new Response(JSON.stringify([{ id: 1, name: 'private-project', private: true, owner: { login: 'fixture' } }]));
    if (!failStatus) throw new Error('网络失败不能包含私有名称或 secret-token');
    return new Response('{}', { status: failStatus });
  });
  for (const status of [0, 404, 403]) {
    failStatus = status; cache.nextAttemptAt = null; cache.lastAttemptAt = null; cache.blocked = false;
    await assert.rejects(refresh('github.language-stats'), (e: any) => e.status === 502);
    assert.equal(cache.payload, payload); assert.equal(cache.lastSuccessAt, successAt); assert.equal(cache.blocked, status !== 0);
    assert.equal((await supertest(app).get('/api/showcase/modules/github.language-stats/data')).status, status ? 503 : 200);
    assert.equal((await supertest(app).get('/api/showcase/modules/github.repositories/data')).status, 200);
    assert.equal(cache.lastErrorMessage.includes('secret-token'), false); assert.equal(cache.lastErrorMessage.includes('private-project'), false);
  }
});

test('全量语言拒绝错账号、缺少私有计数或不完整权限；移除 Token 后旧汇总也不可公开', async () => {
  const cache = initialCache('github.language-stats', { repositoryCount: 0, repositoriesWithLanguages: 0, totalBytes: 0, languages: [] }); caches.set('github.language-stats', cache);
  for (const [user, code] of [
    [{ login: 'another', public_repos: 0, owned_private_repos: 0 }, 'GITHUB_ACCOUNT_MISMATCH'],
    [{ login: 'fixture', public_repos: 0 }, 'GITHUB_SCOPE_UNVERIFIED'],
    [{ login: 'fixture', public_repos: 0, owned_private_repos: 1 }, 'GITHUB_REPOSITORIES_INCOMPLETE'],
  ] as const) {
    cache.nextAttemptAt = null; cache.lastAttemptAt = null; cache.blocked = false;
    mock.method(globalThis, 'fetch', async (url: string) => new Response(JSON.stringify(new URL(url).pathname === '/user' ? user : [])));
    await assert.rejects(refresh('github.language-stats'), (e: any) => e.code === code);
    assert.equal(cache.blocked, true);
  }
  env.githubToken = ''; cache.blocked = false; cache.nextAttemptAt = null; cache.lastAttemptAt = null;
  await assert.rejects(refresh('github.language-stats'), (e: any) => e.status === 503 && e.code === 'SOURCE_UNCONFIGURED');
  assert.equal((await supertest(app).get('/api/showcase/modules/github.language-stats/data')).status, 503);
  assert.equal((await supertest(app).get('/api/showcase/modules')).body.data.find((m: any) => m.id === 'github.language-stats').available, false);
});

test('全量语言重复分页、仓库总量变化或外部所有者均拒绝部分统计', async () => {
  const payload = { repositoryCount: 0, repositoriesWithLanguages: 0, totalBytes: 0, languages: [] }, cache = initialCache('github.language-stats', payload); caches.set('github.language-stats', cache);
  for (const mode of ['duplicate', 'changed', 'external']) {
    cache.nextAttemptAt = null; cache.lastAttemptAt = null;
    let userCalls = 0;
    mock.method(globalThis, 'fetch', async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/user') return new Response(JSON.stringify({ login: 'fixture', public_repos: mode === 'changed' && ++userCalls === 2 ? 2 : 1, owned_private_repos: 0 }));
      return new Response(JSON.stringify([{ id: 1, name: 'repo', private: false, owner: { login: mode === 'external' ? 'organization' : 'fixture' } }]), { headers: mode === 'duplicate' ? { Link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {} });
    });
    const code = mode === 'duplicate' ? 'INCOMPLETE_DATA' : mode === 'changed' ? 'REPOSITORIES_CHANGED' : 'INVALID_REPOSITORY_OWNER';
    await assert.rejects(refresh('github.language-stats'), (e: any) => e.code === code);
    assert.equal(cache.payload, payload);
  }
});

test('全量语言空语言和空仓库均是有效零统计，成功采集覆盖旧汇总', async () => {
  caches.set('github.language-stats', initialCache('github.language-stats', { totalBytes: 999, languages: [{ name: '旧语言', bytes: 999 }] }));
  let repoCount = 1;
  mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(url).pathname;
    return new Response(JSON.stringify(path === '/user' ? { login: 'fixture', public_repos: 0, owned_private_repos: repoCount } : path === '/user/repos' ? (repoCount ? [{ id: 1, name: 'empty-private', private: true, owner: { login: 'fixture' } }] : []) : {}));
  });
  for (const count of [1, 0]) {
    repoCount = count; const cache = caches.get('github.language-stats'); cache.nextAttemptAt = null; cache.lastAttemptAt = null;
    await refresh('github.language-stats');
    const response = await supertest(app).get('/api/showcase/modules/github.language-stats/data');
    assert.equal(response.status, 200); assert.deepEqual(response.body.data, { repositoryCount: count, repositoriesWithLanguages: 0, totalBytes: 0, languages: [] });
  }
});
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
  const saved = await put({ text: '学习中', visible: true, expiresAt: null });
  assert.equal(saved.status, 200);
  assert.equal(Object.hasOwn(saved.body.data, 'availability'), false);
  const published = await supertest(app).get('/api/personal-status');
  assert.equal(published.body.data.text, '学习中');
  assert.equal(Object.hasOwn(published.body.data, 'availability'), false);
  const managed = await supertest(app).get('/api/showcase/admin/personal-status').set('Cookie', `nb_token=${token()}`);
  assert.equal(managed.status, 200);
  assert.equal(Object.hasOwn(managed.body.data, 'availability'), false);
  personal.expiresAt = new Date(Date.now() - 1000); assert.equal((await supertest(app).get('/api/personal-status')).body.data, null);
  assert.equal((await put({ text: '', visible: true, expiresAt: null })).status, 200);
  modules.find(m => m.id === 'L07').visible = false; assert.equal((await supertest(app).get('/api/personal-status')).body.data, null);
  assert.equal((await put({ text: '', visible: true, expiresAt: '2000-01-01T00:00:00Z' })).status, 400);
  assert.equal((await put({ text: '', visible: true, expiresAt: null, role: 'admin' })).status, 400);
  // 旧版客户端提交已移除的接单字段时，应按未知字段拒绝。
  assert.equal((await put({ text: '', visible: true, expiresAt: null, availability: 'open' })).status, 400);
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

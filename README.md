<!-- 项目运行说明：记录架构、启动步骤、配置、验证结果和部署职责，不包含凭据或调查内容。 -->

# AoralsFout 展示站

后端位于 `server/`，独立于 NeoBlog 进程运行，连接同一 MySQL 数据库。管理页面位于 `management/`，采用 Vue、Pinia 和简单表单、列表；个人展示页面位于 `showcase/`，采用 Vue、GSAP 和 Three.js，默认通过公开 API 展示真实内容。项目提供公开展示 API、五个管理页面和个人展示主页。

## 本地运行

需要 Node.js 22.12+、npm 和 NeoBlog 现有 MySQL 数据库。

安装时自动生成 Prisma 客户端，日常构建只检查并编译代码。改动数据库模型后，先停止后端，再执行 `npm run db:generate -w server`；Windows 运行中的 Prisma 动态库会阻止生成器替换文件，因此不将生成放在每次构建中。

```powershell
npm ci
Copy-Item server/.env.example server/.env
# 在 server/.env 中填写配置，然后执行：
npm run db:setup
npm run dev
```

展示页面：`http://localhost:5173`；管理页面：`http://localhost:5174`；后端：`http://localhost:3002`。请使用 `localhost` 访问管理页面，以匹配默认的 Origin 配置。端口固定，已被占用时会报错。两个前端的接口均经 Vite `/api` 代理同源访问。

单独运行展示页面时执行 `npm run dev -w showcase`，默认从 `http://localhost:3002` 的公开 API 获取 GitHub 项目与动态、NeoBlog 文章、Steam 游戏库、Bangumi 五类收藏及已有个人记录。API 隐藏、不可用、失败和成功空结果均不会补入 mock；离线设计预览须显式设置 `VITE_SHOWCASE_DATA_MODE=mock`。联系方式在管理页自定义列表中维护，通过公开 API 展示。详细说明见 [showcase/README.md](showcase/README.md)。

本次联调已准备忽略的 `server/.env`，无需再次覆盖。它复用 NeoBlog 的 MySQL、JWT 和 Natayark OAuth 配置，以及 AboutMe 的 Steam 参数。Bangumi 账号和 GitHub 用户名来自已有项目配置及资料；凭据不会写入仓库。

`db:setup` 执行 `server/prisma/migrations/202610090001_showcase/migration.sql` 的五张新表建表语句；若当前状态表仍有旧 `availability` 字段，再执行 `202610090002_remove_availability/migration.sql` 删除该字段及其接单数据，保留描述、有效期和可见性。随后执行 `202610090003_contact_methods/migration.sql` 创建联系方式表，幂等初始化 17 个模块。新模块默认隐藏，已有开关保持原值，整个流程支持重复执行。不执行删表、重置数据库或 NeoBlog 迁移历史操作。共享库不使用 `prisma migrate reset`、`db push` 或本仓库独立的 `migrate deploy` 接管整个数据库；增量 SQL 应纳入实际部署流程。

已有数据库升级时，先停止后端，执行 `npm run db:setup` 和 `npm run db:generate -w server`，再构建并启动服务。

## 关键配置

| 配置                                        | 说明                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                              | NeoBlog 同一数据库，管理员和文章沿用已有记录                                 |
| `JWT_SECRET`                                | 与 NeoBlog 一致，至少 32 字符；Cookie 名为 `nb_token`                        |
| `CLIENT_ID`、`CLIENT_SECRET`                | Natayark OAuth 参数，沿用 NeoBlog 的密钥哈希交换协议                         |
| `FRONTEND_URL`                              | 管理页面来源，用于写入 Origin 校验及登录成功后的跳转                         |
| `OAUTH_CALLBACK_URL`                        | 需被 OAuth 应用允许；默认 `http://localhost:5174/api/auth/natayark/callback` |
| `NODE_ENV`                                  | 生产设为 `production`，Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Lax`      |
| `HOST`、`PORT`                              | 后端默认仅监听 `127.0.0.1:3002`；容器部署可配置监听地址                      |
| `STEAM_API_KEY`、`STEAM_ID`                 | Steam 名片、状态及完整游戏库                                                 |
| `BANGUMI_USERNAME`                          | 动画五类收藏，完整分页后按本人评分排序                                       |
| `GITHUB_USERNAME`                           | GitHub 名片、最近公开活动与全部公开仓库                                     |
| `GITHUB_TOKEN`                              | 贡献日历、置顶项目及语言统计所需服务端凭据；全量语言统计还需读取全部私有仓库及账号私有仓库数量 |
| `NEOBLOG_FRONTEND_URL`、`NEOBLOG_ASSET_URL` | 原文及图片地址；原文路由按已核对的 `/article/:id` 生成                       |
| `SYNC_ENABLED`                              | 默认 `true`；关闭时仍可手动刷新，适合独立联调                                |

缺少外部参数时，服务及本地内容维护仍可运行；相关模块显示“未配置”。管理员不会看到密钥明文。

## 管理和公开范围

- 当前状态：描述、有效期、可见性；过期后整条停止公开。
- 学习目标：新增、编辑、进度、状态、顺序、单条可见性、分页筛选和确认删除。
- 联系方式：自定义类型、展示名称、文本或账号、可选 HTTP(S) 链接、顺序、单条可见性、分页筛选和确认删除。
- 数据与 API 状态：来源配置状态、采集结果、新鲜度、更新时间、耗时、脱敏错误、手动刷新及完整缓存查看。
- 展示设置：模块开关和受支持列表条目的隐藏／恢复。

所有管理接口使用 NeoBlog 的 `authenticate`、`requireAdmin`，校验数据库最新角色、账号状态与 `token_version`。退出会增加令牌版本；因为数据库共享，也会撤销该用户的 NeoBlog 会话。管理写入和退出要求 Origin 精确匹配管理来源。OAuth state 同时验证签名和发起浏览器 Cookie，避免只验签时的登录 CSRF。

公开读取不会触发上游采集，且使用 `Cache-Control: no-store`。模块默认关闭；本地状态、目标和联系方式也需自己的可见性允许。列表先隐藏过滤再统计和分页；管理员登录后访问公开 API 仍遵循公开规则。

公开接口为 `/api/showcase/modules`、`/api/showcase/modules/:moduleId/data`、`/api/personal-status`、`/api/learning-goals` 和 `/api/contacts`；管理接口以 `/api/showcase/admin` 为前缀，内容契约见[后端设计文档](docs/design/后端设计文档.md)。

`GET /api/contacts?page=1&limit=20&type=email` 返回公开联系方式，类型筛选可省略，按 `sortOrder` 升序、同值按 ID 升序排列。返回字段为 `id`、`type`、`label`、`value`、`url`、`updatedAt`，附带 `pagination`；模块关闭时返回空列表和总数 0。管理员通过 `GET/POST /api/showcase/admin/contacts`、`PATCH/DELETE /api/showcase/admin/contacts/:id` 维护列表；管理读取另外支持 `visible=true|false` 筛选。

新建联系方式要求 `type`、`label`、`value`，其他字段默认 `url: null`、`visible: false`、`sortOrder: 0`。新部署列表为空，不自动导入旧前端环境变量；先在管理页“联系方式”添加条目，再在“展示设置”开启 `contacts` 模块。保存和隐藏后，后续公开请求立即读取数据库。

全部仓库语言统计入口为 `GET /api/showcase/modules/github.language-stats/data`，默认每 24 小时同步。它统计配置账号名下全部公开和私有仓库，含 Fork、归档和空仓库；返回总仓库数、具有语言数据的仓库数、代码总字节及各语言的字节数、占比和涉及仓库数。缓存、公开及管理接口都只保存或返回汇总，不返回私有仓库名称、地址或逐仓库明细。汇总独立于公开仓库、置顶仓库模块的单条隐藏设置。

新增模块无需表结构迁移，重启后端即可注册，默认隐藏；在管理页开启并刷新 `github.language-stats` 后才能公开读取。`GITHUB_TOKEN` 必须属于 `GITHUB_USERNAME` 对应账号。使用 classic PAT 时需要 `repo` 与 `read:user` 权限；使用 fine-grained PAT 时需覆盖该账号全部仓库并具有 Metadata 读取权限，且 `/user` 必须返回 `owned_private_repos` 以验证私有仓库总量。身份不符、缺少计数或实际读取数量不足时采集失败，不发布仅公开仓库的部分统计。确认权限不足或移除 Token 后停止公开旧汇总。

## 实现调整

- 本服务按用户确认独立运行；文章直接使用共享库的 NeoBlog 文章模型和列表字段投影，不通过 HTTP 调用自己，不读取正文或增加浏览数。
- 博客三个模块共享一次完整文章采集；标签和归档在每次读取时从同一文章快照派生，公开时先剔除隐藏文章，避免快照时间不一致。
- 缓存表增加 `etag` 和 `blocked`，分别承载 GitHub 条件请求和已知隐私撤回／关联快照失效。普通失败保留最近完整快照；成功空结果替换旧数据。
- Steam 使用游戏库实际响应中的 `rtime_last_played`；本次联调确认存在有效值，缺失时显示未知，不依赖未核实的旧 `ClientGetLastPlayedTimes` 接口。
- 置顶仓库变动时阻止旧语言快照公开并触发新采集；语言提交前再次核对父快照版本，避免并发采集覆盖新关系。
- 单请求 10 秒、单模块采集 60 秒；关联语言刷新有自己的预算，管理客户端和代理等待 130 秒。相同模块（博客共用同一任务）禁止重入，手动刷新至少间隔 30 秒并遵守上游轮询／限流时间；GitHub 限流也约束同一来源的其他模块。
- 同步调度为单进程任务，部署一个调度实例；模块关闭不停止采集。普通快照超过间隔标为过期，超过七天不可公开；Steam 在线状态超过五分钟不可公开。

## 验证和部署

```powershell
npm test
npm run build
# 可选：真实数据库鉴权和采集联调，仅更新展示缓存，不改用户或博客：
npm exec -w server -- tsx scripts/verify-runtime.ts
```

HTTP 集成测试使用内存数据库替身和可控上游，覆盖权限、会话撤销、Origin、状态有效期、目标及联系方式 CRUD、分页校验、字段白名单、关联隐藏、快照保留、成功空结果、隐私撤回、限流、同步重入、Bangumi 全分页及 GitHub ETag。根构建依次检查并构建后端、管理页和展示页；只构建展示页使用 `npm run build -w showcase`。

HTTP 集成验收覆盖 GitHub GraphQL 数据映射、全部公开仓库完整分页、公开与私有仓库语言汇总、Token 身份和数量校验、父快照并发变化和已确认的账号／仓库隐私撤回。展示前端接入时，按用户授权在管理页开启 14 个现有模块；保留条目级隐藏规则，没有触发上游采集。新部署及后来新增的模块初始化仍默认关闭。

本次真实联调已验证 MySQL、管理员 OAuth、四页操作、手动刷新和条目隐藏对公开数量的即时影响。展示页现从公开 API 读到 NeoBlog 2 篇文章、Steam 48 个游戏、Bangumi「看过」405 条、GitHub 5 个置顶项目、1241 次贡献及 300 条公开活动；Bangumi 五类缓存共 468 条，各分类总量分别由接口提供。这些数量是联调时快照，不作为固定验收值。Steam 当前状态暂不可用，个人状态与学习目标为空时不会补示例。

生产先构建，后端执行 `npm run start -w server`，静态服务器分别提供 `management/dist/` 和 `showcase/dist/`，并为管理路由回退到 `index.html`。同一域名将 `/api` 代理至本服务，保留客户端 Origin，代理等待时间不少于 130 秒；使用 HTTPS 并配置正确的管理来源、OAuth 回调和 Cookie 域。Vite 开发服务器仅用于本地开发。

调查资料 `docs/research/`、环境文件、依赖、构建产物和临时验收文件均被忽略。

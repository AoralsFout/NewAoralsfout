<!-- 项目运行说明：记录架构、启动步骤、配置、验证结果和部署职责，不包含凭据或调查内容。 -->
# AoralsFout 展示站

后端位于 `server/`，独立于 NeoBlog 进程运行，连接同一 MySQL 数据库。管理页面位于 `management/`，采用 Vue、Pinia 和简单表单、列表；`showcase/` 暂未开发。本期提供公开展示 API 和四个管理页面。

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

管理页面：`http://localhost:5174`；后端：`http://localhost:3002`。请使用 `localhost` 访问管理页面，以匹配默认的 Origin 配置。端口固定，已被占用时会报错。后台接口经 Vite `/api` 代理同源访问。

本次联调已准备忽略的 `server/.env`，无需再次覆盖。它复用 NeoBlog 的 MySQL、JWT 和 Natayark OAuth 配置，以及 AboutMe 的 Steam 参数。Bangumi 账号和 GitHub 用户名来自已有项目配置及资料；凭据不会写入仓库。

`db:setup` 执行 `server/prisma/migrations/202610090001_showcase/migration.sql` 的五张新表建表语句；若当前状态表仍有旧 `availability` 字段，再执行 `202610090002_remove_availability/migration.sql` 删除该字段及其接单数据，保留描述、有效期和可见性。随后幂等初始化 14 个隐藏模块，整个流程支持重复执行。不执行删表、重置数据库或 NeoBlog 迁移历史操作。共享库不使用 `prisma migrate reset`、`db push` 或本仓库独立的 `migrate deploy` 接管整个数据库；增量 SQL 应纳入实际部署流程。

已有数据库升级时，先停止后端，执行 `npm run db:setup` 和 `npm run db:generate -w server`，再构建并启动服务。

## 关键配置

| 配置 | 说明 |
| --- | --- |
| `DATABASE_URL` | NeoBlog 同一数据库，管理员和文章沿用已有记录 |
| `JWT_SECRET` | 与 NeoBlog 一致，至少 32 字符；Cookie 名为 `nb_token` |
| `CLIENT_ID`、`CLIENT_SECRET` | Natayark OAuth 参数，沿用 NeoBlog 的密钥哈希交换协议 |
| `FRONTEND_URL` | 管理页面来源，用于写入 Origin 校验及登录成功后的跳转 |
| `OAUTH_CALLBACK_URL` | 需被 OAuth 应用允许；默认 `http://localhost:5174/api/auth/natayark/callback` |
| `NODE_ENV` | 生产设为 `production`，Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Lax` |
| `HOST`、`PORT` | 后端默认仅监听 `127.0.0.1:3002`；容器部署可配置监听地址 |
| `STEAM_API_KEY`、`STEAM_ID` | Steam 名片、状态及完整游戏库 |
| `BANGUMI_USERNAME` | 动画五类收藏，完整分页后按本人评分排序 |
| `GITHUB_USERNAME` | GitHub 名片与最近公开活动 |
| `GITHUB_TOKEN` | 贡献日历、置顶项目及其语言数据所需 GraphQL 凭据，仅在服务端保存 |
| `NEOBLOG_FRONTEND_URL`、`NEOBLOG_ASSET_URL` | 原文及图片地址；原文路由按已核对的 `/article/:id` 生成 |
| `SYNC_ENABLED` | 默认 `true`；关闭时仍可手动刷新，适合独立联调 |

缺少外部参数时，服务及本地内容维护仍可运行；相关模块显示“未配置”。管理员不会看到密钥明文。

## 管理和公开范围

- 当前状态：描述、有效期、可见性；过期后整条停止公开。
- 学习目标：新增、编辑、进度、状态、顺序、单条可见性、分页筛选和确认删除。
- 数据与 API 状态：来源配置状态、采集结果、新鲜度、更新时间、耗时、脱敏错误、手动刷新及完整缓存查看。
- 展示设置：模块开关和受支持列表条目的隐藏／恢复。

所有管理接口使用 NeoBlog 的 `authenticate`、`requireAdmin`，校验数据库最新角色、账号状态与 `token_version`。退出会增加令牌版本；因为数据库共享，也会撤销该用户的 NeoBlog 会话。管理写入和退出要求 Origin 精确匹配管理来源。OAuth state 同时验证签名和发起浏览器 Cookie，避免只验签时的登录 CSRF。

公开读取不会触发上游采集，且使用 `Cache-Control: no-store`。模块默认关闭；本地状态和目标也需自己的可见性允许。列表先隐藏过滤再统计和分页；管理员登录后访问公开 API 仍遵循公开规则。

公开接口为 `/api/showcase/modules`、`/api/showcase/modules/:moduleId/data`、`/api/personal-status` 和 `/api/learning-goals`；管理接口以 `/api/showcase/admin` 为前缀，内容契约见原后端设计文档。

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

HTTP 集成测试使用内存数据库替身和可控上游，覆盖权限、会话撤销、Origin、状态有效期、目标 CRUD、分页校验、字段白名单、关联隐藏、快照保留、成功空结果、隐私撤回、限流、同步重入、Bangumi 全分页及 GitHub ETag。构建同时检查后端和 Vue 类型。

目前 14 项集成验收全部通过，包括 GitHub GraphQL 数据映射、父快照并发变化和已确认的账号／仓库隐私撤回。浏览器验收的隐藏测试记录已清理，模块开关恢复为全部关闭。

本次真实联调已验证 MySQL、管理员 OAuth、四页操作、手动刷新和条目隐藏对公开数量的即时影响，并采集到 NeoBlog 2 篇文章、Steam 48 个游戏、Bangumi 468 条收藏和 GitHub 300 条公开活动。这些数量是联调时快照，不作为固定验收值。贡献图、置顶仓库和语言适配器已实现，但真实 GraphQL 联调仍需填写 `GITHUB_TOKEN`。

生产先构建，后端执行 `npm run start -w server`，静态服务器提供 `management/dist/` 并为管理路由回退到 `index.html`。同一域名将 `/api` 代理至本服务，保留客户端 Origin，代理等待时间不少于 130 秒；使用 HTTPS 并配置正确的管理来源、OAuth 回调和 Cookie 域。Vite 开发服务器仅用于本地开发。

调查资料 `docs/research/`、环境文件、依赖、构建产物和临时验收文件均被忽略。

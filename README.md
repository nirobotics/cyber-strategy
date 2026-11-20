# cyber-strategy

![Next Innovation](https://img.shields.io/badge/Next-Innovation-8A2BE2?labelColor=555555&style=flat)
![Lang zh-CN](https://img.shields.io/badge/Lang-zh--CN-2DBA4E?labelColor=555555&style=flat)

NI Robotics 的 FRC 赛事数据分析与战术协作 Cyber App。

## 用途

Cyber Strategy 面向 Team 8214 的侦查分析、选队和比赛策略工作：

- 从 Cyber Scout 实时读取普通侦查、超级侦查和 Pit Scouting 数据。
- 浏览与比较队伍数据，查看逐场表现、比赛自动路线、可靠性和综合评分。
- 结合 TBA 与 Statbotics 数据进行赛程预测和 Match Analysis。
- 维护个人 Picklist，并按赛事分别保存排序与忽略状态。
- 创建、提交、审核、版本恢复和导出 Strategy Proposal PDF。
- 为 Scouting Lead 提供提交记录、人员分配和信心分分析。
- 使用飞书组织身份登录，管理员功能受服务端权限控制。

## 技术栈

- React 19 + React Router 7 framework mode
- TypeScript 5 + Vite 8 + Tailwind CSS 4
- Cloudflare Workers + D1 + Durable Object（生产环境，见“部署”）
- Chart.js
- 飞书 OAuth、Cyber Scout、TBA 与 Statbotics

## 目录

- `app/routes/` - 页面、登录回调和服务端 API 路由。
- `app/components/` - Cyber App shell、分析页面、图表和战术工具。
- `app/lib/` - 数据转换、统计、认证、Supabase 和外部数据源逻辑。
- `public/` - 场地图、品牌资源和静态文件。
- `supabase/migrations/` - Strategy 数据表、设置和 Proposal 版本迁移。
- `.agents/skills/` - 项目级 Cyber App 与 NI GitHub 规范。

## 给人看的工具

- Node.js 22
- pnpm 11
- NI Corporate Cloudflare 账号（Worker `cyber-strategy`）
- 飞书自建应用
- Cyber Scout Supabase 只读访问凭据
- FIRST FRC Events API username/token
- TBA API key（队伍综合分分项）

## 给人看的使用方法

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 `http://localhost:3000`。飞书后台需要配置 OAuth 回调地址：

```text
http://localhost:3000/auth/feishu/callback
```

根据 `.env.example` 配置服务端环境变量。所有密钥只允许放在 `.env.local`、Vercel 环境变量或其他受控密钥存储中，禁止添加 `VITE_` 前缀或提交到 Git。

首次部署前，按顺序应用数据库迁移：

```sh
supabase db push
```

## 部署

- **运行位置**：Cloudflare Worker `cyber-strategy`，正式地址 `https://strategy.team8214.com`（路由 `strategy.team8214.com/*`）。不再部署到 Vercel，也不再读写 Supabase。
- **数据资源**：D1 数据库 `cyber-strategy-hk`（主库在香港；原数据库的十一张表）、Durable Object `StrategyBusiness`（所有写入串行执行）、R2 存储桶 `cyber-strategy`（旧 `match-videos` 归档，应用不读取）。Cyber Scout 数据通过 service binding `SCOUT` 调用 Worker `cyber-scout` 的签名接口读取和修改，本应用不保存副本。密钥保存在 Worker 上，部署不会改动密钥和数据。
- **Worker 包**：[cloudflare](./cloudflare)（适配层 `worker.ts`、配置 `cloudflare.config.ts`、测试），说明见该目录的 README。
- **CI**：推送到 `main` 即由 [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) 自动测试、打包并部署，随后检查线上 `/__ready` 和 `/auth/login`。需要仓库 secret `CLOUDFLARE_STRATEGY_PUBLISH_TOKEN`。
- **手动部署**（与 CI 相同的命令，Worker `cyber-scout` 必须已存在）：

```sh
pnpm install --frozen-lockfile
cd cloudflare
pnpm install --frozen-lockfile
node scripts/package.mjs
node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=2ca8df5c9754fb7e3f37d08c597535e0 \
  node node_modules/cf/bin/cf deploy --prebuilt --mode production --no-provision --force
```

`supabase/migrations/` 是迁移前数据库的历史结构，当前表结构见 [cloudflare/native/schema.sql](./cloudflare/native/schema.sql)。

## 给 AI 看的工具

- 包管理与校验：`pnpm`
- 代码搜索：`rg`
- 数据库迁移：Supabase CLI
- 部署：推送到 `main` 由 GitHub Actions 部署到 Cloudflare（见“部署”）
- 仓库规范：`.agents/skills/cyber-apps`、`.agents/skills/ni-github-repo`

## 给 AI 看的使用方法

修改前先读取项目级 skill，并保持改动符合现有 React Router loader/action、服务端密钥隔离和 Cyber App UI 模式。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

部署由 CI 完成；新增密钥时先在 Worker `cyber-strategy` 上配置，再在 `cloudflare/cloudflare.config.ts` 中声明。

## 维护规则

- service role key、飞书 secret、TBA key、Vercel token 禁止进入客户端 bundle、README、日志和提交历史。
- Strategy 共享数据写入 Strategy Supabase；Cyber Scout 数据通过服务端只读连接获取。
- Picklist、隐藏队伍、忽略场次等个人状态保存在浏览器本地，并按数据集隔离。
- 管理、Scouting Lead 和 Proposal 审核仅允许管理员访问；权限必须在服务端再次校验。
- 常规改动至少执行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build`。
- UI 继续沿用 Cyber App shell、light/dark 主题和紧凑的内部工具风格。

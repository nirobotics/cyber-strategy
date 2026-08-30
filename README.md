# cyber-strategy

![Next Innovation](https://img.shields.io/badge/Next-Innovation-8A2BE2?labelColor=555555&style=flat)
![Lang zh-CN](https://img.shields.io/badge/Lang-zh--CN-2DBA4E?labelColor=555555&style=flat)

NI Robotics 可按赛季定制、跨年度复用的 FRC 赛事数据分析与战术协作 Cyber App 模板。

## 用途

Cyber Strategy 面向 FRC 队伍的侦查分析、选队和比赛策略工作：

- 从 Cyber Scout 实时读取普通侦查、超级侦查和 Pit Scouting 数据。
- 浏览与比较队伍数据，查看逐场表现、比赛自动路线、可靠性和综合评分。
- 结合 TBA 与 Statbotics 数据进行赛程预测和 Match Analysis。
- 维护个人 Picklist，并按赛事分别保存排序与忽略状态。
- 创建、提交、审核、版本恢复和导出 Strategy Proposal PDF。
- 为 Scouting Lead 提供提交记录、人员分配和信心分分析。
- 使用飞书组织身份登录，管理员功能受服务端权限控制。

## 分支与赛季模型

- `strategy-template` 是长期维护的通用模板分支，只保留跨年度能力。
- 每年从最新模板创建独立年度分支，例如 `strategy-2027`；一个分支只配置一个赛季，不在运行时切换赛季。
- 年度差异集中在 `app/season/` 和年度场地资源，不建设动态插件系统。

创建年度分支前，先通过 [`SEASON_REQUIREMENTS.md`](./SEASON_REQUIREMENTS.md) 收集并确认当年需求，再按 [`SEASON_CUSTOMIZATION.md`](./SEASON_CUSTOMIZATION.md) 完成实现和验收。需求未明确或标记为 `TBD` 的内容不得由 AI 猜测。

## 技术栈

- React 19 + React Router 7 framework mode
- TypeScript 5 + Vite 8 + Tailwind CSS 4
- Supabase + Vercel
- Chart.js
- 飞书 OAuth、Cyber Scout、TBA 与 Statbotics

## 目录

- `app/routes/` - 页面、登录回调和服务端 API 路由。
- `app/components/` - Cyber App shell、分析页面、图表和战术工具。
- `app/lib/` - 数据转换、统计、认证、Supabase 和外部数据源逻辑。
- `app/season/` - 当前年度的赛季配置、Scout 映射、计分适配和场地定义。
- `public/` - 年度场地图、品牌资源和静态文件。
- `supabase/migrations/` - Strategy 数据表、设置和 Proposal 版本迁移。
- `.agents/skills/` - 项目级 Cyber App 与 NI GitHub 规范。

## 数据源职责

- Cyber Scout：Normal Scout、Super Scout、Pit Scout、照片、提交记录、用户和人员分配。
- FIRST FRC Events：官方赛程、比赛身份、联盟阵容、总分及 Auto/Tele 分项，是队伍分项的首选来源。
- The Blue Alliance：补充比赛身份、阵容、结果、视频和年度 `score_breakdown`。
- Statbotics：比赛预测比分、胜率和 Team Event 评分，不参与 Scout 原始数据读取。
- 队伍比赛分项按 FIRST FRC Events → TBA 年度 breakdown → Super Scout 估算 → `0` 的顺序降级。

## 给人看的工具

- Node.js 22
- pnpm 11
- NI Corporate Supabase 项目
- NI Corporate Vercel 项目
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

打开 `http://localhost:5173`。飞书后台需要配置 OAuth 回调地址：

```text
http://localhost:5173/auth/feishu/callback
```

根据 `.env.example` 配置服务端环境变量。所有密钥只允许放在 `.env.local`、Vercel 环境变量或其他受控密钥存储中，禁止添加 `VITE_` 前缀或提交到 Git。

首次部署前，按顺序应用数据库迁移：

```sh
supabase db push
```

## 给 AI 看的工具

- 包管理与校验：`pnpm`
- 代码搜索：`rg`
- 数据库迁移：Supabase CLI
- 部署：Vercel CLI，适配器为 `@vercel/react-router`
- 仓库规范：`.agents/skills/cyber-apps`、`.agents/skills/ni-github-repo`

## 给 AI 看的使用方法

修改前先读取项目级 skill，并保持改动符合现有 React Router loader/action、服务端密钥隔离和 Cyber App UI 模式。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

数据库结构变化必须新增迁移，不直接改写已部署迁移。部署前确认 Vercel 中已配置 `.env.example` 列出的必需变量。年度定制前先完成 `SEASON_REQUIREMENTS.md`，实施后执行 `SEASON_CUSTOMIZATION.md` 的验收清单。

## 维护规则

- service role key、飞书 secret、TBA key、Vercel token 禁止进入客户端 bundle、README、日志和提交历史。
- Strategy 共享数据写入 Strategy Supabase；Cyber Scout 数据通过服务端只读连接获取。
- Picklist、隐藏队伍、忽略场次等个人状态保存在浏览器本地，并按数据集隔离。
- 管理、Scouting Lead 和 Proposal 审核仅允许管理员访问；权限必须在服务端再次校验。
- 年度队号、计分字段、Proposal 阶段、地图和坐标只能放在 `app/season/` 或对应年度资源中。
- 保持旧 Proposal JSON、Picklist `app_settings` 和浏览器本地存储 key 向后兼容。
- 常规改动至少执行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build`。
- UI 继续沿用 Cyber App shell、light/dark 主题和紧凑的内部工具风格。

# cyber-strategy

![Next Innovation](https://img.shields.io/badge/Next-Innovation-8A2BE2?labelColor=555555&style=flat)
![Lang zh-CN](https://img.shields.io/badge/Lang-zh--CN-2DBA4E?labelColor=555555&style=flat)

Cyber App 系列的 FRC 战术数据分析网页：导入 scouting CSV，按队伍浏览、比较、查看赛程预测和比赛详情。

## 用途

服务 Team 8214 赛事实时选队和战术讨论：

- 飞书组织身份登录。
- 管理员上传 scouting CSV 并激活共享数据集。
- 队伍浏览、pick list、DNP、隐藏队伍、本地偏好。
- 队伍详情、三队对比、赛程预测和 Match Analysis 比赛详情。

## 目录

- `app/routes/` - 页面与 API 路由。
- `app/components/` - Cyber App shell、数据分析界面、图表和表格组件。
- `app/lib/` - 飞书登录、Supabase、数据集、CSV 统计逻辑和测试。
- `app/data/` - Advantalytics 示例数据 fallback。
- `supabase/migrations/` - Supabase 表、索引和 RLS。
- `.agents/skills/` - 项目级 skill 快照。

## 给人看的工具

- Node.js 22+
- pnpm 11
- Supabase 项目（个人组织可用）
- Vercel 项目（个人 scope 可用）
- 飞书自建应用

## 给人看的使用方法

```sh
pnpm install
cp .env.example .env
pnpm dev
```

打开 `http://localhost:3000`。飞书后台需配置 `http://localhost:3000/api/auth/callback`。

## 给 AI 看的工具

- 包管理与脚本：`pnpm`
- 数据库迁移：应用 `supabase/migrations/*.sql`
- 部署：`vercel`，React Router 项目使用 `@vercel/react-router`

## 给 AI 看的使用方法

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## 维护规则

- service role key、飞书 secret、Vercel token 禁止进入前端、README、handoff 和提交历史。
- 共享业务数据进 Supabase；pick list、DNP、隐藏队伍等个人偏好进 localStorage。
- 常规修改走 typecheck、lint、test、build。
- UI 继续沿用 Cyber App shell、双主题、紧凑内部工具风格。

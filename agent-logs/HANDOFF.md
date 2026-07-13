# cyber-strategy Handoff Log

> Append-only. 每轮新增一节，不要修改或删除既有条目。

---

## 2026-07-04 · Phase 0 数据分析 Cyber App 初版

**当前状态**：从 cyber-apps 模板创建 React Router 7 应用；核心数据分析 UI、飞书登录代码、Supabase schema 和 dataset 管理代码已落地并通过本地验证。Supabase/Vercel 实际创建与部署被本机认证状态阻塞。

**本轮完成**：
- 导入项目级 skill：`.agents/skills/cyber-apps`、`.agents/skills/ni-github-repo`。
- 建立 Cyber App shell：`Cyber Strategy` / `战术数据分析` / `数据分析`，login-required。
- 迁移飞书 OAuth + session + profiles + audit + Supabase service_role 访问层。
- 从 Advantalytics 当前 `index.html` 生成 `app/data/advantalytics-sample.json`，作为 fallback 数据集。
- 实现 Team Browser、Compare Teams、Match Analysis、pick list、DNP、隐藏队伍、照片灯箱。
- 实现 CSV 导入、dataset 激活/删除的 admin 页面。
- 新增 Supabase 迁移：`profiles`、`scouting_datasets`、`audit_logs`、RLS。

**本地验证**：
- `pnpm install` ✅（需把 Codex runtime Node 放进 PATH；当前 runtime Node 24.14.0，项目声明 Node 22.x，有 engine warning）
- `pnpm test` ✅（3/3）
- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm build` ✅
- 浏览器烟测 ✅：桌面 Team Browser 2 canvas、Compare 5 canvas、移动 390px 无横向溢出、dark→light 主题切换正常、Match Analysis 前端直连 Statbotics 正常。

**部署验证**：
- `vercel whoami` via `pnpm dlx`：无本机凭据，进入 device login，已中止。
- `supabase --version` via `pnpm dlx`：2.109.0 可用；创建个人组织项目仍需 access token / 登录。

**风险 / 待办**：
- 首个管理员需登录后把 `profiles.is_admin` 置 true。
- 飞书后台需配置本地和生产 OAuth callback。
- 生产应设置 `FEISHU_ALLOWED_TENANT_KEYS`。
- 需要用户提供 Vercel/Supabase 登录态或 token 后，才能完成个人组织项目创建、迁移、env 配置和生产部署。

---

## 2026-07-04 · Phase 1 个人组织 Supabase / Vercel 接入

**当前状态**：GitHub、Supabase、Vercel 已接入用户个人组织/账号；生产部署 Ready。飞书 app id/secret 仍待用户在 Vercel 中补齐。

**本轮完成**：
- GitHub 仓库：`dbdangyi/cyber-strategy`，`main` 已推送。
- Supabase 项目：`cyber-strategy` / `gxsxtwcbmfpdpcrpfdhk` / `https://gxsxtwcbmfpdpcrpfdhk.supabase.co`。
- 通过 Supabase Management API 应用 `supabase/migrations/0001_init.sql`。
- Vercel 项目：`dbdang-yi-s-projects/cyber-strategy`，已连接 GitHub。
- Vercel env 已配置：`SESSION_SECRET`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`APP_BASE_URL`。
- 生产部署 Ready：`https://cyber-strategy.vercel.app`。

**验证**：
- Supabase 表存在：`profiles`、`scouting_datasets`、`audit_logs`。
- Vercel production deployment Ready：`dpl_9cozvLVN59N6CrNoUuyK9WNCisKp`。
- 线上 smoke：`/` 302 到 `/auth/login?returnTo=%2F`，`/auth/login` 返回 200。

**风险 / 待办**：
- 用户仍需在 Vercel 配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`，建议同时配置 `FEISHU_ALLOWED_TENANT_KEYS`。
- 飞书后台需添加生产回调：`https://cyber-strategy.vercel.app/api/auth/callback`。
- 首次飞书登录后，需在 Supabase 将首个管理员 `profiles.is_admin` 置为 `true`。
- 本轮使用过的 Vercel token 与 Supabase token 已出现在对话中；部署完成后建议用户轮换。

---

## 2026-07-04 · Phase 2 飞书生产 env 接入

**当前状态**：Vercel 已配置飞书生产/预览/开发环境变量并重新部署；登录入口已能跳转到飞书授权页。

**本轮完成**：
- Vercel env 已配置：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`。
- 生产重新部署 Ready：`https://cyber-strategy.vercel.app`。

**验证**：
- Vercel production deployment Ready：`dpl_C6gkaqg7MYBJNthtcvkppuByT1Gh`。
- 线上 smoke：`/` 302 到登录页，`/auth/login` 返回 200。
- `GET /api/auth/login?returnTo=%2F` 302 到飞书授权页，回调地址为 `https://cyber-strategy.vercel.app/api/auth/callback`。

**风险 / 待办**：
- 用户仍需在飞书后台添加生产回调：`https://cyber-strategy.vercel.app/api/auth/callback`。
- 建议补充 `FEISHU_ALLOWED_TENANT_KEYS` 做组织 allow-list。
- 首次飞书登录后，需在 Supabase 将首个管理员 `profiles.is_admin` 置为 `true`。
- 本轮使用过的飞书 secret 已出现在对话中；上线验证完成后建议轮换。

---

## 2026-07-13 · 首页数据集摘要精简

**当前状态**：首页数据分析工具栏已移除数据集摘要和实时数据状态文字，赛事选择与功能入口保持不变。

**本轮完成**：
- 删除“当前数据集”、赛事/队伍/记录数、“Scout 实时数据”和更新时间信息块。
- 移除 `AnalyticsDashboard` 不再使用的 `sourceStatus` 参数。

**验证**：
- `pnpm typecheck`、`pnpm lint`、`pnpm test`（64/64）、`pnpm build` 全部通过。
- 真实浏览器验证桌面 1440px 深色/浅色与移动 390px：目标文字均不存在，工具栏无溢出或空白错位。

**风险 / 待办**：
- 移动端逐场数据宽表仍会造成页面级横向溢出，属于既有问题，本轮未改。

---

## 2026-07-13 · 版本递增规则

**当前状态**：版本已从 `1.0.0` 升级为 `1.0.1`；仓库已约定每轮修改递增一次补丁版本号。

**本轮完成**：
- 新增仓库级 `AGENTS.md`，要求每轮修改同步更新包版本、应用页脚和登录页页脚。
- 本轮首页文案删除随 `1.0.1` 交付。

**验证**：
- 三处运行时版本号一致，均为 `1.0.1`。

**风险 / 待办**：无。

**补充验证**：真实浏览器确认登录页和登录后应用页脚均显示 `v1.0.1`；桌面明暗主题与 390px 移动登录页正常。

---

## 2026-07-13 · 删除 header 中央标题

**当前状态**：header 不再显示中央“数据分析”标题，版本升级为 `1.0.2`。

**本轮完成**：
- 删除应用 shell 的 `centerTitle="数据分析"` 传参。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.2`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 真实浏览器确认桌面 1440px 与移动 390px、深色/浅色 header 均无“数据分析”，header 高度保持 65px 且无自身横向溢出。

**风险 / 待办**：无。

---

## 2026-07-13 · 删除 2026mabil 内置比赛数据

**当前状态**：`2026mabil` 已从应用数据和赛事选择中移除，版本升级为 `1.0.3`。

**本轮完成**：
- 删除 5,421 行的 `app/data/advantalytics-sample.json` 内置数据。
- 将备用数据改为空状态，避免数据源不可用时重新展示旧比赛。
- 核对 Cyber Scout 与 Cyber Strategy 两个 Supabase：均不存在 `2026mabil` 赛事或数据集，因此未执行数据库删除。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.3`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 真实浏览器确认桌面/移动端、深色/浅色下均无 `2026mabil`；赛事选项仅剩 `2026txcmp1`、`2026txcmp2`、`2026cnsh`。

**风险 / 待办**：Cyber Scout 当前没有标记为 active 的赛事，首页默认显示空状态，选择赛事后可正常加载对应数据。

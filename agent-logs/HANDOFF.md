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

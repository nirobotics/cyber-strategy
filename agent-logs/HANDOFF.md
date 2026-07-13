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

---

## 2026-07-13 · 删除赛程分析顶部信息卡

**当前状态**：赛程分析不再显示 `TBA / Strategy / Statbotics` 和赛事编号卡片，版本升级为 `1.0.4`。

**本轮完成**：
- 删除 `MatchAnalysis` 顶部信息卡，保留 `eventKey` 的数据请求用途。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.4`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 真实浏览器确认桌面/移动端、深色/浅色下信息卡均消失，`2026txcmp2` 资格赛列表正常加载。

**风险 / 待办**：无。

---

## 2026-07-13 · 功能导航改为 cyber-parts 布局

**当前状态**：功能选择已改为独立横向导航条，赛事选择拆分为单独区域，版本升级为 `1.0.5`。

**本轮完成**：
- 按 cyber-parts 参考图调整功能导航：紫色实底选中项、透明未选项、加大图标与文字。
- 导航保持单行，移动端使用导航条内部横向滚动。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.5`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 真实浏览器确认桌面/移动端、深色/浅色布局与状态色正常；导航条和赛事选择区域均未超出视口。

**风险 / 待办**：浏览器观察到自动路线预览已有 hydration 数值格式警告，与本轮导航改动无关。

---

## 2026-07-13 · 功能导航并入双层 header

**当前状态**：顶部品牌栏与功能导航组成连续的双层 header，版本升级为 `1.0.6`。

**本轮完成**：
- header 品牌区和功能导航统一使用 `max-w-[1500px]` 居中对齐。
- 功能导航背景与底部分隔线改为全宽，并抵消 main 顶部 padding，紧贴顶部品牌栏。
- 业务正文保持独立的最大宽度容器，赛事选择仍位于正文。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.6`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 1920px 浏览器下品牌与导航左边缘偏差为 0，header 与导航间距为 0，无页面横向溢出。
- 390px 移动端导航全宽且内部横向滚动，赛事选择区域未超出视口；深色/浅色均正常。

**风险 / 待办**：自动路线预览既有 hydration 数值格式警告仍存在，与本轮布局无关。

---

## 2026-07-13 · 校准功能导航字号

**当前状态**：功能导航的文字、图标和按钮尺寸已与 cyber-parts 源码一致，版本升级为 `1.0.7`。

**本轮完成**：
- 导航文字由 16px / 600 调整为 14px / 500。
- 导航图标由 20px 调整为 16px，按钮改为 12px 水平、8px 垂直内边距。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.7`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、64 项测试和生产构建通过。
- 真实浏览器测量桌面与 390px 移动端字号均为 14px、字重 500、图标 16px、按钮高 36px。
- 深色/浅色正常；移动端导航内部横向滚动，页面无横向溢出。

**风险 / 待办**：自动路线预览既有 hydration 数值格式警告仍存在，与本轮改动无关。

---

## 2026-07-13 · Picklist 独立候选池

**当前状态**：1st Pick List 与 2nd Pick List 使用各自的候选池，版本升级为 `1.0.8`。

**本轮完成**：
- 当前列表已加入的队伍会从对应候选池移除，并同步更新剩余队伍计数。
- 同一队伍仍可分别进入 1st 与 2nd List；切换列表时使用各自独立的候选池。
- 叉号状态继续使用共享存储，在两个候选池中同步划掉与恢复。
- 切换按钮和标题统一为 `1st Pick List`、`2nd Pick List`。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.8`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、65 项测试和生产构建通过。
- 真实浏览器确认同一队伍加入任一列表后，对应候选池由 45 变为 44；切换列表后各自状态独立。
- 叉掉队伍后，两个候选池均显示共享的划掉状态；桌面/390px 移动端、深色/浅色正常，无横向溢出，控制台无错误。

**风险 / 待办**：无。

---

## 2026-07-13 · 删除待验证 / 未完成汇总卡

**当前状态**：Scouting Lead 信心分汇总区已移除“待验证 / 未完成”卡片，版本升级为 `1.0.9`。

**本轮完成**：
- 删除“待验证 / 未完成”统计卡和未使用的 Gauge 图标。
- 桌面汇总网格由 5 列调整为 4 列。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.9`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、65 项测试和生产构建通过。
- 真实浏览器确认汇总区仅保留“预测记录、已计分、全员净分、准确率”4 张卡。
- 桌面为等宽 4 列；390px 移动端为 364px 单列，深色/浅色正常，无横向溢出，验证页控制台无错误。

**风险 / 待办**：真实数据加载时仍可观察到既有的服务端/客户端日期本地化 hydration 警告，与本轮删卡无关。

---

## 2026-07-13 · 赛事选择并入功能导航

**当前状态**：赛事选择器已移入功能按钮正下方，和功能导航共用同一容器，版本升级为 `1.0.10`。

**本轮完成**：
- 功能导航改为按钮行与赛事选择行的两行结构。
- 删除正文中原有的独立赛事选择卡片。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.10`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、65 项测试和生产构建通过。
- 1440px 浏览器确认按钮行和选择器位于同一容器，垂直间距 8px，选择器宽 576px。
- 390px 移动端导航在内部横向滚动，选择器宽 360px 并完整包含在导航框内；深色/浅色正常。

**风险 / 待办**：队伍详情既有的移动端页面级横向溢出和自动路线 hydration 警告仍存在，与本轮导航调整无关。

---

## 2026-07-13 · 赛事选择器按内容自适应宽度

**当前状态**：桌面赛事选择器会随当前赛事名称长度改变宽度，版本升级为 `1.0.11`。

**本轮完成**：
- `sm` 及以上使用原生 `field-sizing: content` 按选中文字计算宽度。
- 手机端保持容器全宽，并为导航 Grid 增加 `minmax(0, 1fr)` 防止长赛事名撑开页面。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.11`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、65 项测试和生产构建通过。
- 1440px 浏览器实测 Apollo 长名称宽 395.8px，Shanghai Regional 宽 165.0px。
- 390px 移动端长名称选择器宽 360px，完整包含在导航框内且页面无横向溢出；浅色主题正常。

**风险 / 待办**：自动路线既有 hydration 警告仍存在，与本轮选择器宽度调整无关。

---

## 2026-07-14 · 精简提交记录与 Proposal 筛选

**当前状态**：Scouting Lead 提交记录顶部统计卡及 Strategy Proposal 类型筛选已移除，版本升级为 `1.0.12`。

**本轮完成**：
- 删除提交记录页“全部提交、普通 Scout、超级 Scout”3 张统计卡，保留记录查询列表。
- 删除 Proposal 列表“所有类型”筛选及对应状态、过滤条件。
- 保留 Proposal 编辑区“类型”字段。
- 同步更新包版本、应用页脚和登录页页脚至 `1.0.12`。

**验证**：
- `pnpm typecheck`、`pnpm lint`、65 项测试和生产构建通过。
- 真实浏览器确认提交记录页直接显示“按赛程查询”，3 张统计卡不存在。
- Proposal 列表仅保留状态、队号和比赛筛选，编辑区类型字段仍在；桌面端、390px 移动端及深色、浅色主题显示正常，无横向溢出，控制台无错误。

**风险 / 待办**：无。

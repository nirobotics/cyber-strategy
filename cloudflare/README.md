# cyber-strategy Cloudflare 本地预览适配

状态：`local-runtime-prepared-blocked-config-and-data`。仅本地准备，**没有云部署、DNS、生产切换或真实数据迁移**。
固定目标：account `2ca8df5c9754fb7e3f37d08c597535e0`，Worker `cyber-strategy-preview`，未来 origin `https://strategy-cf.team8214.com`。`workersDev`、preview URL、routes/domains、triggers 均关闭；本仓库没有线上发布命令。

## 给人看的入口

保留原 Vercel/React Router/Vite 配置、业务源码、根依赖锁和产品版本 `2026.1.77`；本次按明确授权不递增产品版本。独立分支 `migration/cloudflare-preview`，基础提交 `2282230eb02ec40208681968ab1617855fb18ece`。生产/旧数据库/Companion 不改动。

此 Worker 不是静态站：`createRequestHandler` 承接全部 SSR、loader、action、OAuth、API。现有 Supabase HTTPS 层保留，**退出旧 DB 未完成**。自有 `profiles / scouting_datasets / audit_logs / app_settings / strategy_proposals` 五表及四份 SQL 保留；Scout 第二客户端还会更新记录 payload、写入/删除 assignments、删除 `pit-photos` 和记录，不能接生产 Scout 做“只读预览”。

## 给 AI 看的工具与命令

Node **22.23.4**；根 pnpm **11.5.0**；sidecar pnpm **11.7.0**、`cf 1.0.0-beta.31`、委托 `wrangler 4.161.0`、Miniflare `5.20261110.2-beta` / workerd `1.20261110.1`。
先将正确 Node 放入 PATH，并将 `PI_SCRATCH_DIR` 设为可写的绝对临时目录。不要带入真实应用变量、`.env`、Cloudflare token 或用户配置；本地工具子进程使用隔离 HOME/缓存和最小环境。

```sh
# 在仓库根目录；以下检查必须串行，不能争用 .react-router
corepack pnpm@11.5.0 install --frozen-lockfile
corepack pnpm@11.5.0 run typecheck
corepack pnpm@11.5.0 run lint
corepack pnpm@11.5.0 run test
corepack pnpm@11.5.0 run build

cd cloudflare
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run dry-run  # cf deploy --dry-run --mode preview --no-provision + strict TS + 全包校验
corepack pnpm@11.7.0 run test     # 实际 bundle 的 workerd 验收；所有 outboundService 都是本地 mock
corepack pnpm@11.7.0 run check
```

`dry-run` 不接收额外参数。配置拒绝 production/default mode、generated Preview 和 account/name/environment/zone 环境覆盖；无任何 production route。不要运行不带 `--dry-run` 的 cf/wrangler deploy，也不要配置 DNS。

## 构建与字节边界

- `.build-input` 是指向 scratch 的隔离镜像，只从固定 git tree 的枚举文件生成；不复制 `.env*`、本地部署目录或真实数据。只在镜像移除 Vercel preset，保留 `ssr: true` 并使用 initial route discovery；镜像 analytics noop，不改原产品。
- 原默认 Node SSR entry 保持；builder 显式 alias `react-dom/server.node`，否则 Workers 条件导出缺 `renderToPipeableStream`。
- Tailwind 显式枚举原文本输入，原 CSS **53,251 bytes** / SHA-256 `ab90e2b0855e32eb4bcbae696f0318f37934006075445cdfc0013f0d5afb3e24`。四个 public 图片逐字节一致。
- `source-lock.json` 固定 147 个原文件；允许变化仅根 ignore/TS/lint 排除项和 append-only handoff。新增根 Vitest 配置只排 sidecar。`release-contract.json` 固定全部 **52** 个最终浏览器资产的长度、MIME、SHA-256；不得为通过检查自动刷新 contract。
- 最终包只有 **55** 个文件：52 个资产、完整 ESM Worker、两份 cf 元配置。没有 `.env`、source map、原始源码、私有目录或 server 构建目录混入静态资产；校验所有 JS/CSS 依赖闭包。
- 整个 `/cloudflare/` 被根 gitignore 忽略；交付源码须逐个 `git add -f cloudflare/具体文件`，禁止 force-add 整个目录。镜像、node_modules、工具输出不提交。

## Secret 名单（不含任何真实值）

| 名称 | 用途 / 门禁 |
| --- | --- |
| `SESSION_SECRET` | 独立 preview 会话 AES-256-GCM，至少 32 字符 |
| `FEISHU_APP_ID`, `FEISHU_APP_SECRET` | 正常 Feishu OAuth v2 + PKCE，不是 demo auth |
| `FEISHU_ALLOWED_TENANT_KEYS` | 必须是非空 comma allowlist；原 callback 仍校验实际 tenant |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Strategy 独立预览库 HTTPS 兼容准备；不是共享 DB/gateway |
| `CYBER_SCOUT_SUPABASE_URL`, `CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY` | Scout 独立预览数据源，不能与上项 URL 相同 |
| `CYBER_STRATEGY_EMBED_SECRET` | preview Pit/Strategy 共享 HMAC secret，至少 32 字符，不能复用生产 secret |
| `FRC_EVENTS_USERNAME`, `FRC_EVENTS_API_KEY`, `TBA_API_KEY` | 保留原 FRC/TBA 业务 |
| `FEISHU_VIDEO_LIBRARY_NODE_TOKEN`, `FEISHU_VIDEO_LIBRARY_URL` | 原 Wiki 视频目录，至少配置其中之一 |

浏览器 Statbotics HTTPS 请求保留，无新增 secret。`FEISHU_AUTHORIZE_BASE / FEISHU_API_BASE / FEISHU_OAUTH_SCOPE` 在本 preview 不开放覆盖；源应用代码不变。

## 解除阻塞前必须完成（由主代理/平台负责）

1. 配置上述独立 preview secrets、Feishu callback `https://strategy-cf.team8214.com/auth/feishu/callback`（兼容 `/api/auth/callback`），非空租户名单与首个管理员真实 `profiles.is_admin`。Secure、HttpOnly、SameSite=Lax、host-only cookie 由原应用产生；原服务端登录/审批/管理员/owner 权限不绕过。
2. 完成自有五表的独立 schema/data 迁移、RLS/权限/审计/审批快照验证，以及 Scout 四表与私有 `pit-photos` 的独立兼容读写验收。旧数据的数量/校验和、照片、外键、审核状态必须由获授权的平台任务另行验证。本轮没有导出/导入或触碰真实数据；将来退出 Supabase 仍需真实 schema/data 迁移与访问层改造。
3. `STRATEGY_DATA_READY` 当前固定 `blocked`，只有经审核完成 **Strategy 和 Scout 两套隔离数据** 后才能显式改为 `approved-isolated-strategy-and-scout-data`；不能用空数据或生产 Scout 冒充成功。
4. `STRATEGY_INTEGRATIONS_READY` 当前固定 `blocked`。显式核准 `CYBER_PIT_ORIGIN=https://pit-cf.team8214.com`、`CYBER_SCOUT_ORIGIN=https://scout-cf.team8214.com` 和共享签名 secret 的相互配置后才可改为 `approved-preview-contract`。生产 Pit 的原 CSP 不改；Worker 仅对 preview embed 收窄为 `frame-ancestors https://pit-cf.team8214.com`，不放宽通配符/生产来源。签名顺序、5 分钟有效期、Bearer 预检见 `tests/cross-app-contract.json` 和 actual-bundle 测试。

缺配置/数据/联动门禁，`/__ready` 和已知动态页面/API 一律 **503**，不发业务外请求；`/__health` 仅存活。未知路由及私有路径始终 **404**；错误域名/非 HTTPS **421**。全部动态响应（含错误、redirect、loader、embed）强制 private/no-store/noindex，不能缓存身份信息；静态文件按精确 manifest 转发到显式 `ASSETS` binding。

## 验收与回滚

基线及最终根 `typecheck/lint/test/build` 串行通过：21 files / 141 tests。sidecar 严格类型与 cf 实际 dry-run 通过；16 项本地检查（4 个源码/配置/全包检查 + 12 个 workerd 测试）通过：缺配置与独立门禁、404/host、SSR、PKCE/租户/cookie、匿名/过期/篡改会话、nonadmin/审批、非空 Scout 数据、Feishu Wiki、Pit HMAC/CSP、Scout payload/assignment/照片删除与全部 52 资产 GET SHA/HEAD。所有外请求被 mock，不接触真实 Feishu/Supabase。

失败轮记录：严格类型首轮发现 config tuple 和 RR route map 可含 undefined，已用 const tuple/type guard 修复；runtime R1 为测试 fixture 少闭合括号，R2 为 mock 未实现 PostgREST `limit=1` 与 Scout `user_profiles`，R3 16/16 通过。未放宽断言、未刷新来源/CSS contract。根 Vercel 的 envFile deprecation 和 SSR `<Navigate>` 提示属于保留的原行为。

未验证：真实云部署/DNS/Feishu 登录、真实 DB/存储迁移、真实 Pit/Scout 联动，以及浏览器桌面/移动/明暗主题视觉回归；没有这些操作权限且本任务明确不做云操作。回滚：丢弃本分支或反向本地 sidecar 提交即可；生产配置、旧 DB 和 Companion 从未被修改，无需线上回滚。

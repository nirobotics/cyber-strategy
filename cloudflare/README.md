# Cyber Strategy 赛季模板 Worker

React Router 运行在 Cloudflare Workers 上。Strategy 业务数据存在独立 D1，写入通过 Durable Object 串行化。Cyber Scout 通过签名后的 Worker 服务绑定访问。赛季配置仍在 `app/season/`。

## 本地验证

从仓库根目录运行。

```sh
pnpm install --frozen-lockfile
cd cloudflare
corepack pnpm@11.7.0 install --frozen-lockfile
node scripts/package.mjs
node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs
```

默认打包使用 `.example.invalid` 域名和占位资源 ID。测试启动本地 Worker、D1、R2 和 Scout 测试 Worker。

## 部署到赛季环境

- 准备独立的 Worker、D1 数据库、R2 bucket、Cloudflare zone 和 Scout Worker。用 Wrangler 对全新 D1 执行 `cloudflare/native/schema.sql` 一次。已使用相同 D1 schema 的环境可直接部署 Group 功能，组记录存入现有 `app_settings`。需要迁移旧环境时，将已有表记录按 `id` 和 `row_json` 导入，保留已登录用户的飞书 `open_id` 及管理员标记。
- 设置 `CF_STRATEGY_ACCOUNT_ID`、`CF_STRATEGY_WORKER`、`CF_STRATEGY_ORIGIN`、`CF_STRATEGY_ZONE`、`CF_STRATEGY_D1_ID`、`CF_STRATEGY_D1_NAME`、`CF_STRATEGY_R2`、`CF_STRATEGY_SCOUT_WORKER`、`CF_STRATEGY_SCOUT_ORIGIN` 和 `CF_STRATEGY_PIT_ORIGIN`。使用赛季专用资源；配置校验会拒绝主应用的 Strategy Worker、域名、D1 和 R2。
- 在 Worker 配置 `cloudflare.config.ts` 声明的 secrets。为飞书应用配置赛季域名的 `/auth/feishu/callback`，再开通读取部门及部门直属用户的通讯录权限，并将通讯录可见范围设为全员。
- 用上述配置重新运行 `node scripts/package.mjs`。在已授权的 Cloudflare 环境运行 `pnpm deploy`，脚本会先校验打包产物对应同一赛季配置。部署后检查 `/__ready`、飞书登录和选人器。

# Strategy 受控 canary（默认关闭，非 business-ready）

本轮仅 `POST /strategy-proposal` 的合成 proposal 生命周期。`/picklists` **未开放**；settings、historic edits、assignments、Scout service mutations、source deletion、AI/message/job/file writes 均未开放。不部署/发真实请求/访问真实 session/secret/vault；预计资源 effects **0**。版本继续使用本用户 turn 已 bump 的 **2026.1.80**，不再次 bump。

## 独立配置

- `BUSINESS_WRITES=controlled-canary`（绝不用全局 `enabled` 凑验收）。
- `MIGRATION_CANARY_ACTOR_OPEN_ID`：专用 Secret，无默认 value；必须精确等于官方加密签名 session 的 `feishuOpenId`，并且当前 D1 profile 的 `open_id` 完全一致、`is_admin===true`。不接受请求传 actor/admin/tenant。
- `CANARY_EVENT_KEY=2026cfmigrationacceptance`，显式 text。
- `CANARY_STARTS_AT` / `CANARY_EXPIRES_AT`：严格 UTC `YYYY-MM-DDTHH:mm:ssZ`、start <= now < expiry、0 < expiry-start <=24h。缺省/blocked/时区 offset/小数秒/非法日历/过期/未来 start 均拒绝。
- 原 `AUTH_WRITES` 独立；仅原 OAuth profile 和 `auth.login` audit 使用它，绝不能由该开关授权 business。开启 canary 不修改 AUTH_WRITES。
- 原 readiness 的 data/integration gates、双独立 source catalog/native DDL SHA、独立 DB/R2/DO 和 SCOUT binding 仍要求。**不改 native_catalog/native_seal。**

仓库中所有上述 text gates 默认 `blocked`，无 schedule；可选 canary actor secret 未计入普通 readiness 必需项。未配置/不使用 canary 时不会破坏已通过的原 OAuth。controlled 模式 readiness 仍 `businessWrites:false`，不是普通业务开放。

## 精确入口与 body

必须是正式 OAuth 已登录的真实管理员；保留原 AES-GCM session、tenant/state/PKCE/expiry 规则。`Origin` 必须精确等于当前 canonical origin，`Sec-Fetch-Site` 若存在只能 `same-origin`。原生产 enabled 模式不改变。

唯一方法/路径：`POST /strategy-proposal`（不能 `.data`/query）。`Content-Type: application/x-www-form-urlencoded`（可带 UTF-8 charset），Worker 对 `request.clone()` 实际字节计数、最多 **8192 bytes**；拒绝 multipart/文件/重复字段/多余字段。准入后直接调用原 typed proposal/state-machine/repository，跳过 SSR loaders，不发 Scout/外部集成请求；失败保留真实 4xx/503，不能 HTTP200 错误页冒充成功。

固定合成域：

- event: `2026cfmigrationacceptance`
- match: `2026cfmigrationacceptance_qm1`
- match label: `CANARY Q1`
- proposal type `auto`、ownTeam `8214`
- note marker: `SYNTHETIC_MIGRATION_CANARY`（仅允许这个或带 `_EDIT` 的第二个值）
- 唯一新 proposal DB UUID: `2bc56a47-e09d-45db-8f18-ecf91fca0001`。不接受任意新 ID；已存在 create 返回409，后续需显式同 ID。所有 existing ID 都从 DB 读回检查 event、match、marker、creator，并排除 `native_import_rows` 的 baseline；不能靠 body eventKey 伪装 foreign ID。

### 创建草稿

以下是**完整原始 body**，不是 JSON：

```text
intent=save&eventKey=2026cfmigrationacceptance&matchKey=2026cfmigrationacceptance_qm1&matchLabel=CANARY+Q1&ownTeam=8214&proposalType=auto&payload=%7B%22note%22%3A%22SYNTHETIC_MIGRATION_CANARY%22%7D
```

返回 `{"ok":true,"proposalId":"2bc56a47-e09d-45db-8f18-ecf91fca0001"}`。相同无ID create 重放 `409`，不会分配新 proposal。

### 保存/提交（既有 ID）

`save` 保存；以下完整 body `submit` 提交（使用 `_EDIT` 时为明确的合成更新）：

```text
intent=submit&eventKey=2026cfmigrationacceptance&id=2bc56a47-e09d-45db-8f18-ecf91fca0001&matchKey=2026cfmigrationacceptance_qm1&matchLabel=CANARY+Q1&ownTeam=8214&proposalType=auto&payload=%7B%22note%22%3A%22SYNTHETIC_MIGRATION_CANARY_EDIT%22%7D
```

也可 `intent=submit` 且不带ID直接创建 submitted；仍只分配同一个固定 ID。

### 审核

```text
intent=review&eventKey=2026cfmigrationacceptance&id=2bc56a47-e09d-45db-8f18-ecf91fca0001&decision=approved&reviewNote=SYNTHETIC_MIGRATION_CANARY
```

`decision` 只能 `approved` / `rejected`。原状态机必须已 submitted 才能 review；draft review 为403（不是200）。审批保留原 last_approved_snapshot 语义。

### 恢复/删除

先有批准快照，再提交 `_EDIT` 更新，可用：

```text
intent=restore&eventKey=2026cfmigrationacceptance&id=2bc56a47-e09d-45db-8f18-ecf91fca0001
```

```text
intent=delete&eventKey=2026cfmigrationacceptance&id=2bc56a47-e09d-45db-8f18-ecf91fca0001
```

返回 `ok:true` 以及 proposalId 或 `deleted:true`。所有阶段都重读官方 session/current DB admin、actor/window/CSRF；body 不能提供/覆盖 created_by、reviewed_by、event_key SQL 或 settings。

## 本地验证

Node **22.23.4**，从 `cloudflare/`，`PI_SCRATCH_DIR` 指向会话 scratch：

```sh
node scripts/dry-run.mjs  # --dry-run --no-provision；SSR/strict/package/CSS/public gates
node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs
```

本轮 **40/40**（原35+新增5）通过：原 tests 全保留；实际 Miniflare/workerd D1/R2/DO/跨应用本地 binding，官方 synthetic OAuth flow 获得 session，完整 create/conflict/update/submit/review/restore/reject/delete；所有历史 raw rows、import archives、双 seal、原 R2 与 Scout 数据逐字节不变。非 canary/foreign/imported、非 admin/actor/missingsecret、过期/篡改 session、window/state/CSRF/bodybounds/重复字段/其它写面都在 mutation 前拒绝；合成 canary 流程无集成请求。额外为原 proposal 纯算法代码的既有数组边界添加 type-only 非空断言，以使原状态机可在 sidecar `noUncheckedIndexedAccess` 下直接复用；无运行时/浏览器/CSS字节改变。

未完成/故意关闭：picklists、Scout pit/私有 PNG（0slots，不缓冲任何文件）、真实云管理员 canary/浏览器验证、生产/调度交接。仅交付受限 infrastructure，不标 business-ready。完整测试/构建均本地，不能替代真实官方管理员验收；没有 push/commit 或源写入。

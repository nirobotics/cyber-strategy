# cyber-strategy — Cloudflare-native local package

Status: `local-native-business-implemented-data-gate-closed`. This is local code and synthetic workerd validation only. No Cloudflare deploy, DNS, source write, real Feishu request, real source DB/object read, secret read or push was performed. Source Supabase and production/Companion remain untouched.

## Independent runtime and cross-app boundary

- Source base: `6cce06d012af2805e7f9177182bfdba877ff1fb9`; source adapter reference: `2282230eb02ec40208681968ab1617855fb18ece`.
- Node `22.23.4`, pnpm `11.5.0` root / `11.7.0` sidecar, `cf@1.0.0-beta.31`, Wrangler `4.161.0`, Miniflare `5.20261110.2-beta`.
- Account `2ca8df5c9754fb7e3f37d08c597535e0`, Worker `cyber-strategy-preview`, intended preview origin `https://strategy-cf.team8214.com`; routes, workers.dev, preview URLs and triggers are closed.
- Native persistence is independent: `DB` = D1 `cyber-strategy-native-preview`; `FILES` = private R2 `cyber-strategy-native-preview`; `BUSINESS` = SQLite Durable Object class `StrategyBusiness`; `ASSETS` = Static Assets.
- `SCOUT` is a Worker service binding to the separate `cyber-scout-preview` Worker. Scout data is never mounted into Strategy D1/R2. Signed requests use `SCOUT_STRATEGY_SECRET`, actor, capability, timestamp and body hash; only explicit events/users/config/records/photo/assignment/edit operations exist.
- Pit integration retains the existing Bearer precheck, five-minute newline-joined HMAC contract and preview CSP. No arbitrary SQL, PostgREST, generic gateway or shared database is introduced.

## Source catalog/export/import contract

`native/catalog-contract.json` contains the safe shape, not actual rows or a readiness claim. Parent data work must review and pin the exact source catalog before import:

- eleven retained tables: `profiles`, `scouting_datasets`, `app_settings`, `strategy_proposals`, `audit_logs`, `matches`, `match_videos`, `match_markings`, `match_notes`, `match_score_samples`, `video_processing_jobs`;
- private bucket `match-videos`, observed safe shape `1` object / `10,554,246` bytes, source ref `gxsxtwcbmfpdpcrpfdhk`;
- routines observed by the safe shape are `prevent_audit_log_mutation` and `set_updated_at`; exact definitions, columns, defaults, constraints, FKs, indexes, RLS/ACL and storage policies still require the actual parent snapshot.

`native/snapshot.mjs` exports pure parameterized queries for one UTC `READ ONLY REPEATABLE READ` source transaction. Every cell is retained as raw JSON text or SQL `NULL`; int64 decimal lexemes, JSON null, history/IDs and UTC microseconds are not parsed and re-stringified. `importPlan()` builds typed native inserts plus source-cell archive; `readback()` checks every table/cell/FK, exact private object inventory/metadata/bytes and SHA-256; `sealVerified()` requires nonempty complete data and exact object inventory. Synthetic provenance is local Miniflare-only. The shape inventory is never accepted as an actual catalog.

Gates are closed by default: `SOURCE_CATALOG_SHA256=blocked`, `STRATEGY_DATA_READY=blocked`, `STRATEGY_INTEGRATIONS_READY=blocked`, `BUSINESS_WRITES=blocked`. A future operator must perform parent-approved actual export, encrypted import, full readback, rollback proof, independent auth/integration acceptance and only then open both gates. Empty D1 or a source passthrough is not ready.

## Business/auth/permission behavior

- Feishu OAuth state is one-time, expiry-bound and cookie-bound; tenant allow-list, profile/admin lookup, secure host-only session and seven-day session expiry remain. Native profile/settings/proposal/picklist/audit writes use D1 transactions and live actor profiles.
- Strategy proposal workflow preserves draft/submitted/approved/rejected transitions, owner/admin rules, immutable `last_approved_snapshot`, restore/review/delete audit actions and raw unknown JSON fields. Settings and picklists preserve main/personal ownership, idempotent client resubmission and delete permissions.
- Scout reads, normal/super edits, assignments, records and private photos remain available to Strategy through the narrow authenticated service binding. Edits update only approved leaf paths; unrelated source JSON/int64/history is retained. Private photo API preserves safe paths, R2 ranges, HEAD and no-store policy.
- Same-origin mutations are serialized by `StrategyBusiness`; CSRF, unknown/private routes, exact host, private caching headers and error boundaries remain closed. Original data algorithms, Pit HMAC/CSP, FRC/TBA/Wiki integrations, CSS and browser asset semantics remain intact.
- `ORIGIN_HANDOVER=approved-same-origin` may be used only after parent-approved DNS/cutover and old-origin session/IndexedDB compatibility review. This local package does not clear browser data or claim a handover.

## Binding/secret names (names only; never commit values)

Bindings: `ASSETS`, `DB`, `FILES`, `BUSINESS`, `SCOUT`, `SOURCE_CATALOG_SHA256`, `BUSINESS_WRITES`, `ORIGIN_HANDOVER`.

Secrets: `SESSION_SECRET`, `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_ALLOWED_TENANT_KEYS`, `SCOUT_STRATEGY_SECRET`, `CYBER_STRATEGY_EMBED_SECRET`, `FRC_EVENTS_USERNAME`, `FRC_EVENTS_API_KEY`, `TBA_API_KEY`, `FEISHU_VIDEO_LIBRARY_NODE_TOKEN`, `FEISHU_VIDEO_LIBRARY_URL`. The native Worker rejects `SUPABASE_URL`, service-role keys, Scout source database URL/key and `DATABASE_URL`; no shared business credential is a database-sharing permission.

## Local validation and release

Run serially with Node 22.23.4 and `PI_SCRATCH_DIR`:

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd cloudflare
pnpm install --frozen-lockfile
pnpm dry-run                 # cf deploy --dry-run --mode preview --no-provision
pnpm typecheck && pnpm check && pnpm test
```

The final local package is 55 files / 52 exact assets; `native-release-contract.json`, `source-review.json`, `release-contract.json`, original CSS/public hashes, full dynamic route markers, secret absence and asset bytes are checked. Before any future authorized publication, run `node tooling/migration/assert-native-target.mjs <worker.config.json>`, provision only Strategy's independent D1/R2/DO and the separately approved Scout service binding, upload named secrets through restricted platform procedure, import reviewed actual data, then validate Feishu/admin/owner/Pit/Scout/browser/rollback acceptance. This task performed no cloud action.

Rollback is local commit revert/removal only. Do not push, change DNS, retire source data or clear user offline/browser state.

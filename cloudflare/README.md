# cyber-strategy on Cloudflare

The production Worker for `https://strategy.team8214.com`. One configuration, one mode (`production`); it simply serves.

| Part | Resource |
| --- | --- |
| Worker | `cyber-strategy`, route `strategy.team8214.com/*` on zone `rockyxrq.com`, logs on |
| Database | D1 `cyber-strategy` (`DB`): the eleven tables of the original database, one `row_json` per record |
| Scout data | service binding `SCOUT` to the Worker `cyber-scout` (its signed `/_scout/v1/*` API); Strategy has no copy of it |
| Writes | Durable Object `StrategyBusiness` (`BUSINESS`): every write runs through it, one at a time |
| Files | R2 `cyber-strategy` (`FILES`): archive of the original `match-videos` bucket; the app does not read it |
| Browser files | Static Assets (`ASSETS`); `/assets/*` is served without running the Worker |

`worker.ts` is the whole adapter: host check, static files, `/__ready`, then the unchanged React Router app. It has no route
or method allow-list: every file in `app/routes` is served (a test enumerates them). GET routes that write
(OAuth start and callback, logout) are listed in `writingReads` so they also run inside the Durable Object.

Text bindings: `APP_BASE_URL`, `CYBER_SCOUT_ORIGIN`, `CYBER_PIT_ORIGIN`.
Secrets (names): `SESSION_SECRET`, `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_ALLOWED_TENANT_KEYS`,
`CYBER_STRATEGY_EMBED_SECRET` (same value as in Cyber Pit), `SCOUT_STRATEGY_SECRET` (same value as on `cyber-scout`),
`FRC_EVENTS_USERNAME`, `FRC_EVENTS_API_KEY`, `TBA_API_KEY`. The Feishu Wiki video library (`FEISHU_VIDEO_LIBRARY_NODE_TOKEN` or
`FEISHU_VIDEO_LIBRARY_URL`) is not configured, as in the original deployment: the app shows no video links. To enable it,
add the binding in `cloudflare.config.ts`.

Cyber Scout and Cyber Strategy go live together: Strategy signs its requests for `https://scout.team8214.com`.

## Build, test, deploy

Node 22.23.4. Run from this directory, after `pnpm install --frozen-lockfile` here and in the repository root.

```sh
node scripts/package.mjs      # typecheck, build, package (no upload), verify -> .cloudflare/output
node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs
node node_modules/cf/bin/cf deploy --prebuilt --mode production --no-provision      # after cyber-scout
```

The tests run this package and the packaged `cyber-scout` (checked out next to this repository, packaged first) together
in local workerd; outbound calls are stubbed. `GET /__ready` checks the bindings and D1 (200 or 503); ordinary requests
do not run that check.

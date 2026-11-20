import { bindings, defineConfig, exports, triggers } from "cf/config";

// The production Worker for https://strategy.team8214.com.
// The route is declared on the host's own zone on Cloudflare; DNS is at Cloudflare since 2026-11-20.
export const identity = Object.freeze({
  accountId: "2ca8df5c9754fb7e3f37d08c597535e0",
  name: "cyber-strategy",
  origin: "https://strategy.team8214.com",
  zone: "team8214.com",
  // D1 `cyber-strategy-hk` (primary in Hong Kong): all eleven tables of the original database. On 2026-11-20 the data
  // moved here, as a full export, from the first D1 database `cyber-strategy` (Singapore), which is no longer bound.
  databaseId: "f31e6a3a-ec11-4ba6-9819-9b53983a40c0",
  // R2 `cyber-strategy`: the content of the original `match-videos` bucket (one processed video of an earlier feature).
  // The app does not read it; it is bound so the archive stays attached to its application.
  bucket: "cyber-strategy",
  // Scouting data is read and edited through the production Scout Worker (its /_scout/v1 API, signed with SCOUT_STRATEGY_SECRET).
  scout: Object.freeze({ worker: "cyber-scout", origin: "https://scout.team8214.com" }),
  // Cyber Pit embeds /embed in an iframe.
  pitOrigin: "https://pit.team8214.com",
});

export const assetRouting = Object.freeze(["/*", "!/assets/*"]);

export default defineConfig(({ mode, isPreview }) => {
  if (isPreview || mode !== "production") throw new Error("Only the production mode is configured: cf deploy --mode production");
  return {
    accountId: identity.accountId,
    worker: {
      name: identity.name,
      entrypoint: "./worker.ts",
      compatibilityDate: "2026-11-15",
      compatibilityFlags: ["nodejs_compat"],
      workersDev: false,
      previewUrls: false,
      domains: [],
      triggers: [triggers.fetch({ pattern: new URL(identity.origin).hostname + "/*", zone: identity.zone })],
      // Content-hashed build files under /assets/ are served straight from Static Assets (headers: see scripts/build.mjs);
      // everything else goes through the Worker.
      assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: [...assetRouting] },
      observability: { enabled: true },
      exports: { StrategyBusiness: exports.durableObject({ storage: "sqlite" }) },
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ id: identity.databaseId, name: "cyber-strategy-hk" }),
        FILES: bindings.r2({ name: identity.bucket }),
        BUSINESS: bindings.durableObject({ worker: identity.name, exportName: "StrategyBusiness" }),
        SCOUT: bindings.worker({ worker: identity.scout.worker }),
        APP_BASE_URL: bindings.text(identity.origin),
        CYBER_SCOUT_ORIGIN: bindings.text(identity.scout.origin),
        CYBER_PIT_ORIGIN: bindings.text(identity.pitOrigin),
        SESSION_SECRET: bindings.secret(),
        FEISHU_APP_ID: bindings.secret(),
        FEISHU_APP_SECRET: bindings.secret(),
        FEISHU_ALLOWED_TENANT_KEYS: bindings.secret(),
        // Shared with Cyber Pit: bearer for POST /api/cyber-pit-embed and signature of the /embed link.
        CYBER_STRATEGY_EMBED_SECRET: bindings.secret(),
        // Shared with cyber-scout: signs the requests to its /_scout/v1 API.
        SCOUT_STRATEGY_SECRET: bindings.secret(),
        FRC_EVENTS_USERNAME: bindings.secret(),
        FRC_EVENTS_API_KEY: bindings.secret(),
        TBA_API_KEY: bindings.secret(),
      },
    },
  };
});

import { bindings, defineConfig, exports, triggers } from "cf/config";

// The production Worker for https://strategy.team8214.com.
// strategy.team8214.com is a custom hostname on the zone below; its DNS stays at Aliyun (CNAME to saas-target.rockyxrq.com).
export const identity = Object.freeze({
  accountId: "2ca8df5c9754fb7e3f37d08c597535e0",
  name: "cyber-strategy",
  origin: "https://strategy.team8214.com",
  zone: "rockyxrq.com",
  // D1 `cyber-strategy`: all eleven tables of the original database.
  databaseId: "79f063f0-4b36-454b-aae5-656274956d9a",
  // The original `match-videos` bucket (one processed video of an earlier feature). The app does not read it;
  // it is bound so the archive stays attached to its application.
  bucket: "cyber-strategy-native-preview",
  // Scouting data is read and edited through the production Scout Worker (its /_scout/v1 API, signed with SCOUT_STRATEGY_SECRET).
  scout: Object.freeze({ worker: "cyber-scout", origin: "https://scout.team8214.com" }),
  // Cyber Pit embeds /embed in an iframe.
  pitOrigin: "https://pit.team8214.com",
});

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
      assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
      observability: { enabled: true },
      exports: { StrategyBusiness: exports.durableObject({ storage: "sqlite" }) },
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ id: identity.databaseId, name: "cyber-strategy" }),
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

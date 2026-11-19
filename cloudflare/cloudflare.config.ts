import { bindings, defineConfig, exports } from "cf/config";
import { productionConfig } from "./production/config.ts";

export default defineConfig(({ mode, isPreview }) => {
  if (isPreview) throw new Error("Generated Preview deployments are not configured.");
  if (mode === "production") return productionConfig();
  if (mode !== "preview") throw new Error("Only isolated preview or closed production standby is configured.");
  const accountId = "2ca8df5c9754fb7e3f37d08c597535e0";
  const name = "cyber-strategy-preview";
  for (const [key, expected] of [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_CI_OVERRIDE_WORKER_NAME", name],
    ["CLOUDFLARE_ENV", "preview"],
    ["WRANGLER_ENV", "preview"],
  ] as const) {
    if (process.env[key] !== undefined && process.env[key] !== expected)
      throw new Error(`Refusing ${key} override for the isolated preview.`);
  }
  if (process.env.CLOUDFLARE_ZONE_ID !== undefined)
    throw new Error("Zone overrides are forbidden for this preview.");
  return {
    accountId,
    worker: {
      name,
      entrypoint: "./worker.ts",
      compatibilityDate: "2026-11-15",
      compatibilityFlags: ["nodejs_compat"],
      workersDev: false,
      previewUrls: false,
      domains: [],
      triggers: [],
      assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
      observability: { enabled: false },
      exports: { StrategyBusiness: exports.durableObject({ storage: "sqlite" }) },
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ name: "cyber-strategy-native-preview", id: "c8430ab1-0fbe-424f-b329-5395f8e037ed" }),
        FILES: bindings.r2({ name: "cyber-strategy-native-preview" }),
        BUSINESS: bindings.durableObject({ worker: name, exportName: "StrategyBusiness" }),
        SOURCE_CATALOG_SHA256: bindings.text("blocked"),
        NATIVE_SCHEMA_SHA256: bindings.text("blocked"),
        BUSINESS_WRITES: bindings.text("blocked"),
        AUTH_WRITES: bindings.text("blocked"),
        CANARY_EVENT_KEY: bindings.text("blocked"),
        CANARY_STARTS_AT: bindings.text("blocked"), CANARY_EXPIRES_AT: bindings.text("blocked"),
        MIGRATION_CANARY_ACTOR_OPEN_ID: bindings.secret(),
        ORIGIN_HANDOVER: bindings.text("blocked"),
        SCOUT: bindings.worker({ worker: "cyber-scout-preview" }),
        STRATEGY_PREVIEW_MODE: bindings.text("preview-only"),
        STRATEGY_DATA_READY: bindings.text("blocked"),
        STRATEGY_INTEGRATIONS_READY: bindings.text("blocked"),
        APP_BASE_URL: bindings.text("https://strategy-cf.team8214.com"),
        // Explicit future preview contract, never the production Pit/Scout hosts.
        CYBER_PIT_ORIGIN: bindings.text("https://pit-cf.team8214.com"),
        CYBER_SCOUT_ORIGIN: bindings.text("https://scout-cf.team8214.com"),
        SESSION_SECRET: bindings.secret(),
        FEISHU_APP_ID: bindings.secret(),
        FEISHU_APP_SECRET: bindings.secret(),
        FEISHU_ALLOWED_TENANT_KEYS: bindings.secret(),
        CYBER_STRATEGY_EMBED_SECRET: bindings.secret(),
        SCOUT_STRATEGY_SECRET: bindings.secret(),
        FRC_EVENTS_USERNAME: bindings.secret(),
        FRC_EVENTS_API_KEY: bindings.secret(),
        TBA_API_KEY: bindings.secret(),
      },
    },
  };
});

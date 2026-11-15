import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode, isPreview }) => {
  if (mode !== "preview" || isPreview)
    throw new Error("Only the isolated preview mode is configured; no production or generated Preview deployment.");
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
      env: {
        ASSETS: bindings.assets(),
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
        SUPABASE_URL: bindings.secret(),
        SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
        CYBER_SCOUT_SUPABASE_URL: bindings.secret(),
        CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
        CYBER_STRATEGY_EMBED_SECRET: bindings.secret(),
        FRC_EVENTS_USERNAME: bindings.secret(),
        FRC_EVENTS_API_KEY: bindings.secret(),
        TBA_API_KEY: bindings.secret(),
        FEISHU_VIDEO_LIBRARY_NODE_TOKEN: bindings.secret(),
        FEISHU_VIDEO_LIBRARY_URL: bindings.secret(),
      },
    },
  };
});

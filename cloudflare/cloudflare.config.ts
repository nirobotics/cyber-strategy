import { bindings, defineConfig, exports, triggers } from "cf/config";

import { deploymentIdentity } from "./identity.ts";

export const identity = deploymentIdentity(process.env);

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
        DB: bindings.d1({ id: identity.databaseId, name: identity.databaseName }),
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

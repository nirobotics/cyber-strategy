import test from "node:test";
import assert from "node:assert/strict";
import config, { identity } from "../cloudflare.config.ts";
import { cleanEnv } from "../scripts/common.mjs";
import { secrets } from "../scripts/verify.mjs";

test("the production configuration serves strategy.team8214.com with logs on, its own D1/R2/Durable Object, the whole Scout Worker and nothing external", () => {
  const { accountId, worker } = config({ mode: "production", isPreview: false });
  assert.equal(accountId, "2ca8df5c9754fb7e3f37d08c597535e0"); assert.equal(worker.name, "cyber-strategy"); assert.equal(worker.entrypoint, "./worker.ts");
  assert.deepEqual(worker.triggers, [{ type: "fetch", pattern: "strategy.team8214.com/*", zone: "rockyxrq.com" }]);
  assert.deepEqual(worker.observability, { enabled: true });
  assert.equal(worker.workersDev, false); assert.equal(worker.previewUrls, false); assert.deepEqual(worker.domains, []);
  assert.deepEqual(worker.assets, { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: ["/*", "!/assets/*"] });
  assert.equal(identity.databaseId, "f31e6a3a-ec11-4ba6-9819-9b53983a40c0");
  assert.deepEqual(worker.env.DB, { type: "d1", id: identity.databaseId, name: "cyber-strategy-hk" });
  assert.deepEqual(worker.env.FILES, { type: "r2", name: "cyber-strategy" });
  assert.deepEqual(worker.env.BUSINESS, { type: "durable-object", worker: "cyber-strategy", exportName: "StrategyBusiness" });
  // The default entrypoint of the production Scout Worker: events, records, users, config, edits, assignments, photos.
  assert.deepEqual(worker.env.SCOUT, { type: "worker", worker: "cyber-scout" });
  assert.deepEqual(worker.env.APP_BASE_URL, { type: "text", value: "https://strategy.team8214.com" });
  assert.deepEqual(worker.env.CYBER_SCOUT_ORIGIN, { type: "text", value: "https://scout.team8214.com" });
  assert.deepEqual(worker.env.CYBER_PIT_ORIGIN, { type: "text", value: "https://pit.team8214.com" });
  assert.deepEqual(Object.entries(worker.env).filter(([, binding]) => binding.type === "secret").map(([name]) => name).sort(), [...secrets].sort());
  // No switch, flag or proof variable decides whether the Worker serves.
  assert.deepEqual(Object.entries(worker.env).filter(([, binding]) => binding.type === "text").map(([name]) => name).sort(), ["APP_BASE_URL", "CYBER_PIT_ORIGIN", "CYBER_SCOUT_ORIGIN"]);
  for (const mode of [undefined, "", "preview", "development"]) assert.throws(() => config({ mode, isPreview: false }), /production/);
  assert.throws(() => config({ mode: "production", isPreview: true }), /production/);
});
test("build tools run without credentials or .env values", () => {
  const env = cleanEnv();
  for (const key of ["SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "NODE_OPTIONS", "DOTENV_CONFIG_PATH"]) assert.equal(env[key], undefined);
});

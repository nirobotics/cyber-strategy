import test from "node:test";
import assert from "node:assert/strict";
import config, { identity } from "../cloudflare.config.ts";
import { deploymentIdentity } from "../identity.ts";
import { cleanEnv } from "../scripts/common.mjs";

test("the default template package uses isolated dry-run resources and needs explicit deploy settings", () => {
  const { worker } = config({ mode: "production", isPreview: false });
  assert.equal(worker.name, "cyber-strategy-template");
  assert.equal(worker.name, identity.name);
  assert.equal(worker.workersDev, false);
  assert.deepEqual(worker.env.DB, { type: "d1", id: identity.databaseId, name: "cyber-strategy-template" });
  assert.deepEqual(worker.env.FILES, { type: "r2", name: "cyber-strategy-template" });
  assert.equal(new URL(identity.origin).hostname, "strategy-template.example.invalid");
  assert.throws(() => deploymentIdentity({}, true), /Missing Cloudflare deployment settings/);
  assert.throws(() => deploymentIdentity({ CF_STRATEGY_ACCOUNT_ID: "example" }), /Missing Cloudflare deployment settings/);
});

test("build tools receive no deployment credentials or application secrets", () => {
  const env = cleanEnv();
  for (const key of ["SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDFLARE_API_TOKEN", "NODE_OPTIONS"]) assert.equal(env[key], undefined);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import config from "../cloudflare.config.ts";
import { checkSources, lock, repo, sidecar, original } from "../scripts/common.mjs";
import { verify } from "../scripts/verify.mjs";

const variables = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_CI_OVERRIDE_WORKER_NAME", "CLOUDFLARE_ENV", "WRANGLER_ENV", "CLOUDFLARE_ZONE_ID"];
function isolated(fn) {
  const prior = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  for (const name of variables) delete process.env[name];
  try { fn(); } finally {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
test("source contract pins original product, five-table schema, two HTTPS clients, styles and integration signatures", () => {
  checkSources();
  assert.equal(lock.base, "2282230eb02ec40208681968ab1617855fb18ece");
  assert.equal(lock.productVersion, "2026.1.77");
  assert.deepEqual(Object.entries(lock.files).filter(([, file]) => !file.preserve).map(([name]) => name).sort(), [".gitignore", "agent-logs/HANDOFF.md", "eslint.config.js", "tsconfig.json"].sort());
  for (const name of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "vercel.json", "react-router.config.ts", "vite.config.ts", "app/app.css"]) assert(lock.files[name].preserve);
  assert.equal(lock.css.bytes, 53251); assert.equal(lock.css.sha256, "ab90e2b0855e32eb4bcbae696f0318f37934006075445cdfc0013f0d5afb3e24");
  const sql = Object.keys(lock.files).filter((name) => name.startsWith("supabase/migrations/")).map((name) => original(name).toString()).join("\n");
  for (const table of ["profiles", "scouting_datasets", "audit_logs", "app_settings", "strategy_proposals"]) assert(sql.includes("public." + table));
  const embed = original("app/routes/embed.tsx").toString(); assert(embed.includes("frame-ancestors https://pit.team8214.com http://localhost:*"));
  assert(readFileSync(resolve(repo, "app/lib/cyber-scout.server.ts"), "utf8").includes('.storage.from("pit-photos").remove(photoPaths)'));
  assert(readFileSync(resolve(sidecar, "worker.ts"), "utf8").includes("frame-ancestors https://pit-cf.team8214.com"));
});
test("exact preview and formal standby identities have no routes, triggers, dev/preview URLs or secret values", () => isolated(() => {
  const value = config({ mode: "preview", isPreview: false });
  assert.equal(value.accountId, "2ca8df5c9754fb7e3f37d08c597535e0"); assert.equal(value.worker.name, "cyber-strategy-preview");
  assert.deepEqual(value.worker.domains, []); assert.deepEqual(value.worker.triggers, []);
  assert.equal(value.worker.workersDev, false); assert.equal(value.worker.previewUrls, false);
  const formal = config({ mode: "production", isPreview: false });
  assert.equal(formal.accountId, value.accountId); assert.equal(formal.worker.name, "cyber-strategy");
  assert.deepEqual(formal.worker.domains, []); assert.deepEqual(formal.worker.triggers, []);
  assert.equal(formal.worker.workersDev, false); assert.equal(formal.worker.previewUrls, false);
  assert.deepEqual(formal.worker.env.AUTH_WRITES, { type: "text", value: "blocked" });
  assert.deepEqual(formal.worker.env.BUSINESS_WRITES, { type: "text", value: "blocked" });
  assert.deepEqual(formal.worker.env.NATIVE_HANDOVER_GENERATION, { type: "text", value: "0" });
  assert.deepEqual(formal.worker.env.SCOUT, { type: "worker", worker: "cyber-scout", exportName: "ScoutPrivatePhoto" });
  assert.equal(formal.worker.env.DB.id, value.worker.env.DB.id); assert.equal(formal.worker.env.FILES.name, value.worker.env.FILES.name);
  assert.deepEqual(formal.worker.env.BUSINESS, { type: "durable-object", worker: "cyber-strategy", exportName: "StrategyBusiness" });
  for (const mode of [undefined, "", "development", "prod"]) assert.throws(() => config({ mode, isPreview: false }), /isolated preview/);
  for (const mode of ["preview", "production"]) assert.throws(() => config({ mode, isPreview: true }), /Generated Preview/);
}));
test("account/name/environment/zone override guards reject before build", () => isolated(() => {
  for (const name of variables) {
    process.env[name] = "not-authorized";
    assert.throws(() => config({ mode: "preview", isPreview: false }), /override/);
    assert.throws(() => config({ mode: "production", isPreview: false }), /override|routes/i);
    delete process.env[name];
  }
}));
test("entire final package, original public files and all browser assets obey frozen boundaries/hashes", () => verify());

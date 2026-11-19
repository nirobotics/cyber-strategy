// Checks the package produced by `cf deploy --dry-run --mode production` before it is deployed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { hash, json, output, sidecar, walk } from "./common.mjs";
import { identity } from "../cloudflare.config.ts";

export const secrets = ["SESSION_SECRET", "FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_ALLOWED_TENANT_KEYS", "CYBER_STRATEGY_EMBED_SECRET", "SCOUT_STRATEGY_SECRET", "FRC_EVENTS_USERNAME", "FRC_EVENTS_API_KEY", "TBA_API_KEY"];
export function verify() {
  assert.deepEqual(json(resolve(output, "v0/config.json")), { accountId: identity.accountId, buildContext: { isPreview: false, mode: "production" } });
  const dir = resolve(output, "v0/workers/default"), config = json(resolve(dir, "worker.config.json"));
  assert.equal(config.name, identity.name);
  assert.deepEqual(config.compatibilityFlags, ["nodejs_compat"]);
  assert.equal(config.workersDev, false); assert.equal(config.previewUrls, false); assert.deepEqual(config.domains, []);
  assert.deepEqual(config.triggers, [{ type: "fetch", pattern: "strategy.team8214.com/*", zone: identity.zone }]);
  assert.deepEqual(config.observability, { enabled: true });
  assert.deepEqual(config.assets, { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true });
  const texts = { APP_BASE_URL: identity.origin, CYBER_SCOUT_ORIGIN: identity.scout.origin, CYBER_PIT_ORIGIN: identity.pitOrigin };
  for (const [key, value] of Object.entries(texts)) assert.deepEqual(config.env[key], { type: "text", value });
  for (const key of secrets) assert.deepEqual(config.env[key], { type: "secret" });
  assert.deepEqual(config.env.ASSETS, { type: "assets" });
  assert.deepEqual(config.env.DB, { type: "d1", name: "cyber-strategy", id: identity.databaseId });
  assert.deepEqual(config.env.FILES, { type: "r2", name: identity.bucket });
  assert.deepEqual(config.env.BUSINESS, { type: "durable-object", worker: identity.name, exportName: "StrategyBusiness" });
  // The whole Scout API (events, records, users, config, edits, assignments, photos): the Scout Worker's default entrypoint.
  assert.deepEqual(config.env.SCOUT, { type: "worker", worker: "cyber-scout" });
  assert.deepEqual(config.exports, { StrategyBusiness: { type: "durable-object", storage: "sqlite" } });
  assert.deepEqual(Object.keys(config.env).sort(), ["ASSETS", "DB", "FILES", "BUSINESS", "SCOUT", ...secrets, ...Object.keys(texts)].sort(), "No other binding or variable is deployed");
  assert.deepEqual(config.manifest, { type: "complete", mainModule: "worker.js", modules: { "worker.js": { type: "esm" } } });
  // Browser assets: exactly what the build produced, nothing private, no server secrets or analytics.
  const assets = json(resolve(sidecar, ".required-tool-outputs/assets.json"));
  const packaged = walk(resolve(dir, "assets")).map((path) => "/" + relative(resolve(dir, "assets"), path));
  assert.deepEqual(packaged.sort(), Object.keys(assets).sort());
  for (const [name, record] of Object.entries(assets)) {
    assert(!name.split("/").some((part) => part.startsWith(".")) && !/\.map$|(?:^|\/)(?:private|tests?|supabase)(?:\/|$)/i.test(name), `Private file packaged: ${name}`);
    const bytes = readFileSync(resolve(dir, "assets", "." + name));
    assert.equal(hash(bytes), record.sha256, `Packaged asset differs from the build: ${name}`);
    if (name.endsWith(".js")) {
      const text = bytes.toString();
      assert(!/SCOUT_STRATEGY_SECRET|CYBER_STRATEGY_EMBED_SECRET|SUPABASE_SERVICE_ROLE_KEY|FEISHU_APP_SECRET|SESSION_SECRET|_vercel\/insights|va\.vercel-scripts/.test(text), `Server code or analytics in a browser asset: ${name}`);
      for (const match of text.matchAll(/["'](?:\.\/|\/assets\/)([\w.-]+\.(?:js|css|wasm))["']/g)) assert(assets["/assets/" + match[1]], `Missing browser dependency ${match[1]}`);
    }
  }
  assert.equal(Object.keys(assets).filter((name) => name.endsWith(".css")).length, 1);
  const bundle = readFileSync(resolve(dir, "bundle/worker.js"));
  assert(bundle.length > 100_000, "The Worker bundle does not contain the server-rendered app"); assert(gzipSync(bundle).length < 10 * 1024 * 1024);
  for (const marker of ["routes/api.cyber-pit-embed", "routes/auth.feishu.callback", "strategy_proposals", "/_scout/v1", "StrategyBusiness"])
    assert(bundle.includes(Buffer.from(marker)), `Missing from the Worker bundle: ${marker}`);
  console.log(`Verified ${config.name}: bundle ${bundle.length} bytes (gzip ${gzipSync(bundle).length}), ${packaged.length} assets, route ${config.triggers[0].pattern}`);
  return { config, dir, assets };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) verify();

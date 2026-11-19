import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { checkSources, hash, input, json, lock, current, output as previewOutput, sidecar, walk } from "./common.mjs";
import { nativePin, origin, sourcePin } from "../production/policy.ts";

export function verify(profile = "preview", output = previewOutput) {
  assert(["preview", "production"].includes(profile), "Unknown package profile");
  const production = profile === "production";
  const name = production ? "cyber-strategy" : "cyber-strategy-preview";
  checkSources();
  const root = json(resolve(output, "v0/config.json"));
  assert.deepEqual(root, { accountId: "2ca8df5c9754fb7e3f37d08c597535e0", buildContext: { isPreview: false, mode: profile } });
  const dir = resolve(output, "v0/workers/default"), config = json(resolve(dir, "worker.config.json"));
  const secrets = ["SESSION_SECRET", "FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_ALLOWED_TENANT_KEYS", "CYBER_STRATEGY_EMBED_SECRET", "FRC_EVENTS_USERNAME", "FRC_EVENTS_API_KEY", "TBA_API_KEY", "SCOUT_STRATEGY_SECRET"];
  if (!production) secrets.push("MIGRATION_CANARY_ACTOR_OPEN_ID");
  const texts = { SOURCE_CATALOG_SHA256: "blocked", NATIVE_SCHEMA_SHA256: "blocked", BUSINESS_WRITES: "blocked", AUTH_WRITES: "blocked", ORIGIN_HANDOVER: "blocked", STRATEGY_PREVIEW_MODE: "preview-only", STRATEGY_DATA_READY: "blocked", STRATEGY_INTEGRATIONS_READY: "blocked", APP_BASE_URL: "https://strategy-cf.team8214.com", CYBER_PIT_ORIGIN: "https://pit-cf.team8214.com", CYBER_SCOUT_ORIGIN: "https://scout-cf.team8214.com" };
  Object.assign(texts, { CANARY_EVENT_KEY: "blocked", CANARY_STARTS_AT: "blocked", CANARY_EXPIRES_AT: "blocked" });
  if (production) Object.assign(texts, { SOURCE_CATALOG_SHA256: sourcePin, NATIVE_SCHEMA_SHA256: nativePin, APP_BASE_URL: origin,
    CYBER_PIT_ORIGIN: "https://pit.team8214.com", CYBER_SCOUT_ORIGIN: "https://scout.team8214.com", STRATEGY_PREVIEW_MODE: "production-standby",
    STRATEGY_DATA_READY: "verified-native-data", STRATEGY_INTEGRATIONS_READY: "approved-formal-contract", NATIVE_HANDOVER_GENERATION: "0", EFFECTS_ENABLED: "false", GC_ENABLED: "false", JOBS_ENABLED: "false" });
  const scout = production ? { type: "worker", worker: "cyber-scout", exportName: "ScoutPrivatePhoto" } : { type: "worker", worker: "cyber-scout-preview" };
  const expectedEnv = { ASSETS: { type: "assets" }, DB: { type: "d1", name: "cyber-strategy-native-preview", id: "c8430ab1-0fbe-424f-b329-5395f8e037ed" }, FILES: { type: "r2", name: "cyber-strategy-native-preview" }, BUSINESS: { type: "durable-object", worker: name, exportName: "StrategyBusiness" }, SCOUT: scout, ...Object.fromEntries(secrets.map((key) => [key, { type: "secret" }])), ...Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, { type: "text", value }])) };
  assert.deepEqual(config, {
    name, compatibilityDate: "2026-11-15", compatibilityFlags: ["nodejs_compat"],
    assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
    domains: [], triggers: [], observability: { enabled: false }, workersDev: false, previewUrls: false,
    exports: { StrategyBusiness: { type: "durable-object", storage: "sqlite" } }, env: expectedEnv, manifest: { type: "complete", mainModule: "worker.js", modules: { "worker.js": { type: "esm" } } },
  });
  const build = json(resolve(sidecar, ".required-tool-outputs/build.json"));
  const baseline = json(resolve(sidecar, "release-contract.json"));
  const contract = json(resolve(sidecar, "native-release-contract.json"));
  assert.equal(contract.sourceReviewSha256, hash(readFileSync(resolve(sidecar, "source-review.json"))));
  assert.equal(contract.baselineContractSha256, hash(readFileSync(resolve(sidecar, "release-contract.json"))));
  assert.equal(contract.base, lock.base); assert.equal(baseline.sourceLockSha256, hash(readFileSync(resolve(sidecar, "source-lock.json"))));
  assert.deepEqual(build.assets, contract.assets, "Reviewed native all-asset contract (never refresh automatically)");
  for (const [path, expected] of Object.entries(build.serverFiles)) assert.equal(hash(readFileSync(resolve(input, path))), expected, `Server hash: ${path}`);
  const assetsDir = resolve(dir, "assets"), actualAssets = walk(assetsDir).map((path) => "/" + relative(assetsDir, path));
  assert.deepEqual(actualAssets.sort(), Object.keys(contract.assets).sort());
  for (const [name, record] of Object.entries(contract.assets)) {
    assert(/^\/(?:assets\/[\w.-]+\.(?:js|css)|[\w.-]+\.(?:png|webp))$/.test(name), `Forbidden asset path: ${name}`);
    const bytes = readFileSync(resolve(assetsDir, "." + name));
    assert.equal(hash(bytes), record.sha256, `Packaged asset hash: ${name}`); assert.equal(bytes.length, record.bytes);
    if (name.endsWith(".js")) {
      const text = bytes.toString();
      assert(!/SCOUT_STRATEGY_SECRET|SUPABASE_SERVICE_ROLE_KEY|CYBER_SCOUT_SUPABASE|CYBER_STRATEGY_EMBED_SECRET|FEISHU_APP_SECRET|SESSION_SECRET|_vercel\/insights|va\.vercel-scripts/.test(text), `Server/analytics leak: ${name}`);
      for (const match of text.matchAll(/["'](?:\.\/|\/assets\/)([\w.-]+\.(?:js|css))["']/g))
        assert(contract.assets["/assets/" + match[1]], `Missing browser dependency ${match[1]}`);
    }
  }
  const css = Object.entries(contract.assets).filter(([name]) => name.endsWith(".css"));
  assert.equal(css.length, 1); assert.equal(css[0][1].sha256, lock.css.sha256); assert.equal(css[0][1].bytes, lock.css.bytes);
  for (const [path, record] of Object.entries(lock.files).filter(([name]) => name.startsWith("public/")))
    assert.equal(contract.assets["/" + path.slice(7)]?.sha256, hash(current(path)), `Public asset: ${path}`);
  const bundle = readFileSync(resolve(dir, "bundle/worker.js"));
  assert(bundle.length > 500_000, "Not a full dynamic SSR bundle"); assert(gzipSync(bundle).length < 10 * 1024 * 1024);
  for (const route of ["api.auth.callback", "api.cyber-pit-embed", "api.cyber-scout.photos", "_app.scouting-record", "_app.scouting-lead", "_app.strategy-proposal", "_app.picklists", "api.match-videos"])
    assert(bundle.includes(Buffer.from(route)), `Missing business route: ${route}`);
  if (production) for (const marker of ["Formal standby:", sourcePin, nativePin]) assert(bundle.includes(Buffer.from(marker)), `Not the formal standby bundle: ${marker}`);
  assert(!/sourceMappingURL|\.build-input|\/home\/rocky-ubuntu/.test(bundle.toString()), "Unexpected source map/build/private path");
  const files = Object.fromEntries(walk(output).map((path) => [relative(output, path), { bytes: readFileSync(path).length, sha256: hash(readFileSync(path)) }]));
  assert.deepEqual(Object.keys(files).sort(), ["v0/config.json", "v0/workers/default/worker.config.json", "v0/workers/default/bundle/worker.js", ...actualAssets.map((path) => "v0/workers/default/assets" + path)].sort());
  if (output === previewOutput) writeFileSync(resolve(sidecar, production ? ".required-tool-outputs/production-package.json" : ".required-tool-outputs/package.json"), JSON.stringify({ files, bundleGzipBytes: gzipSync(bundle).length }, null, 2) + "\n");
  console.log(`Verified complete ${profile} package: ${Object.keys(files).length} files; bundle ${bundle.length} bytes / gzip ${gzipSync(bundle).length}; ${actualAssets.length} exact assets; CSS ${lock.css.sha256}`);
  return { config, dir, assets: contract.assets, files };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert(process.argv.length <= 4, "Expected optional package profile and output path");
  verify(process.argv[2], process.argv[3]);
}

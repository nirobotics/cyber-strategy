import test from "node:test";
import assert from "node:assert/strict";
import { setup, origin, tableNames, archivePath, archiveBytes } from "./native-fixture.mjs";

const count = async (db, table) => (await db.prepare(`SELECT count(*) n FROM ${table}`).first()).n;

test("production Worker is ready on the formal host with D1, and every stored row keeps its exact numbers", async (t) => {
  const r = await setup(t), ready = await r.fetch("/__ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { service: "cyber-strategy", ready: true, configured: true, missing: [], invalid: [], database: true, videoLibraryConfigured: true });
  for (const table of tableNames.filter((name) => name !== "strategy_proposals")) assert((await count(r.db, table)) > 0, table);
  const history = await r.db.prepare("SELECT row_json FROM audit_logs WHERE id='history-audit'").first();
  assert(history.row_json.includes('"raw_int64":9223372036854775807')); assert(history.row_json.includes('"raw_json_null":null')); assert(history.row_json.includes('"sql_null":null'));
  for (const sql of ["UPDATE audit_logs SET row_json='{}'", "DELETE FROM audit_logs"]) await assert.rejects(r.db.prepare(sql).run(), /append_only_audit/);
  // The archived video of the earlier feature stays attached and private: no route serves it.
  assert.deepEqual(new Uint8Array(await (await r.bucket.get(archivePath)).arrayBuffer()), archiveBytes);
  assert.equal((await r.fetch("/" + archivePath)).status, 404);
  assert.deepEqual(r.calls, []);
});

test("ordinary requests do not run the readiness query", async (t) => {
  const r = await setup(t);
  await r.db.prepare("ALTER TABLE app_settings RENAME TO app_settings_moved").run();
  assert.equal((await r.fetch("/__ready")).status, 503);
  assert.equal((await r.fetch("/auth/login")).status, 200);
  assert.equal((await r.fetch("/api/auth/login")).status, 302);
});

test("only the formal host is served; an external database binding or a development override makes the Worker refuse", async (t) => {
  const r = await setup(t);
  for (const url of ["https://strategy-cf.team8214.com/auth/login", "https://strategy.team8214.com.evil.invalid/auth/login", "https://strategy.team8214.com:444/auth/login", "http://strategy.team8214.com/auth/login", "https://localhost/auth/login"])
    assert.equal((await r.mf.dispatchFetch(url)).status, 421, url);
  for (const override of [{ SUPABASE_URL: "https://source.invalid" }, { CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY: "x" }, { DATABASE_URL: "x" }, { FEISHU_API_BASE: "https://feishu.invalid" }, { CYBER_SCOUT_ORIGIN: "http://scout.team8214.com" }]) {
    const broken = await setup(t, override);
    for (const path of ["/__ready", "/auth/login", "/"]) assert.equal((await broken.fetch(path)).status, 503, JSON.stringify(override) + path);
    assert.deepEqual(broken.calls, []);
  }
});

test("Strategy and Scout keep separate databases and buckets; Strategy reaches Scout data only through the Scout Worker", async (t) => {
  const r = await setup(t);
  await assert.rejects(r.db.prepare("SELECT * FROM scouting_records").all(), /no such table/);
  await assert.rejects(r.scoutDB.prepare("SELECT * FROM profiles").all(), /no such table/);
  assert.equal(await r.bucket.get("22222222-2222-4222-8222-222222222222/synthetic-pit/1.png"), null);
  assert.notEqual(await r.scoutBucket.get("22222222-2222-4222-8222-222222222222/synthetic-pit/1.png"), null);
});

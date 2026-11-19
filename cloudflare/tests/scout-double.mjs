// Starts the test double of the cyber-scout Worker (tests/scout-double.worker.mjs) and fills its database and bucket
// with synthetic records. Same exports as the fixture of the real cyber-scout package, so native-fixture.mjs can use
// either: the packaged cyber-scout when it is checked out next to this repository, this double otherwise (CI).
import { resolve } from "node:path";
import { sidecar } from "../scripts/common.mjs";

export const stamp = "2026-01-01T00:00:00.123456Z", eventId = "22222222-2222-4222-8222-222222222222";
export const adminId = "11111111-1111-4111-8111-111111111111", memberId = "11111111-1111-4111-8111-111111111112";
export const normalId = "33333333-3333-4333-8333-333333333331", superId = "33333333-3333-4333-8333-333333333332", pitId = "33333333-3333-4333-8333-333333333333";
export const photoPath = `${eventId}/synthetic-pit/1.png`, photoBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
export const eventConfig = { tbaEventKey: "2026test", eventName: "Synthetic Regional", teams: [8214, 6328, 157, 1, 2, 3], matches: [{ id: "2026test_qm1", matchType: "qm", matchNumber: 1, source: "manual", teams: { R1: 8214, R2: 6328, R3: 157, B1: 1, B2: 2, B3: 3 } }], assignments: [], savedAt: stamp };
// Stands in for SCOUT_STRATEGY_SECRET on both Workers. Not a credential.
export const pairSecret = "synthetic-local-scout-strategy-pair-secret-only";

const schema = [
  ...["user_profiles", "scouting_events", "scouting_records", "app_settings"].map((table) => `CREATE TABLE ${table} (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)))`),
  "CREATE TABLE native_objects (path TEXT PRIMARY KEY NOT NULL, r2_key TEXT UNIQUE NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)))",
  "CREATE TABLE native_object_gc (r2_key TEXT PRIMARY KEY NOT NULL)",
];
export function fixture() {
  const record = { event_id: eventId, match_type: "qm", match_number: 1, alliance: "red", position: "R1", team_number: 8214, device_id: "synthetic-device", client_created_at: stamp, uploaded_at: stamp, uploaded_by: memberId, created_at: stamp, created_by: null };
  return {
    user_profiles: [
      { id: adminId, feishu_open_id: "synthetic-admin", display_name: "Synthetic Admin", avatar_url: null, is_admin: true, last_login_at: null, created_at: stamp, updated_at: stamp },
      { id: memberId, feishu_open_id: "synthetic-member", display_name: "Synthetic Scout", avatar_url: null, is_admin: false, last_login_at: null, created_at: stamp, updated_at: stamp },
    ],
    scouting_events: [{ id: eventId, tba_event_key: "2026test", name: eventConfig.eventName, is_active: true, config_version: 1, created_by: null, updated_by: adminId, created_at: stamp, updated_at: stamp }],
    scouting_records: [
      { ...record, id: normalId, client_record_id: "normal-synthetic", record_type: "normal_match", checksum: "normal-hash", payload: { scout: "Synthetic Scout", teamNumber: 8214, matchType: "qm", matchNumber: 1, manualShotDirect: [{ startMs: 0, endMs: 10000 }], manualZoneEvents: [{ zone: "联盟", atMs: 0 }] } },
      { ...record, id: superId, client_record_id: "super-synthetic", record_type: "super_match", checksum: "super-hash", payload: { scout: "Synthetic Scout", matchType: "qm", matchNumber: 1, alliance: "red", teams: [8214, 6328, 157], auto: [10, 20, 30], drive: [5, 3, 2], defense: [4, 2, 1], bps: [10, 5, 3], accuracy: [80, 60, 40], comments: ["Synthetic runtime record", "", ""] } },
      { ...record, id: pitId, client_record_id: "pit-synthetic", record_type: "pit", checksum: "pit-hash", payload: { scout: "Synthetic Scout", teamNumber: 8214, photoPaths: [photoPath], photoCount: 1, drivetrain: "Synthetic Swerve", comments: "nonempty-private-record" } },
    ],
    app_settings: [{ key: "event_config", config: eventConfig, updated_at: stamp, updated_by: adminId }],
  };
}
export async function seed(db, bucket, data = fixture()) {
  for (const sql of schema) await db.prepare(sql).run();
  const statements = Object.entries(data).flatMap(([table, rows]) => rows.map((row) => db.prepare(`INSERT INTO ${table}(id,row_json) VALUES(?,?)`).bind(row.id ?? row.key, JSON.stringify(row))));
  statements.push(db.prepare("INSERT INTO native_objects(path,r2_key,metadata_json) VALUES(?,?,?)").bind(photoPath, photoPath, JSON.stringify({ size: String(photoBytes.length), contentType: "image/png" })));
  await db.batch(statements);
  await bucket.put(photoPath, photoBytes, { httpMetadata: { contentType: "image/png" } });
  return data;
}
export function env(overrides = {}) { return { SCOUT_STRATEGY_SECRET: pairSecret, ...overrides }; }
export function workerOptions(bindings = env(), outboundService) {
  return { name: "scout", routes: ["scout.team8214.com/*"], modules: true, modulesRoot: resolve(sidecar, "tests"), scriptPath: resolve(sidecar, "tests/scout-double.worker.mjs"),
    compatibilityDate: "2026-11-15", compatibilityFlags: ["nodejs_compat"], bindings, outboundService,
    d1Databases: { DB: "scout-double-synthetic" }, r2Buckets: { FILES: "scout-double-synthetic" } };
}

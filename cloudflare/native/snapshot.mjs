import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const application = "cyber-strategy";
export const sourceRef = "gxsxtwcbmfpdpcrpfdhk";
export const tableNames = ["profiles", "scouting_datasets", "app_settings", "strategy_proposals", "audit_logs", "matches", "match_videos", "match_markings", "match_notes", "match_score_samples", "video_processing_jobs"];
export const bucketName = "match-videos";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
/** No connections, credentials, external writes, implicit seed, or catalog pin refresh.
 * Parent exports in one READ ONLY REPEATABLE READ snapshot. Every source cell is
 * to_json(column)::text, kept as a RAW JSON string, or JS null for SQL NULL.
 * timestamptz is explicitly UTC YYYY-MM-DDTHH:mm:ss.ffffffZ. Catalog includes ALL
 * columns/types/defaults/constraints/FKs/indexes/triggers/routines/ACL/RLS and storage
 * policies. Parent must review and pin exact catalog BYTES before import is allowed.
 */
export function validateSnapshot(snapshot, reviewedSchemaPin) {
  assert.equal(snapshot.format, "native-source-snapshot-v1");
  assert.equal(snapshot.application, application); assert.equal(snapshot.sourceRef, sourceRef);
  assert(["actual-source", "synthetic-local"].includes(snapshot.provenance));
  assert(hashPattern.test(reviewedSchemaPin), "A reviewed exact schema pin is mandatory (shape inventory is NOT a catalog)");
  assert.equal(sha256(snapshot.catalogRaw), reviewedSchemaPin, "Source catalog changed: review, never refresh to pass");
  const catalog = JSON.parse(snapshot.catalogRaw);
  assert.equal(catalog.application, application); assert.equal(catalog.sourceRef, sourceRef);
  validateRuntimeCatalog(catalog);
  assert.deepEqual(Object.keys(catalog.tables).sort(), [...tableNames].sort());
  assert.deepEqual(Object.keys(snapshot.tables).sort(), [...tableNames].sort());
  assert(/Z$/.test(snapshot.snapshotAt));
  let count = 0;
  for (const table of tableNames) {
    const spec = catalog.tables[table];
    assert(Array.isArray(spec.columns) && spec.columns.length > 0 && Array.isArray(spec.primaryKey) && spec.primaryKey.length > 0, `Full columns/PK required: ${table}`);
    const names = spec.columns.map((col) => col.name);
    assert.equal(new Set(names).size, names.length);
    for (const key of spec.primaryKey) assert(names.includes(key));
    const ids = new Set();
    for (const row of snapshot.tables[table]) {
      assert.equal(typeof row.key, "string"); assert(!ids.has(row.key)); ids.add(row.key);
      assert.equal(row.cells.length, spec.columns.length);
      for (const [index, raw] of row.cells.entries()) {
        if (raw === null) { assert(!spec.columns[index].notNull, `NULL ${table}.${names[index]}`); continue; }
        assert.equal(typeof raw, "string"); JSON.parse(raw); // Validation only; never stringify parsed numeric/JSON values.
        if (spec.columns[index].type === "timestamp with time zone") assert(/^"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z"$/.test(raw), "UTC microseconds required");
      }
      assert.equal(row.key, primaryKey(spec, row.cells));
      count++;
    }
  }
  assert(count > 0, "Empty data is never ready");
  assert.equal(snapshot.objects.bucket, bucketName);
  const paths = new Set();
  for (const item of snapshot.objects.inventory) {
    assert.equal(typeof item.path, "string"); assert(item.path.length && !paths.has(item.path)); paths.add(item.path);
    assert(hashPattern.test(item.sha256)); assert(/^\d+$/.test(item.size));
    assert.equal(typeof item.metadataRaw, "string"); JSON.parse(item.metadataRaw);
  }
  return { catalog, rowCount: count, schemaPin: reviewedSchemaPin };
}
export function primaryKey(spec, cells) {
  const keys = spec.primaryKey.map((key) => cells[spec.columns.findIndex((col) => col.name === key)]);
  assert(keys.every((key) => key !== null));
  if (keys.length === 1) return keys[0].startsWith('"') ? JSON.parse(keys[0]) : keys[0];
  return `[${keys.join(",")}]`;
}
export function rowJSON(spec, cells) { return `{${spec.columns.map((col, i) => `${JSON.stringify(col.name)}:${cells[i] === null ? "null" : cells[i]}`).join(",")}}`; }
export function snapshotHashes(snapshot, pin) {
  validateSnapshot(snapshot, pin);
  const rows = tableNames.map((table) => [table, [...snapshot.tables[table]].sort((a, b) => a.key.localeCompare(b.key)).map((row) => [row.key, row.cells])]);
  const objects = [...snapshot.objects.inventory].sort((a, b) => a.path.localeCompare(b.path));
  return { data: sha256(JSON.stringify(rows)), objects: sha256(JSON.stringify(objects)), schema: pin };
}
/** Parameterized local import plan. Caller owns staging DB/R2, encryption and chunking.
 * The target remains gated through ALL chunks. Never seal before complete readback.
 */
export function importPlan(snapshot, pin) {
  const { catalog } = validateSnapshot(snapshot, pin), plan = [];
  plan.push({ sql: "INSERT INTO native_catalog(id,catalog_json,schema_sha256) VALUES('source',?,?)", values: [snapshot.catalogRaw, pin] });
  for (const table of tableNames) for (const row of snapshot.tables[table]) {
    plan.push({ sql: `INSERT INTO ${table}(id,row_json) VALUES(?,?)`, values: [row.key, rowJSON(catalog.tables[table], row.cells)] });
    plan.push({ sql: "INSERT INTO native_import_rows(table_name,source_key,cells_json) VALUES(?,?,?)", values: [table, row.key, JSON.stringify(row.cells)] });
  }
  for (const item of snapshot.objects.inventory) plan.push({ sql: "INSERT INTO native_objects(path,r2_key,metadata_json) VALUES(?,?,?)", values: [item.path, item.path, JSON.stringify({ sourceMetadataRaw: item.metadataRaw, size: item.size, sha256: item.sha256, contentType: item.contentType })] });
  return plan;
}
export async function readback(db, bucket, snapshot, pin) {
  const { catalog, rowCount } = validateSnapshot(snapshot, pin), hashes = snapshotHashes(snapshot, pin);
  assert.equal((await db.prepare("SELECT catalog_json FROM native_catalog WHERE id='source'").first()).catalog_json, snapshot.catalogRaw);
  for (const table of tableNames) {
    const { results } = await db.prepare(`SELECT id,row_json FROM ${table} ORDER BY id`).all();
    assert.equal(results.length, snapshot.tables[table].length, `Count ${table}`);
    const expected = new Map(snapshot.tables[table].map((row) => [row.key, rowJSON(catalog.tables[table], row.cells)]));
    for (const row of results) assert.equal(row.row_json, expected.get(row.id), `Every column/raw number/NULL: ${table}`);
    const archived = await db.prepare("SELECT source_key,cells_json FROM native_import_rows WHERE table_name=? ORDER BY source_key").bind(table).all();
    assert.equal(archived.results.length, results.length);
    const cells = new Map(snapshot.tables[table].map((row) => [row.key, JSON.stringify(row.cells)]));
    for (const row of archived.results) assert.equal(row.cells_json, cells.get(row.source_key), `SQL NULL versus JSON null archive ${table}`);
  }
  const fk = await db.prepare("PRAGMA foreign_key_check").all(); assert.equal(fk.results.length, 0);
  const inventory = await db.prepare("SELECT path,r2_key,metadata_json FROM native_objects ORDER BY path").all();
  assert.equal(inventory.results.length, snapshot.objects.inventory.length);
  for (const item of snapshot.objects.inventory) {
    const stored = inventory.results.find((row) => row.path === item.path); assert(stored);
    const meta = JSON.parse(stored.metadata_json); assert.equal(meta.sourceMetadataRaw, item.metadataRaw);
    const object = await bucket.get(stored.r2_key); assert(object, "Missing private bytes");
    const digest = createHash("sha256"); let bytes = 0n;
    for await (const chunk of object.body) { digest.update(chunk); bytes += BigInt(chunk.byteLength); }
    assert.equal(String(bytes), item.size); assert.equal(digest.digest("hex"), item.sha256);
  }
  const actualKeys = []; let cursor;
  do {
    const page = await bucket.list({ ...(cursor ? { cursor } : {}), limit: 1000 });
    actualKeys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  assert.deepEqual(actualKeys.sort(), snapshot.objects.inventory.map((item) => item.path).sort(), "Exact private object inventory (no missing or unreviewed/orphan objects)");
  return { hashes, rowCount, tableCount: tableNames.length, objectCount: snapshot.objects.inventory.length, snapshotAt: snapshot.snapshotAt };
}
export async function sealVerified(db, bucket, snapshot, pin, { localSynthetic = false } = {}) {
  assert(snapshot.provenance === "actual-source" || localSynthetic, "Synthetic fixtures are LOCAL ONLY, never cloud acceptance");
  const proof = await readback(db, bucket, snapshot, pin);
  await db.prepare("INSERT INTO native_seal(id,schema_sha256,data_sha256,object_sha256,source_snapshot,table_count,row_count,object_count,provenance) VALUES('verified',?,?,?,?,?,?,?,?)").bind(pin, proof.hashes.data, proof.hashes.objects, snapshot.snapshotAt, proof.tableCount, proof.rowCount, proof.objectCount, snapshot.provenance).run();
  return proof;
}

/** PURE source export contract: returns READ ONLY SQL, never opens a connection.
 * Run begin + every table query + storage inventory in ONE source snapshot.
 * Preserve cells_json as text/JSON strings; do not parse numeric/JSON cells.
 */
export function exportQueries(catalogRaw, reviewedSchemaPin) {
  assert(hashPattern.test(reviewedSchemaPin)); assert.equal(sha256(catalogRaw), reviewedSchemaPin);
  const catalog = JSON.parse(catalogRaw);
  assert.equal(catalog.application, application); assert.equal(catalog.sourceRef, sourceRef);
  validateRuntimeCatalog(catalog);
  assert.deepEqual(Object.keys(catalog.tables).sort(), [...tableNames].sort());
  const ident = (name) => '"' + name.replaceAll('"', '""') + '"';
  const tables = tableNames.map((table) => {
    const spec = catalog.tables[table]; assert(spec.columns.length && spec.primaryKey.length);
    const columns = spec.columns.map((column) => {
      const name = ident(column.name);
      const value = column.type === "timestamp with time zone"
        ? `to_json(to_char(${name} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text`
        : `to_json(${name})::text`;
      return `CASE WHEN ${name} IS NULL THEN NULL ELSE ${value} END`;
    });
    return { table, sql: `SELECT json_build_array(${columns.join(",")})::text AS cells_json FROM public.${ident(table)} ORDER BY ${spec.primaryKey.map(ident).join(",")}` };
  });
  return {
    begin: ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL TIME ZONE 'UTC'", "SELECT pg_export_snapshot() AS snapshot_id, clock_timestamp() AS snapshot_at"],
    tables,
    storageInventory: "SELECT to_jsonb(o)::text AS metadata_json FROM storage.objects o WHERE bucket_id=$1 ORDER BY name,id",
    storageInventoryParameters: [bucketName],
    end: "COMMIT",
  };
}

export const runtimeColumns = {
  "profiles": [
    "open_id",
    "name",
    "avatar_url",
    "is_admin",
    "created_at"
  ],
  "scouting_datasets": [
    "id",
    "title",
    "event_key",
    "source_filename",
    "team_data",
    "team_photos",
    "is_active",
    "created_by",
    "created_at",
    "updated_at"
  ],
  "app_settings": [
    "key",
    "value",
    "updated_by",
    "updated_at"
  ],
  "strategy_proposals": [
    "id",
    "event_key",
    "match_key",
    "match_label",
    "own_team",
    "proposal_type",
    "status",
    "title",
    "payload",
    "created_by",
    "reviewed_by",
    "review_note",
    "submitted_at",
    "reviewed_at",
    "last_approved_snapshot",
    "created_at",
    "updated_at"
  ],
  "audit_logs": [
    "id",
    "actor_open_id",
    "action",
    "changed_fields",
    "created_at"
  ]
};
export function validateRuntimeCatalog(catalog) {
  for (const [table, columns] of Object.entries(runtimeColumns)) {
    const spec = catalog.tables[table]; assert(spec, `Missing runtime table ${table}`);
    const primaryKey = table === "app_settings" ? "key" : table === "profiles" ? "open_id" : "id";
    assert.deepEqual(spec.primaryKey, [primaryKey], `Source PK drift requires repository review: ${table}`);
    for (const column of columns) assert(spec.columns.some((entry) => entry.name === column), `Source column drift requires repository review: ${table}.${column}`);
  }
}

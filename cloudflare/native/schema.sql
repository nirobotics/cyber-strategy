-- Native row envelopes preserve every source column and raw JSON numeric lexeme.
-- id is the canonical source primary key; app_settings uses key. No seed or readiness row.
PRAGMA foreign_keys=ON;
CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE scouting_datasets (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE app_settings (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE strategy_proposals (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE audit_logs (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE matches (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE match_videos (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE match_markings (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE match_notes (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE match_score_samples (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE TABLE video_processing_jobs (id TEXT PRIMARY KEY NOT NULL, row_json TEXT NOT NULL CHECK(json_valid(row_json)));
CREATE UNIQUE INDEX profiles_open_id ON profiles(json_extract(row_json,'$.open_id'));
CREATE INDEX datasets_event ON scouting_datasets(json_extract(row_json,'$.event_key'),json_extract(row_json,'$.updated_at'));
CREATE INDEX proposals_event ON strategy_proposals(json_extract(row_json,'$.event_key'),json_extract(row_json,'$.updated_at'));
CREATE UNIQUE INDEX personal_picklist_client ON app_settings(json_extract(row_json,'$.value.eventKey'),json_extract(row_json,'$.value.createdBy'),json_extract(row_json,'$.value.clientId')) WHERE json_extract(row_json,'$.value.kind')='personal';
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'append_only_audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'append_only_audit'); END;
CREATE TABLE native_catalog (id TEXT PRIMARY KEY CHECK(id='source'), catalog_json TEXT NOT NULL, schema_sha256 TEXT NOT NULL);
CREATE TABLE native_import_rows (table_name TEXT NOT NULL, source_key TEXT NOT NULL, cells_json TEXT NOT NULL, PRIMARY KEY(table_name,source_key));
CREATE TABLE native_objects (path TEXT PRIMARY KEY NOT NULL, r2_key TEXT UNIQUE NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)));
CREATE TABLE native_object_gc (r2_key TEXT PRIMARY KEY NOT NULL);
CREATE TABLE native_seal (id TEXT PRIMARY KEY CHECK(id='verified'), schema_sha256 TEXT NOT NULL, data_sha256 TEXT NOT NULL, object_sha256 TEXT NOT NULL, source_snapshot TEXT NOT NULL, table_count INTEGER NOT NULL, row_count INTEGER NOT NULL CHECK(row_count>0), object_count INTEGER NOT NULL CHECK(object_count>=0), provenance TEXT NOT NULL CHECK(provenance IN ('actual-source','synthetic-local')));
CREATE TABLE native_oauth_states (id TEXT PRIMARY KEY NOT NULL, expires_ms INTEGER NOT NULL, used INTEGER NOT NULL CHECK(used IN (0,1)));

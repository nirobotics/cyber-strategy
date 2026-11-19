-- One row per record: id is the primary key of the original table (app_settings: key; profiles: open_id),
-- row_json holds every original column, with numbers kept exactly as the original database printed them.
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
CREATE TABLE native_objects (path TEXT PRIMARY KEY NOT NULL, r2_key TEXT UNIQUE NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)));
CREATE TABLE native_oauth_states (id TEXT PRIMARY KEY NOT NULL, expires_ms INTEGER NOT NULL, used INTEGER NOT NULL CHECK(used IN (0,1)));

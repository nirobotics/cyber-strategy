import test from "node:test";
import assert from "node:assert/strict";
import { setup, fixture } from "./native-fixture.mjs";
import { readback, importPlan, sealVerified } from "../native/snapshot.mjs";

test("actual workerd/D1/R2: all eleven source tables and private historical video have exact raw-cell readback",async(t)=>{
 const r=await setup(t),source=fixture();const proof=await readback(r.db,r.bucket,source.snapshot,source.pin);assert.equal(proof.tableCount,11);assert(proof.rowCount>11);assert.equal(proof.objectCount,1);assert.equal((await r.fetch("/__ready")).status,200);
 for(const table of["matches","match_videos","match_markings","match_notes","match_score_samples","video_processing_jobs"])assert.equal((await r.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,1);
 const row=await r.db.prepare("SELECT row_json FROM audit_logs WHERE id='history-audit'").first();assert(row.row_json.includes('"raw_int64":9223372036854775807'));assert(row.row_json.includes('"raw_json_null":null'));assert(row.row_json.includes('"sql_null":null'));
 const raw=await r.db.prepare("SELECT cells_json FROM native_import_rows WHERE table_name='audit_logs'").first();assert(JSON.parse(raw.cells_json).includes("null"));assert(JSON.parse(raw.cells_json).includes(null));
 for(const sql of["UPDATE audit_logs SET row_json='{}'","DELETE FROM audit_logs"])await assert.rejects(r.db.prepare(sql).run(),/append_only_audit/);
});
test("no source schema drift, absent history, empty seed or unverified private bytes can be sealed",async(t)=>{
 const r=await setup(t),source=fixture(),drift=structuredClone(source.snapshot);drift.catalogRaw+=" ";assert.throws(()=>importPlan(drift,source.pin),/catalog changed/);const missing=structuredClone(source.snapshot);delete missing.tables.matches;assert.throws(()=>importPlan(missing,source.pin));
 await r.db.prepare("DELETE FROM native_seal").run();await r.bucket.put("historical/synthetic.mp4",new Uint8Array([0]));await assert.rejects(sealVerified(r.db,r.bucket,source.snapshot,source.pin,{localSynthetic:true}));assert.equal((await r.db.prepare("SELECT count(*) n FROM native_seal").first()).n,0);
});
test("physical app independence: Strategy bindings cannot see Scout records or objects, both default gates stay closed",async(t)=>{
 const r=await setup(t);await assert.rejects(r.db.prepare("SELECT * FROM scouting_records").all(),/no such table/);await assert.rejects(r.scoutDB.prepare("SELECT * FROM profiles").all(),/no such table/);assert.equal(await r.bucket.get("not-a-strategy-photo"),null);const before=(await r.scoutDB.prepare("SELECT count(*) n FROM scouting_records").first()).n;await r.db.prepare("INSERT INTO app_settings(id,row_json) VALUES('independence','{\"key\":\"independence\",\"value\":1}')").run();assert.equal((await r.scoutDB.prepare("SELECT count(*) n FROM scouting_records").first()).n,before);
});

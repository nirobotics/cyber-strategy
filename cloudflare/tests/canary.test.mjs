import test from "node:test";
import assert from "node:assert/strict";
import { setup, fixture, origin, photoPath, photoBytes, normalId } from "./native-fixture.mjs";
import { createCipheriv, createHash } from "node:crypto";
const event="2026cfmigrationacceptance", marker="SYNTHETIC_MIGRATION_CANARY", id="2bc56a47-e09d-45db-8f18-ecf91fca0001",foreignId="3bc56a47-e09d-45db-8f18-ecf91fca0001";
const utc=(ms)=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,"Z");
const config=(extra={})=>({BUSINESS_WRITES:"controlled-canary",AUTH_WRITES:"enabled",MIGRATION_CANARY_ACTOR_OPEN_ID:"synthetic-admin",CANARY_EVENT_KEY:event,CANARY_STARTS_AT:utc(Date.now()-60_000),CANARY_EXPIRES_AT:utc(Date.now()+3_600_000),...extra});
async function login(r,code="admin") {const start=await r.fetch("/api/auth/login"),state=new URL(start.headers.get("location")).searchParams.get("state"),cookie=start.headers.get("set-cookie").split(";")[0];const response=await r.fetch("/auth/feishu/callback?"+new URLSearchParams({code,state}),{headers:{Cookie:cookie}});assert.equal(response.status,302);assert(response.headers.get("set-cookie"));return response.headers.get("set-cookie").split(";")[0];}
function form(cookie,values={}) {return {method:"POST",headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({intent:"save",eventKey:event,matchKey:event+"_qm1",matchLabel:"CANARY Q1",ownTeam:"8214",proposalType:"auto",payload:JSON.stringify({note:marker}),...values}).toString()};}
function action(cookie,intent,more={}) {return {method:"POST",headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({intent,eventKey:event,id,...more}).toString()};}
async function snapshot(db) {const out={};for(const table of Object.keys(fixture().snapshot.tables))out[table]=(await db.prepare(`SELECT id,row_json FROM ${table} ORDER BY id`).all()).results;for(const table of["native_catalog","native_seal","native_import_rows","native_objects","native_object_gc"])out[table]=(await db.prepare(`SELECT * FROM ${table} ORDER BY 1${table === "native_import_rows" ? ",2" : ""}`).all()).results;return out;}
async function unchanged(db,before) {const after=await snapshot(db);for(const[table,rows]of Object.entries(before))for(const row of rows)assert.deepEqual(after[table].find(r=>table==="native_import_rows"?r.table_name===row.table_name&&r.source_key===row.source_key:(r.id??r.path??r.r2_key)===(row.id??row.path??row.r2_key)),row,table);}
async function proposal(r) {const row=await r.db.prepare("SELECT row_json FROM strategy_proposals WHERE id=?").bind(id).first();return row?JSON.parse(row.row_json):null;}
async function seedForeign(r,key=foreignId) {await r.db.prepare("INSERT INTO strategy_proposals(id,row_json) VALUES(?,?)").bind(key,JSON.stringify({id:key,event_key:"2026history",match_key:"2026history_qm1",match_label:"Q1",proposal_type:"auto",status:"draft",created_by:"synthetic-admin",payload:{note:"history"},raw_int64:"9223372036854775807"})).run();}

test("controlled Strategy: official synthetic OAuth, bounded create/update/submit/review/restore/reject/delete and unchanged historical D1/R2/Scout/seals",async(t)=>{
 const r=await setup(t,config()),cookie=await login(r);await seedForeign(r);const before=await snapshot(r.db),scoutBefore=(await r.scoutDB.prepare("SELECT * FROM scouting_records ORDER BY id").all()).results,calls=r.calls.length;
 let response=await r.fetch("/strategy-proposal",form(cookie));assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{ok:true,proposalId:id});assert.equal((await proposal(r)).status,"draft");
 assert.equal((await r.fetch("/strategy-proposal",form(cookie))).status,409,"Create replay cannot allocate unbounded new proposals");
 assert.equal((await r.fetch("/strategy-proposal",action(cookie,"review",{decision:"approved",reviewNote:marker}))).status,403,"Original state-machine error must not become HTTP 200");
 assert.equal((await r.fetch("/strategy-proposal",form(cookie,{id,intent:"submit"}))).status,200);assert.equal((await proposal(r)).status,"submitted");
 assert.equal((await r.fetch("/strategy-proposal",action(cookie,"review",{decision:"approved",reviewNote:marker}))).status,200);const approved=await proposal(r);assert.equal(approved.status,"approved");assert.equal(approved.last_approved_snapshot.payload.note,marker);
 assert.equal((await r.fetch("/strategy-proposal",form(cookie,{id,intent:"submit",payload:JSON.stringify({note:marker+"_EDIT"})}))).status,200);assert.equal((await proposal(r)).status,"submitted");
 assert.equal((await r.fetch("/strategy-proposal",action(cookie,"restore"))).status,200);assert.equal((await proposal(r)).status,"approved");assert.equal((await proposal(r)).payload.note,marker);
 await r.fetch("/strategy-proposal",form(cookie,{id,intent:"submit"}));assert.equal((await r.fetch("/strategy-proposal",action(cookie,"review",{decision:"rejected",reviewNote:marker}))).status,200);assert.equal((await proposal(r)).status,"rejected");
 assert.equal((await r.fetch("/strategy-proposal",action(cookie,"delete"))).status,200);assert.equal(await proposal(r),null);
 await unchanged(r.db,before);assert.deepEqual((await r.scoutDB.prepare("SELECT * FROM scouting_records ORDER BY id").all()).results,scoutBefore);
 assert.deepEqual(new Uint8Array(await(await r.bucket.get("historical/synthetic.mp4")).arrayBuffer()),fixture().bytes);assert.deepEqual(new Uint8Array(await(await r.scoutBucket.get(photoPath)).arrayBuffer()),photoBytes);assert.equal(r.calls.length,calls,"Canary business flow must not call integrations");
});

test("controlled Strategy: real admin lookup, exact actor, signed session, same-origin CSRF, foreign IDs, body/field boundaries and all other write surfaces denied",async(t)=>{
 const r=await setup(t,config()),cookie=await login(r),member=await login(r,"member");await seedForeign(r);const before=await snapshot(r.db),calls=r.calls.length;
 for(const c of["",member,cookie+"tampered"])assert.equal((await r.fetch("/strategy-proposal",form(c))).status,403);
 for(const headers of[{Origin:""},{Origin:"https://evil.invalid"},{"Sec-Fetch-Site":"cross-site"},{"Sec-Fetch-Site":"same-site"}]){const req=form(cookie);Object.assign(req.headers,headers);assert.equal((await r.fetch("/strategy-proposal",req)).status,403);}
 // A correctly encrypted but expired synthetic session is still inadmissible.
 const iv=Buffer.alloc(12,7),cipher=createCipheriv("aes-256-gcm",createHash("sha256").update(r.bindings.SESSION_SECRET).digest(),iv),bytes=Buffer.concat([cipher.update(JSON.stringify({user:{id:"synthetic-admin",feishuOpenId:"synthetic-admin",displayName:"Synthetic Admin",avatarUrl:null},exp:1})),cipher.final()]);
 const expired="strategy_session="+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString("base64url");assert.equal((await r.fetch("/strategy-proposal",form(expired))).status,403);
 for(const values of[{eventKey:"2026history"},{id:foreignId},{matchKey:"2026history_qm1"},{payload:'{"note":"ordinary business"}'},{proposalType:"self_strategy"},{extra:"SQL"}])assert((await r.fetch("/strategy-proposal",form(cookie,values))).status>=400);
 for(const intent of["review","restore","delete"])assert.equal((await r.fetch("/strategy-proposal",action(cookie,intent,{id:foreignId}))).status,403);
 for(const path of["/admin","/picklists","/scouting-record","/scouting-lead","/api/cyber-pit-embed","/strategy-proposal.data"])assert((await r.fetch(path,form(cookie))).status>=400,path);
 assert.equal((await r.fetch("/strategy-proposal?event="+event,form(cookie))).status,403);
 const huge=form(cookie);huge.body="x".repeat(8193);assert.equal((await r.fetch("/strategy-proposal",huge)).status,413);
 const streamed=form(cookie);streamed.body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("x".repeat(8193)));c.close();}});streamed.duplex="half";assert.equal((await r.fetch("/strategy-proposal",streamed)).status,413);
 const multipart=form(cookie);multipart.headers["Content-Type"]="multipart/form-data; boundary=x";assert.equal((await r.fetch("/strategy-proposal",multipart)).status,415);
 const duplicate=form(cookie);duplicate.body+="&eventKey="+event;assert.equal((await r.fetch("/strategy-proposal",duplicate)).status,400);
 assert.deepEqual(await snapshot(r.db),before);assert.equal(r.calls.length,calls);assert(await r.scoutDB.prepare("SELECT id FROM scouting_records WHERE id=?").bind(normalId).first());
 await r.db.prepare("UPDATE profiles SET row_json=json_set(row_json,'$.is_admin',json('false')) WHERE id='synthetic-admin'").run();assert.equal((await r.fetch("/strategy-proposal",form(cookie))).status,403);
});

test("controlled Strategy: missing/wrong secret, non-UTC/expired/future/>24h window and default blocked refuse before writes",async(t)=>{
 for(const extra of[{MIGRATION_CANARY_ACTOR_OPEN_ID:""},{MIGRATION_CANARY_ACTOR_OPEN_ID:"synthetic-other"},{CANARY_EVENT_KEY:"2026history"},{CANARY_STARTS_AT:"blocked"},{CANARY_STARTS_AT:utc(Date.now()+60_000)},{CANARY_EXPIRES_AT:"2026-01-01T00:00:00Z"},{CANARY_EXPIRES_AT:utc(Date.now()+90_000_000)},{CANARY_EXPIRES_AT:"2099-01-01T00:00:00+00:00"},{BUSINESS_WRITES:"blocked"}]){
  const r=await setup(t,config(extra)),cookie=await login(r),before=await snapshot(r.db);assert((await r.fetch("/strategy-proposal",form(cookie))).status>=400);assert.deepEqual(await snapshot(r.db),before);
 }
});

test("controlled Strategy: fixed new ID colliding with historic row cannot update, review, restore or delete it",async(t)=>{
 const r=await setup(t,config()),cookie=await login(r);await seedForeign(r,id);const before=await snapshot(r.db);
 assert.equal((await r.fetch("/strategy-proposal",form(cookie))).status,409);
 assert.equal((await r.fetch("/strategy-proposal",form(cookie,{id}))).status,403);
 for(const intent of["review","restore","delete"])assert.equal((await r.fetch("/strategy-proposal",action(cookie,intent))).status,403);
 assert.deepEqual(await snapshot(r.db),before);
});

test("controlled Strategy: imported baseline row stays immutable even with the canary event and marker",async(t)=>{
 const r=await setup(t,config()),cookie=await login(r);assert.equal((await r.fetch("/strategy-proposal",form(cookie))).status,200);
 await r.db.prepare("INSERT INTO native_import_rows(table_name,source_key,cells_json) VALUES('strategy_proposals',?,'[]')").bind(id).run();const before=await snapshot(r.db);
 assert.equal((await r.fetch("/strategy-proposal",form(cookie,{id}))).status,403);
 for(const intent of["review","restore","delete"])assert.equal((await r.fetch("/strategy-proposal",action(cookie,intent))).status,403);
 assert.deepEqual(await snapshot(r.db),before);
});

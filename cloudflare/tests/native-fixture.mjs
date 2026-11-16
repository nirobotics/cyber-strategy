import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { application, sourceRef, tableNames, bucketName, sha256, importPlan, sealVerified } from "../native/snapshot.mjs";
import { sidecar } from "../scripts/common.mjs";
import { workerOptions as scoutWorker, env as scoutEnv, seed as seedScout, pairSecret } from "../../../cyber-scout/migration/cloudflare-preview/tests/native-fixture.mjs";
export { normalId, superId, pitId, photoPath, photoBytes, eventConfig } from "../../../cyber-scout/migration/cloudflare-preview/tests/native-fixture.mjs";
export const origin="https://strategy-cf.team8214.com", stamp="2026-01-01T00:00:00.123456Z";
export function fixture(){
 const data=Object.fromEntries(tableNames.map((table)=>[table,[]]));
 data.profiles=[{open_id:"synthetic-admin",name:"Synthetic Admin",avatar_url:null,is_admin:true,created_at:stamp},{open_id:"synthetic-member",name:"Synthetic Scout",avatar_url:null,is_admin:false,created_at:stamp},{open_id:"synthetic-other",name:"Synthetic Other",avatar_url:null,is_admin:false,created_at:stamp}];
 data.app_settings=[{key:"tier_percentages",value:{S:10,A:20,B:40,C:30},updated_by:"synthetic-admin",updated_at:stamp},{key:"data_range",value:["qualification"],updated_by:"synthetic-admin",updated_at:stamp}];
 data.audit_logs=[{id:"history-audit",action:"synthetic.history",actor_open_id:"synthetic-admin",changed_fields:[],created_at:stamp,raw_int64:"RAW_INT64",raw_json_null:"RAW_JSON_NULL",sql_null:null}];
 data.scouting_datasets=[{id:"historical-dataset",title:"Historical dataset",event_key:"2025history",source_filename:"synthetic.csv",team_data:{},team_photos:{},is_active:false,created_by:"synthetic-admin",created_at:stamp,updated_at:stamp}];
 data.strategy_proposals=[];
 for(const table of ["matches","match_videos","match_markings","match_notes","match_score_samples","video_processing_jobs"])data[table]=[{id:"legacy-"+table,created_at:stamp,history:"RAW_INT64"}];
 const specs={},tables={};
 for(const table of tableNames){const names=[...new Set(data[table].flatMap((row)=>Object.keys(row)))];if(!names.length)names.push(...["id", "event_key", "match_key", "match_label", "own_team", "proposal_type", "status", "title", "payload", "created_by", "reviewed_by", "review_note", "submitted_at", "reviewed_at", "last_approved_snapshot", "created_at", "updated_at"]);const primaryKey=[table==="profiles"?"open_id":table==="app_settings"?"key":"id"];specs[table]={columns:names.map((name)=>({name,type:name.endsWith("_at")?"timestamp with time zone":"jsonb",notNull:false})),primaryKey};tables[table]=data[table].map((row)=>({key:row[primaryKey[0]],cells:names.map((name)=>row[name]==="RAW_INT64"?"9223372036854775807":row[name]==="RAW_JSON_NULL"?"null":row[name]==null?null:JSON.stringify(row[name]))}));}
 const catalogRaw=JSON.stringify({application,sourceRef,tables:specs,routines:["prevent_audit_log_mutation","set_updated_at"],constraints:"SYNTHETIC ONLY; not source catalog"});
 const bytes=new Uint8Array([0,0,0,24,102,116,121,112]);
 return{pin:sha256(catalogRaw),bytes,snapshot:{format:"native-source-snapshot-v1",application,sourceRef,provenance:"synthetic-local",snapshotAt:stamp,catalogRaw,tables,objects:{bucket:bucketName,inventory:[{path:"historical/synthetic.mp4",size:String(bytes.length),sha256:sha256(bytes),contentType:"video/mp4",metadataRaw:'{"synthetic":true,"raw":9223372036854775807}'}]}}};
}
export function env(overrides={}){const cfg=JSON.parse(readFileSync(resolve(sidecar,".cloudflare/output/v0/workers/default/worker.config.json")));const values=Object.fromEntries(Object.entries(cfg.env).filter(([,value])=>value.type==="text").map(([key,value])=>[key,value.value]));for(const[key,value]of Object.entries(cfg.env))if(value.type==="secret")values[key]="synthetic-local-strategy-"+key.toLowerCase()+"-not-a-credential";return{...values,SCOUT_STRATEGY_SECRET:pairSecret,FEISHU_ALLOWED_TENANT_KEYS:"synthetic-tenant",STRATEGY_DATA_READY:"verified-native-data",STRATEGY_INTEGRATIONS_READY:"approved-preview-contract",BUSINESS_WRITES:"enabled",SOURCE_CATALOG_SHA256:fixture().pin,LOCAL_SYNTHETIC_TEST:"miniflare-only",FEISHU_VIDEO_LIBRARY_NODE_TOKEN:"synthetic-wiki-root",FEISHU_VIDEO_LIBRARY_URL:"https://synthetic.feishu.cn/wiki/synthetic-wiki-root",...overrides};}
export async function setup(t,overrides={},withAssets=true){
 const dir=resolve(sidecar,".cloudflare/output/v0/workers/default"),calls=[],state={tenant:"synthetic-tenant"};
 const outbound=async(request)=>{const url=new URL(request.url),body=request.method==="POST"?await request.json():null;calls.push({host:url.host,path:url.pathname,method:request.method,body});
 if(url.host==="open.feishu.cn"){
  if(url.pathname.endsWith("/oauth/token"))return Response.json({code:0,access_token:"synthetic-access-"+body.code});
  if(url.pathname.endsWith("/user_info")){const code=request.headers.get("Authorization").split("synthetic-access-")[1];return Response.json({code:0,data:{open_id:"synthetic-"+(["admin","other"].includes(code)?code:"member"),name:code==="admin"?"Synthetic Admin":"Synthetic Scout",tenant_key:state.tenant}});}
  if(url.pathname.endsWith("/tenant_access_token/internal"))return Response.json({code:0,tenant_access_token:"synthetic-wiki-token"});
  if(url.pathname.endsWith("/spaces/get_node"))return Response.json({code:0,data:{node:{space_id:"synthetic-space",node_token:"synthetic-wiki-root",title:"Synthetic video library"}}});
  if(url.pathname.endsWith("/spaces/synthetic-space/nodes"))return Response.json({code:0,data:{items:[{node_token:"synthetic-video",title:"2026test_qm1.mp4",obj_type:"file",has_child:false}],has_more:false}});
 }
 if(url.host==="www.thebluealliance.com"&&url.pathname.endsWith("/matches"))return Response.json([{key:"2026test_qm1",comp_level:"qm",match_number:1,set_number:1,alliances:{red:{team_keys:["frc8214","frc6328","frc157"]},blue:{team_keys:["frc1","frc2","frc3"]}}}]);
 if(url.host==="frc-api.firstinspires.org"){
  if(url.pathname.includes("/schedule/"))return Response.json({Schedule:url.searchParams.get("tournamentLevel")==="Qualification"?[{tournamentLevel:"Qualification",description:"Qualification 1",matchNumber:1,teams:[{teamNumber:8214,station:"Red1"}]}]:[]});
  if(url.pathname.endsWith("/Qualification"))return Response.json({MatchScores:[{matchLevel:"Qualification",matchNumber:1,alliances:[{alliance:"red",autoPoints:30,teleopPoints:70,totalPoints:100},{alliance:"blue",autoPoints:20,teleopPoints:60,totalPoints:80}]}]});
  return Response.json({MatchScores:[]});
 }
 assert.fail("Unapproved external request BLOCKED: "+url.origin+url.pathname);
 };
 const strategy={name:"strategy",routes:["strategy-cf.team8214.com/*", "strategy.team8214.com/*"],modules:true,modulesRoot:resolve(dir,"bundle"),scriptPath:resolve(dir,"bundle/worker.js"),compatibilityDate:"2026-11-15",compatibilityFlags:["nodejs_compat"],bindings:env(overrides),outboundService:outbound,d1Databases:{DB:"strategy-synthetic-independent"},r2Buckets:{FILES:"strategy-synthetic-independent"},durableObjects:{BUSINESS:{className:"StrategyBusiness",useSQLite:true}},serviceBindings:{SCOUT:"scout"},...(withAssets?{assets:{directory:resolve(dir,"assets"),binding:"ASSETS",run_worker_first:true,routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true},assetConfig:{html_handling:"none",not_found_handling:"none"}}}:{})};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[strategy,scoutWorker(scoutEnv(),outbound)]}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database("DB","strategy"),bucket=await mf.getR2Bucket("FILES","strategy"),scoutDB=await mf.getD1Database("DB","scout"),scoutBucket=await mf.getR2Bucket("FILES","scout");
 await seedScout(scoutDB,scoutBucket);
 for(const sql of readFileSync(resolve(sidecar,"native/schema.sql"),"utf8").split("\n").map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("--")))await db.prepare(sql).run();
 const source=fixture(),plan=importPlan(source.snapshot,source.pin);for(let i=0;i<plan.length;i+=50)await db.batch(plan.slice(i,i+50).map(({sql,values})=>db.prepare(sql).bind(...values)));
 await bucket.put("historical/synthetic.mp4",source.bytes,{httpMetadata:{contentType:"video/mp4"}});await sealVerified(db,bucket,source.snapshot,source.pin,{localSynthetic:true});
 const worker=await mf.getWorker("strategy");
 return{mf,db,bucket,scoutDB,scoutBucket,calls,state,bindings:env(overrides),fetch:(path,init={})=>mf.dispatchFetch(origin+path,{redirect:"manual",...init})};
}

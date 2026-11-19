import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { sidecar } from "../scripts/common.mjs";
// The Worker behind the SCOUT binding. When a packaged cyber-scout is at hand (checked out next to this repository,
// or its Worker package named by CYBER_SCOUT_PACKAGE) the tests run against the real Scout Worker. Otherwise (CI:
// cyber-scout is a private repository) they run against tests/scout-double.mjs, a small Worker that implements the same
// /_scout/v1 contract on its own D1 and R2. SCOUT_TEST_DOUBLE=1 forces the double.
const scoutPackage = resolve(process.env.CYBER_SCOUT_PACKAGE ?? resolve(sidecar, "../../cyber-scout/migration/cloudflare-preview"));
export const realScout = process.env.SCOUT_TEST_DOUBLE !== "1" && existsSync(resolve(scoutPackage, ".cloudflare/output/v0/workers/default/bundle/worker.js"));
const scout = await import(realScout ? pathToFileURL(resolve(scoutPackage, "tests/native-fixture.mjs")).href : "./scout-double.mjs");
const { workerOptions: scoutWorker, env: scoutEnv, seed: seedScout, pairSecret } = scout;
export const { normalId, superId, pitId, photoPath, photoBytes, eventConfig } = scout;
// Same routing the deployed Worker gets from its assets configuration: "!" patterns go straight to Static Assets.
function assetOptions(dir) {
  const { assets } = JSON.parse(readFileSync(resolve(dir, "worker.config.json"))), patterns = assets.runWorkerFirst;
  return { directory: resolve(dir, "assets"), binding: "ASSETS",
    routerConfig: { has_user_worker: true, static_routing: { user_worker: patterns.filter((pattern) => !pattern.startsWith("!")), asset_worker: patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1)) } },
    assetConfig: { html_handling: assets.htmlHandling, not_found_handling: assets.notFoundHandling } };
}
export const origin="https://strategy.team8214.com", scoutOrigin="https://scout.team8214.com", stamp="2026-01-01T00:00:00.123456Z";
export const tableNames=["profiles","scouting_datasets","app_settings","strategy_proposals","audit_logs","matches","match_videos","match_markings","match_notes","match_score_samples","video_processing_jobs"];
export const archivePath="historical/synthetic.mp4",archiveBytes=new Uint8Array([0,0,0,24,102,116,121,112]);
export function fixture(){
 const data=Object.fromEntries(tableNames.map((table)=>[table,[]]));
 data.profiles=[{open_id:"synthetic-admin",name:"Synthetic Admin",avatar_url:null,is_admin:true,created_at:stamp},{open_id:"synthetic-member",name:"Synthetic Scout",avatar_url:null,is_admin:false,created_at:stamp},{open_id:"synthetic-other",name:"Synthetic Other",avatar_url:null,is_admin:false,created_at:stamp}];
 data.app_settings=[{key:"tier_percentages",value:{S:10,A:20,B:40,C:30},updated_by:"synthetic-admin",updated_at:stamp},{key:"data_range",value:["qualification"],updated_by:"synthetic-admin",updated_at:stamp}];
 data.audit_logs=[{id:"history-audit",action:"synthetic.history",actor_open_id:"synthetic-admin",changed_fields:[],created_at:stamp,raw_int64:"RAW_INT64",raw_json_null:"RAW_JSON_NULL",sql_null:null}];
 data.scouting_datasets=[{id:"historical-dataset",title:"Historical dataset",event_key:"2025history",source_filename:"synthetic.csv",team_data:{},team_photos:{},is_active:false,created_by:"synthetic-admin",created_at:stamp,updated_at:stamp}];
 data.strategy_proposals=[];
 for(const table of ["matches","match_videos","match_markings","match_notes","match_score_samples","video_processing_jobs"])data[table]=[{id:"legacy-"+table,created_at:stamp,history:"RAW_INT64"}];
 return data;
}
// One row_json per record, as the import stores them. RAW_INT64 stands for a number larger than JavaScript can
// represent and RAW_JSON_NULL for a JSON null: both must survive later updates of the row untouched.
export function rowJSON(row){return JSON.stringify(row).replaceAll('"RAW_INT64"',"9223372036854775807").replaceAll('"RAW_JSON_NULL"',"null");}
export async function seed(db,bucket,data=fixture()){
 for(const sql of readFileSync(resolve(sidecar,"native/schema.sql"),"utf8").split("\n").map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("--")))await db.prepare(sql).run();
 const statements=tableNames.flatMap((table)=>data[table].map((row)=>db.prepare(`INSERT INTO ${table}(id,row_json) VALUES(?,?)`).bind(row[table==="profiles"?"open_id":table==="app_settings"?"key":"id"],rowJSON(row))));
 statements.push(db.prepare("INSERT INTO native_objects(path,r2_key,metadata_json) VALUES(?,?,?)").bind(archivePath,archivePath,JSON.stringify({size:String(archiveBytes.length),contentType:"video/mp4"})));
 await db.batch(statements);await bucket.put(archivePath,archiveBytes,{httpMetadata:{contentType:"video/mp4"}});
 return data;
}
export function env(overrides={}){const cfg=JSON.parse(readFileSync(resolve(sidecar,".cloudflare/output/v0/workers/default/worker.config.json")));const values=Object.fromEntries(Object.entries(cfg.env).filter(([,value])=>value.type==="text").map(([key,value])=>[key,value.value]));for(const[key,value]of Object.entries(cfg.env))if(value.type==="secret")values[key]="synthetic-local-strategy-"+key.toLowerCase()+"-not-a-credential";return{...values,SCOUT_STRATEGY_SECRET:pairSecret,FEISHU_ALLOWED_TENANT_KEYS:"synthetic-tenant",FEISHU_VIDEO_LIBRARY_NODE_TOKEN:"synthetic-wiki-root",FEISHU_VIDEO_LIBRARY_URL:"https://synthetic.feishu.cn/wiki/synthetic-wiki-root",...overrides};}
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
 const strategy={name:"strategy",routes:["strategy.team8214.com/*"],modules:true,modulesRoot:resolve(dir,"bundle"),scriptPath:resolve(dir,"bundle/worker.js"),compatibilityDate:"2026-11-15",compatibilityFlags:["nodejs_compat"],bindings:env(overrides),outboundService:outbound,d1Databases:{DB:"strategy-synthetic-independent"},r2Buckets:{FILES:"strategy-synthetic-independent"},durableObjects:{BUSINESS:{className:"StrategyBusiness",useSQLite:true}},serviceBindings:{SCOUT:"scout"},...(withAssets?{assets:assetOptions(dir)}:{})};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[strategy,scoutWorker(scoutEnv(),outbound)]}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database("DB","strategy"),bucket=await mf.getR2Bucket("FILES","strategy"),scoutDB=await mf.getD1Database("DB","scout"),scoutBucket=await mf.getR2Bucket("FILES","scout");
 await seedScout(scoutDB,scoutBucket);
 await seed(db,bucket);
 return{mf,db,bucket,scoutDB,scoutBucket,calls,state,bindings:env(overrides),fetch:(path,init={})=>mf.dispatchFetch(origin+path,{redirect:"manual",...init})};
}

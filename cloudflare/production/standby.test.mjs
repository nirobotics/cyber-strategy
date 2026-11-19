import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createCookie } from 'react-router';
import { seed, photoPath, photoBytes, pairSecret, memberId } from '../../../cyber-scout/migration/cloudflare-preview/tests/native-fixture.mjs';
import { verify as verifyStrategy } from '../scripts/verify.mjs';
import { verify as verifyScout } from '../../../cyber-scout/migration/cloudflare-preview/scripts/verify.mjs';

const scoutOrigin='https://scout.team8214.com', strategyOrigin='https://strategy.team8214.com';
const side=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key='synthetic-local-session-signing-material-only';
const digest=(value)=>createHash('sha256').update(value).digest('hex');
const pack={scout:verifyScout('production',process.env.FORMAL_SCOUT_OUTPUT),strategy:verifyStrategy('production',process.env.FORMAL_STRATEGY_OUTPUT)};
const env=(config)=>Object.fromEntries(Object.entries(config.env).flatMap(([name,b])=>b.type==='text'?[[name,b.value]]:b.type==='secret'?[[name,'synthetic-local-only-not-a-credential-'+name]]:[]));
const outbound=[];
function worker({config,dir}, kind, extra={}){
 const scout=kind==='scout';
 return {name:config.name,routes:[`${kind}.team8214.com/*`],modules:true,modulesRoot:resolve(dir,'bundle'),scriptPath:resolve(dir,'bundle/worker.js'),compatibilityDate:config.compatibilityDate,compatibilityFlags:config.compatibilityFlags,
  bindings:{...env(config),SESSION_SECRET:scout?'\ufeff'+key:key,FEISHU_APP_ID:'cli_aa901897bc38dbb4',SCOUT_STRATEGY_SECRET:pairSecret,
   AUTH_WRITES:'enabled',BUSINESS_WRITES:'controlled-canary',ORIGIN_HANDOVER:'approved-same-origin',NATIVE_HANDOVER_GENERATION:'999',EFFECTS_ENABLED:'true',GC_ENABLED:'true',JOBS_ENABLED:'true',MIGRATION_CANARY_ACTOR_OPEN_ID:'synthetic-local-actor'},
  outboundService:request=>{outbound.push(request.method+' '+new URL(request.url).origin);return new Response('Unexpected network',{status:500});},
  d1Databases:{DB:`${kind}-formal-test-only`},r2Buckets:{FILES:`${kind}-formal-test-only`},durableObjects:{BUSINESS:{className:config.env.BUSINESS.exportName,useSQLite:true}},
  assets:{directory:resolve(dir,'assets'),binding:'ASSETS',run_worker_first:true,routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true},assetConfig:{html_handling:'none',not_found_handling:'none'}},...extra};
}
async function pins(db,{config},tableCount){
 await db.prepare("INSERT INTO native_catalog(id,catalog_json,schema_sha256) VALUES('source','{}',?) ON CONFLICT(id) DO UPDATE SET schema_sha256=excluded.schema_sha256").bind(config.env.SOURCE_CATALOG_SHA256.value).run();
 await db.prepare("INSERT INTO native_seal(id,schema_sha256,data_sha256,object_sha256,source_snapshot,table_count,row_count,object_count,provenance) VALUES('verified',?,?,?,'synthetic-local',?,1,1,'actual-source') ON CONFLICT(id) DO UPDATE SET schema_sha256=excluded.schema_sha256,provenance=excluded.provenance").bind(config.env.NATIVE_SCHEMA_SHA256.value,digest('synthetic data'),digest('synthetic objects'),tableCount).run();
}
async function snapshot(db){
 const schema=(await db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all()).results;
 const rows=await Promise.all(schema.filter(x=>x.type==='table'&&x.name!=='_cf_KV').map(async ({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.map(x=>JSON.stringify(x)).sort()]));
 return {schema,rows};
}
const photoRoute='/api/cyber-scout/photos?path='+encodeURIComponent(photoPath);
const namedRoute='/_scout/v1/photo?path='+encodeURIComponent(photoPath);
function strategyCookie(){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(digest(key),'hex'),iv);
 const body=JSON.stringify({user:{feishuOpenId:'synthetic-member',name:'Synthetic Member',avatarUrl:null},exp:Math.floor(Date.now()/1000)+600});
 const bytes=Buffer.concat([cipher.update(body),cipher.final()]);
 return 'strategy_session='+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');
}
let mf, dbScout, dbStrategy, beforeScout, beforeStrategy;
const fetchAt=(origin,path,init)=>mf.dispatchFetch(origin+path,{redirect:'manual',...init});
before(async()=>{
 const scout=worker(pack.scout,'scout');
 const binding=pack.strategy.config.env.SCOUT;
 const strategy=worker(pack.strategy,'strategy',{serviceBindings:{SCOUT:{name:binding.worker,entrypoint:binding.exportName}}});
 mf=new Miniflare(convertV4MiniflareOptions({workers:[scout,strategy]}));
 dbScout=await mf.getD1Database('DB','cyber-scout');dbStrategy=await mf.getD1Database('DB','cyber-strategy');
 await seed(dbScout,await mf.getR2Bucket('FILES','cyber-scout'));
 for(const sql of readFileSync(resolve(side,'native/schema.sql'),'utf8').split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('--')))await dbStrategy.prepare(sql).run();
 await pins(dbScout,pack.scout,9);await pins(dbStrategy,pack.strategy,11);
 [beforeScout,beforeStrategy]=await Promise.all([snapshot(dbScout),snapshot(dbStrategy)]);
});
after(async()=>{
 try{if(beforeScout&&beforeStrategy){assert.deepEqual(await snapshot(dbScout),beforeScout);assert.deepEqual(await snapshot(dbStrategy),beforeStrategy);assert.deepEqual(outbound,[]);}}
 finally{await mf?.dispose();}
});

for(const [app,origin] of Object.entries({scout:scoutOrigin,strategy:strategyOrigin}))describe(`${app} actual formal bundle`,()=>{
 test('recognizes exact sealed host but leaves auth, business and handover off despite env overrides',async()=>{
  const r=await fetchAt(origin,'/__ready');assert.equal(r.status,200);
  const state=await r.json();assert.equal(state.service,`cyber-${app}`);assert.equal(state.dataGate,true);
  for(const flag of ['businessReady','handoverAccepted','authWrites','businessWrites'])assert.equal(state[flag],false);
  if(app==='strategy')assert.equal(state.videoLibraryConfigured,false);
  const worker=await mf.getWorker(`cyber-${app}`);
  assert.equal((await worker.fetch(`https://${app}-cf.team8214.com/__ready`)).status,421);
 });
 test('full SSR auth page and immutable assets remain packaged without initiating login',async()=>{
  const login=await fetchAt(origin,'/auth/login');assert.equal(login.status,200);assert.equal(login.headers.has('set-cookie'),false);assert.match(await login.text(),/飞书登录/);
  for(const [path,pin] of Object.entries(pack[app].assets)){
   const r=await fetchAt(origin,path);assert.equal(r.status,200,path);assert.equal(digest(Buffer.from(await r.arrayBuffer())),pin.sha256,path);
  }
 });
 test('auth initiation/callback/logout and business/canary writes are inert',async()=>{
  const attempts=[['POST','/auth/login'],['GET','/auth/feishu/callback?code=local-only'],['GET','/AUTH/FEISHU/CALLBACK.data'],['GET','/auth/logout'],['GET','/api/auth/login'],['GET','/api/auth/callback'],['POST','/api/records/upload'],['POST','/strategy/proposal'],['GET','/demo'],['GET','/embed'],['GET','/home']];
  for(const [method,path] of attempts){const r=await fetchAt(origin,path,{method,headers:{Origin:origin,'X-Migration-Canary':'synthetic-local'}});assert.equal(r.status,503,`${method} ${path}`);assert.equal(r.headers.has('location'),false);assert.equal(r.headers.has('set-cookie'),false);}
  assert.equal((await fetchAt(origin,'/.env')).status,404);
 });
 test('own SQLite coordinator refuses even correctly hosted method before storage/runtime dispatch',async()=>{
  const ns=await mf.getDurableObjectNamespace('BUSINESS',`cyber-${app}`),stub=ns.get(ns.idFromName('formal-standby-synthetic-only'));
  for(const method of ['GET','POST'])assert.equal((await stub.fetch(origin+'/__ready',{method})).status,503);
 });
});

test('Scout original trimmed signing codec recognizes a BOM-prefixed bound key without enabling legacy/no-expiry cookies',async()=>{
 const cookie=createCookie('__cyber_scout_session',{secrets:[key]});
 const user={userId:memberId,feishuOpenId:'synthetic-member',displayName:'Synthetic Member'};
 const accepted=await fetchAt(scoutOrigin,'/auth/login',{headers:{Cookie:await cookie.serialize({...user,__previewExpiresAt:Date.now()+60000})}});
 assert.equal(accepted.status,302);assert.equal(accepted.headers.get('location'),'/home');
 const legacy=await fetchAt(scoutOrigin,'/auth/login',{headers:{Cookie:await cookie.serialize(user)}});assert.equal(legacy.status,200);
});

test('Scout public handler refuses a correctly signed photo and every legacy pair read',async()=>{
 const at=String(Date.now()),actor='synthetic-member';
 const signature=createHmac('sha256',pairSecret).update(['scout-strategy-v1','GET',namedRoute,at,actor,'read',digest('')].join('\n')).digest('hex');
 assert.equal((await fetchAt(scoutOrigin,namedRoute,{headers:{'X-Scout-Time':at,'X-Scout-Actor':actor,'X-Scout-Capability':'read','X-Scout-Signature':signature}})).status,503);
 for(const path of ['/events','/config','/users','/events/test/records'])assert.equal((await fetchAt(scoutOrigin,'/_scout/v1'+path)).status,503);
});

test('Strategy named formal Scout capability is authenticated, exact private bytes, range and HEAD only',async()=>{
 assert.equal((await fetchAt(strategyOrigin,photoRoute)).status,401);
 const cookie=strategyCookie();
 const full=await fetchAt(strategyOrigin,photoRoute,{headers:{Cookie:cookie}});assert.equal(full.status,200);assert.match(full.headers.get('cache-control'),/private, no-store/);assert.deepEqual(new Uint8Array(await full.arrayBuffer()),photoBytes);
 const ranged=await fetchAt(strategyOrigin,photoRoute,{headers:{Cookie:cookie,Range:'bytes=1-3'}});assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),`bytes 1-3/${photoBytes.length}`);assert.deepEqual(new Uint8Array(await ranged.arrayBuffer()),photoBytes.slice(1,4));
 const head=await fetchAt(strategyOrigin,photoRoute,{method:'HEAD',headers:{Cookie:cookie}});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await fetchAt(strategyOrigin,photoRoute,{method:'POST',headers:{Cookie:cookie}})).status,503);
});

import {bindings,exports} from 'cf/config';
import {sourcePin,nativePin,origin} from './policy.ts';

export function productionConfig(){
 const accountId='2ca8df5c9754fb7e3f37d08c597535e0',name='cyber-strategy';
 for(const [key,value] of Object.entries({CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_CI_OVERRIDE_WORKER_NAME:name,CLOUDFLARE_ENV:'production',WRANGLER_ENV:'production'}))if(process.env[key]!==undefined&&process.env[key]!==value)throw Error('Formal identity override forbidden');
 if(process.env.CLOUDFLARE_ZONE_ID!==undefined)throw Error('No implicit formal routes');
 return {accountId,worker:{name,entrypoint:'./production/worker.ts',compatibilityDate:'2026-11-15',compatibilityFlags:['nodejs_compat'],workersDev:false,previewUrls:false,domains:[],triggers:[],observability:{enabled:false},assets:{htmlHandling:'none' as const,notFoundHandling:'none' as const,runWorkerFirst:true},exports:{StrategyBusiness:exports.durableObject({storage:'sqlite'})},env:{
  ASSETS:bindings.assets(),DB:bindings.d1({id:'c8430ab1-0fbe-424f-b329-5395f8e037ed',name:'cyber-strategy-native-preview'}),FILES:bindings.r2({name:'cyber-strategy-native-preview'}),BUSINESS:bindings.durableObject({worker:name,exportName:'StrategyBusiness'}),SCOUT:bindings.worker({worker:'cyber-scout',exportName:'ScoutPrivatePhoto'}),
  SOURCE_CATALOG_SHA256:bindings.text(sourcePin),NATIVE_SCHEMA_SHA256:bindings.text(nativePin),STRATEGY_PREVIEW_MODE:bindings.text('production-standby'),STRATEGY_DATA_READY:bindings.text('verified-native-data'),STRATEGY_INTEGRATIONS_READY:bindings.text('approved-formal-contract'),APP_BASE_URL:bindings.text(origin),CYBER_PIT_ORIGIN:bindings.text('https://pit.team8214.com'),CYBER_SCOUT_ORIGIN:bindings.text('https://scout.team8214.com'),
  AUTH_WRITES:bindings.text('blocked'),BUSINESS_WRITES:bindings.text('blocked'),ORIGIN_HANDOVER:bindings.text('blocked'),CANARY_EVENT_KEY:bindings.text('blocked'),CANARY_STARTS_AT:bindings.text('blocked'),CANARY_EXPIRES_AT:bindings.text('blocked'),NATIVE_HANDOVER_GENERATION:bindings.text('0'),EFFECTS_ENABLED:bindings.text('false'),GC_ENABLED:bindings.text('false'),JOBS_ENABLED:bindings.text('false'),
  SESSION_SECRET:bindings.secret(),FEISHU_APP_ID:bindings.secret(),FEISHU_APP_SECRET:bindings.secret(),FEISHU_ALLOWED_TENANT_KEYS:bindings.secret(),CYBER_STRATEGY_EMBED_SECRET:bindings.secret(),SCOUT_STRATEGY_SECRET:bindings.secret(),FRC_EVENTS_USERNAME:bindings.secret(),FRC_EVENTS_API_KEY:bindings.secret(),TBA_API_KEY:bindings.secret()
 }}};
}

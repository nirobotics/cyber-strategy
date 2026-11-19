// Immutable STANDBY, not a claim of accepted source freeze/final delta/clock or
// target-new-write-safe rollback. Vars alone NEVER activate writes/effects.
const formal = new WeakSet<object>();
export const origin='https://strategy.team8214.com';
export const sourcePin='c3be4a616bbb09c9da28d39e897564df5e1918773cc6039a97972d475450bb86';
export const nativePin='e363695ddd7902de0990fc05635d1a7249c8fca9410ef6e077c5530012cf9dce';
export const isFormal=(env:object)=>formal.has(env);
export function formalEnvironment<T extends Record<string,unknown>>(env:T):T {
 if(env.APP_BASE_URL!==origin||env.FEISHU_APP_ID!=='cli_aa901897bc38dbb4'||env.SOURCE_CATALOG_SHA256!==sourcePin||env.NATIVE_SCHEMA_SHA256!==nativePin||env.CYBER_SCOUT_ORIGIN!=='https://scout.team8214.com'||env.CYBER_PIT_ORIGIN!=='https://pit.team8214.com')throw new Error('Formal Strategy identity mismatch');
 const value={...env,SCOUT:photoOnly(env.SCOUT),STRATEGY_PREVIEW_MODE:'production-standby',AUTH_WRITES:'blocked',BUSINESS_WRITES:'blocked',ORIGIN_HANDOVER:'blocked',CANARY_EVENT_KEY:'blocked',CANARY_STARTS_AT:'blocked',CANARY_EXPIRES_AT:'blocked',MIGRATION_CANARY_ACTOR_OPEN_ID:undefined,LOCAL_SYNTHETIC_TEST:undefined,NATIVE_HANDOVER_GENERATION:'0',EFFECTS_ENABLED:'false',JOBS_ENABLED:'false',GC_ENABLED:'false'} as unknown as T;
 formal.add(value);return Object.freeze(value);
}
type ScoutService = { fetch(req:Request):Promise<Response> };
function photoOnly(binding:unknown):ScoutService|undefined {
 const service = binding as ScoutService | undefined;
 if (typeof service?.fetch!=='function') return undefined;
 return Object.freeze({fetch: async (req:Request) => {
  const url = new URL(req.url);
  if (url.origin!=='https://scout.team8214.com' || url.pathname!=='/_scout/v1/photo' || !['GET','HEAD'].includes(req.method)
    || [...url.searchParams.keys()].join()!=='path' || !url.searchParams.get('path') || req.headers.get('X-Scout-Capability')!=='read')
   return new Response(null,{status:403,headers:{'Cache-Control':'private, no-store'}});
  return service.fetch(req);
 }});
}

const quietReads = new Set(['/__health','/__ready','/auth/login','/auth/login.data','/api/cyber-scout/photos']);
export function standbyAdmission(req:Request, packagedAsset = false) {
 const url = new URL(req.url);
 if (url.origin!==origin) return new Response('Formal host required',{status:421});
 if (/^\/(?:\.|assets(?:\/|$))/i.test(url.pathname) && !packagedAsset) return new Response(null,{status:404});
 if (['GET','HEAD'].includes(req.method) && (packagedAsset || quietReads.has(url.pathname))) return null;
 return new Response('Formal standby: authentication/business/integration handover not accepted',{status:503,headers:{'Cache-Control':'private, no-store'}});
}

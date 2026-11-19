import runtime,{StrategyBusiness as OriginalBusiness} from '../worker';
import assets from '../.required-tool-outputs/assets.json';
import {formalEnvironment,standbyAdmission} from './policy';
export default {async fetch(req:Request,env:Parameters<typeof runtime.fetch>[1],ctx:Parameters<typeof runtime.fetch>[2]){
 const denied=standbyAdmission(req,Object.hasOwn(assets,new URL(req.url).pathname));
 if(denied)return denied;
 try{return await runtime.fetch(req,formalEnvironment(env),ctx);}catch{return new Response('Formal configuration unavailable',{status:503});}
}};
export class StrategyBusiness extends OriginalBusiness {
 constructor(state:ConstructorParameters<typeof OriginalBusiness>[0],env:ConstructorParameters<typeof OriginalBusiness>[1]){super(state,formalEnvironment(env));}
 fetch(){return Promise.resolve(new Response(null,{status:503,headers:{'Cache-Control':'private, no-store'}}));}
 async alarm(){/* STANDBY: no clock, job or rescheduling. */}
}

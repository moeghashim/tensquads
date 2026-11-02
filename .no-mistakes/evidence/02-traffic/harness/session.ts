import { openPglite } from '../../../packages/adapters/test/pglite.ts';
import { replaceDemoAccount } from '../../../packages/seed/src/demo-account.ts';
import { readWorkspaceFrame, createRepositories, schema } from '@tensquads/adapters';
import { Kernel } from '@tensquads/kernel';
import {eq} from 'drizzle-orm';
const opened = await openPglite();
const scope = {accountId:'local-traffic-validation',mode:'account'} as const;
await replaceDemoAccount(opened.db,scope.accountId,'disposable-user');
const controls:any={readDelay:0,writeDelay:0,lookupDelay:0,transactionStarts:0,log:[]};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const query=opened.client.query.bind(opened.client);
opened.client.query=async(...args:any[])=>{
 if (/select/i.test(args[0])&&/bus_events/i.test(args[0])&&controls.readDelay) {
  const ms=controls.readDelay; controls.readDelay=0; controls.log.push({stage:'pre-read-delay',ms,at:Date.now()}); await pause(ms);
 }
 return query(...args as any);
};
const transaction=opened.client.transaction.bind(opened.client);
opened.client.transaction=async(callback:any,...args:any[])=>{
 controls.transactionStarts++;
 return transaction(async(tx:any)=>{
  const original=tx.query.bind(tx);
  tx.query=async(...q:any[])=>{
   const result=await original(...q);
   if (/insert into "bus_events"/i.test(q[0])&&controls.writeDelay) {
    const ms=controls.writeDelay; controls.writeDelay=0;controls.log.push({stage:'after-insert-delay',ms,at:Date.now()});await pause(ms);
   }
   return result;
  };
  return callback(tx);
 },...args);
};
(globalThis as any).__trafficValidation={async admin(action:any) {
 if(action.reset){await replaceDemoAccount(opened.db,scope.accountId,'disposable-user');Object.assign(controls,{readDelay:0,writeDelay:0,lookupDelay:0,transactionStarts:0,log:[]});}
 if(action.stockSentinel)await opened.db.update(schema.stateEntries).set({value:JSON.stringify(action.stockSentinel)}).where(eq(schema.stateEntries.key,'inventory.low_stock'));
 if(action.defaultAdvance)await new Kernel(createRepositories(opened.db)).nextEvent(scope);
 if(action.deleteId)await opened.db.delete(schema.busEvents).where(eq(schema.busEvents.id,action.deleteId));
 for (const key of ['readDelay','writeDelay','lookupDelay']) if(action[key]!==undefined)controls[key]=action[key];
 if(['readDelay','writeDelay','lookupDelay'].some(key=>action[key]!==undefined))return {armed:true};
 if(action.directRemainder!==undefined){const before=controls.transactionStarts;let error='';try{await new Kernel(createRepositories(opened.db)).nextEvent(scope,Date.now()+action.directRemainder);}catch(e:any){error=e.message;}return {error,transactions:controls.transactionStarts-before};}
 const events=await opened.db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId,scope.accountId));
 const store=await opened.db.select().from(schema.stateEntries).where(eq(schema.stateEntries.accountId,scope.accountId));
 const cursor=await opened.db.select().from(schema.busCursors).where(eq(schema.busCursors.accountId,scope.accountId));
 return {events,store,cursor,controls};
}};
export async function requireWorkspace<T>(work:(scope:any,db:any)=>Promise<T>) {
 if(controls.lookupDelay){const ms=controls.lookupDelay;controls.lookupDelay=0;controls.log.push({stage:'workspace-lookup-delay',ms,at:Date.now()});await pause(ms);}
 return work(scope,opened.db);
}
export async function readFrame(db:any,scope:any) {return readWorkspaceFrame(db,scope);}
export async function sendWorkspace(method:'beginSend'|'finishSend',data:string) {return new Kernel(createRepositories(opened.db))[method](scope,data);}

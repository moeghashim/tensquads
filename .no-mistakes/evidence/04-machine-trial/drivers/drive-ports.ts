import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {startFakeBoat} from '../packages/adapters/test/boat-fake.ts';
import {createBoatMachine} from '../packages/adapters/src/boat-machine.ts';
import {pickWorkerAdapters} from '../packages/adapters/src/adapters-flag.ts';
import {createAccountMemoryBus} from '../packages/adapters/src/memory-bus.ts';
const output:Record<string,unknown>={};
const scope={accountId:'isolated-trial',mode:'account'} as const;
const fake=await startFakeBoat();
try{
 const adapter=createBoatMachine({token:fake.machineToken,adminToken:fake.adminToken,basePath:fake.basePath,profileName:'tensquads-agents',secretBaseUrl:'https://example.com/hooks',fetchApi:fetch,wait:{intervalMs:0,timeoutMs:5000}});
 const template=await adapter.makeTemplate(scope,'market-researcher','0.1.0');
 await adapter.startFromTemplate(scope,template.id,'orders');
 await adapter.start(scope,'orders','registry.agents.co/market-researcher:0.1.0');
 assert.equal(fake.creates,2);
 const fields={host:await adapter.host(scope,'orders'),region:await adapter.region(scope,'orders'),size:await adapter.size(scope,'orders'),cpu:await adapter.cpu(scope,'orders'),uptime:await adapter.uptime(scope,'orders')};
 assert.equal(fields.host,'vps-orders-01');assert.equal(fields.cpu,'20%');
 const calls=fake.processCalls;await adapter.stop(scope,'orders');
 const stopped={cpu:await adapter.cpu(scope,'orders'),uptime:await adapter.uptime(scope,'orders')};
 assert.deepEqual(stopped,{cpu:'0%',uptime:'Paused'});assert.equal(fake.processCalls,calls);
 await adapter.resume(scope,'orders');await adapter.registerSecret(scope,'trial-name');
 const names=await adapter.secrets(scope,'orders');const egress=await adapter.egress(scope,'orders');
 assert.deepEqual(names,['trial-name']);assert.deepEqual(egress,['example.com']);
 let invalid='';try{await adapter.startFromTemplate(scope,'market-researcher-0.1.0','other');}catch(e){invalid=e.message;}
 assert.equal(invalid,'The template id is not valid.');
 await adapter.removeSecret(scope,'trial-name');const remainingNames=await adapter.secrets(scope,'orders');await adapter.remove(scope,'orders');await adapter.removeTemplate(scope,template.id);
 assert.ok(fake.machines().every(m=>m.deleted));assert.equal(fake.template(template.id),undefined);
 output.machine={dependency:'disposable fake boat HTTP service; real adapter and SDK',template,fields,stopped,names,egress,invalidTemplate:invalid,deleted:fake.machines().map(m=>({name:m.name,deleted:m.deleted,environment:m.environment,env:m.env,labels:m.labels})),remainingNames};
 const faults=[];
 for(const item of [{status:429,code:'rate_limited',expected:'rate_limited'},{status:429,code:'limit_reached',expected:'limit_reached'},{status:402,code:'billing',expected:'billing_required'},{status:503,code:'no_capacity',expected:'out_of_capacity'}]){
  fake.nextError={status:item.status,code:item.code,secret:'do-not-leak'};
  try{await adapter.start(scope,'error-agent','registry.agents.co/orders:1');assert.fail('expected error');}catch(e){assert.equal(e.code,item.expected);assert.equal(e.message.includes('do-not-leak'),false);faults.push({status:item.status,code:e.code,message:e.message});}
 }
 output.faults=faults;
 for(const flag of [undefined,'test','REAL','realish','']){
  const chosen=pickWorkerAdapters({ADAPTERS:flag});
  const s={accountId:`flag-${String(flag)}`,mode:'account'} as const;
  await chosen.machine.start(s,'orders','registry.agents.co/orders:1');
  await chosen.machine.stop(s,'orders');assert.equal(await chosen.machine.uptime(s,'orders'),'Paused');
  output[`flag:${String(flag)}`]={uptime:await chosen.machine.uptime(s,'orders')};
 }
 let exactReal;try{pickWorkerAdapters({ADAPTERS:'real'});assert.fail('real must require config');}catch(e){assert.equal(e.message,'The machine service is not configured.');exactReal={code:e.code,message:e.message};}output.exactReal=exactReal;
 const step={from:'master',to:'orders',kind:'Task',skill:'watch',text:'Watch',payload:{},writes:['status'],set:{status:'ready'}} as const;
 const bus=createAccountMemoryBus({events:[{...step,id:'e100'}],script:[step]});
 const first=await bus.nextEvent(scope);const second=await bus.nextEvent(scope);
 assert.equal(first?.id,'e101');assert.equal(second?.id,'e102');
 await bus.publish(scope,{...step,id:'e101',set:{status:'poison'}});assert.deepEqual(await bus.store(scope),{status:'ready'});
 assert.equal((await bus.nextEvent({accountId:'other',mode:'account'}))?.id,'e101');
 output.memory={first,second,store:await bus.store(scope),events:await bus.events(scope)};
}finally{await fake.close();}
writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6K1KRBS575JSZJ19KBMAD1N/live-port-results.json',JSON.stringify(output,null,2));
console.log('Real adapter/SDK HTTP lifecycle, errors, template rejection, flag fallback, and memory bus exercised.');

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, NoOpLog } from 'miniflare';
import { signMachineToken } from '../packages/adapters/src/cloudflare-bus/token.ts';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6NM17MKPTFEAH7F40YRS7D2/local-worker.json';
const directory = process.cwd()+'/.phase-test';
await build({entryPoints:[directory+'/worker.ts'],outfile:directory+'/worker.js',bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2024',conditions:['workerd','worker','browser'],logLevel:'silent',plugins:[{name:'external',setup(b){b.onResolve({filter:/^(node:|cloudflare:)/},a=>({path:a.path,external:true}));}}]});
const config={name:'tensquads',compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat','nodejs_compat_populate_process_env'],manifest:{mainModule:'worker.js',modulesRoot:directory,modules:{'worker.js':{type:'esm',contents:readFileSync(directory+'/worker.js','utf8')}}},env:{ADAPTERS:{type:'text',value:'real'},BUS_INSPECT:{type:'text',value:'1'},MACHINE_TOKEN_KEY:{type:'text',value:'disposable-local-key'},ACCOUNT_BUS:{type:'durable-object',worker:'tensquads',exportName:'AccountBus'},BUS_QUEUE:{type:'queue',name:'local-bus'},BUS_DEAD_LETTER:{type:'text',value:'local-dlq'}},exports:{AccountBus:{type:'durable-object',storage:'sqlite'}},triggers:[{type:'queue',name:'local-bus',maxBatchSize:1,maxBatchTimeout:0,maxRetries:1,deadLetterQueue:'local-dlq'},{type:'queue',name:'local-dlq'}]};
config.env.SLOW_BUS={type:'durable-object',worker:'tensquads',exportName:'DelayedAccountBus'};
config.exports.DelayedAccountBus={type:'durable-object',storage:'sqlite'};
const mf=new Miniflare({log:new NoOpLog(),workers:[{config}]});
const records=[];
async function post(path, body, headers={}){const r=await mf.dispatchFetch('http://localhost'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text} records.push({path,status:r.status,request:body,response:value});return {status:r.status,value};}
async function read(account,path){const r=await mf.dispatchFetch('http://localhost/read?'+new URLSearchParams({account,path}));assert.equal(r.status,200);const value=await r.json();records.push({account,path,value});return value;}
const script=[{from:'master',to:'researcher',kind:'Task',skill:'research',text:'Check local stock',payload:{},writes:['stock','ready'],set:{stock:2,ready:true}}];
const event=(id,extra={})=>({id,from:'researcher',to:'researcher',kind:'Task',skill:'research',text:'Local task',payload:{},writes:[],...extra});
try {
 const defaults=await post('/defaults',{});assert.deepEqual(defaults.value.paused,{cpu:'0%',uptime:'Paused'});assert.equal(defaults.value.resumed.uptime,'Just started');assert.equal(defaults.value.events[0].id,'default-event');
 const firstDesign=await post('/selected-next',{});const secondDesign=await post('/selected-next',{});assert.equal(firstDesign.value.id,'e100');assert.equal(secondDesign.value.id,'e101');
 const design=JSON.parse(readFileSync('packages/seed/src/design.json','utf8'));assert.equal(firstDesign.value.text,design.script[0].text);assert.equal(secondDesign.value.text,design.script[1].text);
 const slow = await post('/slow-advance',{accountId:'slow',script,deadlineAt:Date.now()+250});
 assert.deepEqual(slow.value,{accepted:false,expired:true});
 assert.deepEqual((await post('/slow-read',{})).value,[]);
 const parallels=await Promise.all(Array.from({length:8},(_,i)=>post('/publish',{accountId:'parallel',event:event('p'+i,{time:i?'00:01':'23:59'})})));
 assert.deepEqual(parallels.map(x=>x.value.seq).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
 assert.equal((await post('/publish',{accountId:'parallel',event:event('p0',{set:{shouldNotExist:true}})})).value.seen,true);
 assert.deepEqual(await read('parallel','/local-store'),{});assert.equal((await read('parallel','/local-events')).length,8);
 assert.equal((await post('/publish',{accountId:'separate',event:event('p0')})).value.seq,1);
 const advances=await Promise.all([post('/advance',{accountId:'advance',script}),post('/advance',{accountId:'advance',script})]);
 assert.deepEqual(advances.map(x=>x.value.event.id).sort(),['e100','e101']);
 assert.deepEqual(await read('advance','/local-store'),{stock:2,ready:true});
 assert.equal((await post('/advance',{accountId:'advance',script:[]})).value.accepted,false);
 const expired=await post('/advance',{accountId:'expired',script,deadlineAt:Date.now()-10}); assert.deepEqual(expired.value,{accepted:false,expired:true});
 assert.deepEqual(await read('expired','/local-events'),[]);assert.deepEqual(await read('expired','/seq'),{seq:0});assert.deepEqual(await read('expired','/local-store'),{});
 assert.equal((await post('/adapter-advance',{accountId:'expired',script,deadlineAt:1})).value,'The workspace write did not finish.');
 assert.equal((await post('/advance',{accountId:'future',script,deadlineAt:Date.now()+60000})).value.accepted,true);
 const expires=Math.floor(Date.now()/1000)+60;
 const token=await signMachineToken('disposable-local-key','machine','researcher',expires);
 const headers={authorization:'Bearer '+token};
 assert.equal((await post('/machine/send',{accountId:'machine',agentId:'researcher',event:event('queued')},headers)).status,200);
 for(let i=0;i<100;i++){if((await read('machine','/local-events')).some(x=>x.id==='queued'))break;await new Promise(r=>setTimeout(r,20));}
 assert.deepEqual((await post('/machine/take',{accountId:'machine',agentId:'researcher'},headers)).value.map(x=>x.id),['queued']);
 assert.deepEqual((await post('/machine/take',{accountId:'machine',agentId:'researcher'},headers)).value,[]);
 for(const body of [{accountId:'other',agentId:'researcher',event:event('forbidden')},{accountId:'machine',agentId:'other',event:event('forbidden')},{accountId:'machine',agentId:'researcher',event:event('forbidden',{from:'other'})}]) assert.equal((await post('/machine/send',body,headers)).status,401);
 const expiredToken=await signMachineToken('disposable-local-key','machine','researcher',1);
 assert.equal((await post('/machine/take',{accountId:'machine',agentId:'researcher'},{authorization:'Bearer '+expiredToken})).status,401);
 assert.equal((await post('/machine/send',{accountId:'machine',agentId:'researcher',event:{id:'invalid'}},headers)).status,400);
 for(let i=0;i<2;i++) assert.equal((await post('/queue',{queue:'local-dlq',messages:[{id:'failed',body:{accountId:'dead'}}]})).status,200);
 const dead=await read('dead','/local-events');assert.deepEqual(dead.map(x=>[x.id,x.kind,x.to]),[['dead-failed','Escalation','master']]);
 const socketResponse=await mf.dispatchFetch('http://localhost/socket?account=socket',{headers:{Upgrade:'websocket'}});const socket=socketResponse.webSocket;assert.ok(socket);socket.accept();
 const pushed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('no push')),3000);socket.addEventListener('message',e=>{clearTimeout(timer);resolve(JSON.parse(e.data));});});
 await post('/publish',{accountId:'socket',event:event('pushed')});assert.equal((await pushed).id,'pushed');socket.close();
 records.push({websocket:'pushed received',pendingAlarm:await read('socket','/alarm')});
 writeFileSync(evidence,JSON.stringify({runtime:'Miniflare/workerd, actual SQLite AccountBus, no external database',records},null,2));console.log('Recorded actual local bus responses: '+evidence);
} finally {await mf.dispose();}

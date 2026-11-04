import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import {Miniflare,NoOpLog} from 'miniflare';
import {signMachineToken} from '../packages/adapters/src/cloudflare-bus/token.ts';
const directory=resolve('apps/web/dist/server');
const built=JSON.parse(readFileSync(`${directory}/wrangler.json`,'utf8'));
const modules={};
for(const entry of readdirSync(directory,{recursive:true}))if(entry.endsWith('.js'))modules[entry]={type:'esm',contents:readFileSync(`${directory}/${entry}`,'utf8')};
const config={name:built.name,compatibilityDate:built.compatibility_date,compatibilityFlags:built.compatibility_flags,manifest:{mainModule:built.main,modulesRoot:directory,modules},env:{ADAPTERS:{type:'text',value:built.vars.ADAPTERS},MACHINE_TOKEN_KEY:{type:'text',value:'isolated-key'},ACCOUNT_BUS:{type:'durable-object',worker:built.name,exportName:'AccountBus'},BUS_QUEUE:{type:'queue',name:'tensquads-bus'}},exports:{AccountBus:{type:'durable-object',storage:'sqlite'}},triggers:built.queues.consumers.map(q=>({type:'queue',name:q.queue,deadLetterQueue:q.dead_letter_queue,maxRetries:q.max_retries}))};
const mf=new Miniflare({log:new NoOpLog(),workers:[{config}]});
const result={};
try{
 const response=await mf.dispatchFetch('http://localhost/');const html=await response.text();
 assert.equal(response.status,200);assert.ok(html.includes('tensquads'));
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6K1KRBS575JSZJ19KBMAD1N/production-homepage.html',html);
 result.homepage={status:response.status,contentType:response.headers.get('content-type')};
 const token=await signMachineToken('isolated-key','production-test','orders',Math.floor(Date.now()/1000)+3600);
 const send=async(path,body)=>{const res=await mf.dispatchFetch(`http://localhost${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});return {status:res.status,body:await res.text()};};
 const envelope={accountId:'production-test',agentId:'orders'};
 const event={id:'task',from:'orders',to:'orders',kind:'Task',skill:'test',text:'Isolated task',payload:{},writes:[]};
 result.send=await send('/machine/send',{...envelope,event});assert.equal(result.send.status,200);
 result.take=await send('/machine/take',envelope);assert.equal(JSON.parse(result.take.body)[0].id,'task');
 result.takeAgain=await send('/machine/take',envelope);assert.deepEqual(JSON.parse(result.takeAgain.body),[]);
 result.forged=await send('/machine/send',{...envelope,event:{...event,id:'forged',from:'master'}});assert.equal(result.forged.status,401);
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6K1KRBS575JSZJ19KBMAD1N/production-worker-responses.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await mf.dispose();}

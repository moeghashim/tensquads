import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6DN54VTEX6MZG45D17D2FEQ';
const results=JSON.parse(await readFile('/Users/moeghashim/.no-mistakes/evidence/01M6DN54VTEX6MZG45D17D2FEQ/live-results.json','utf8')).filter(r=>!r.name.startsWith('Finish uses')); const origin='http://127.0.0.1:55441';
async function api(path,data){const response=await fetch(origin+'/api/'+path,data===undefined?{}:{method:'POST',body:JSON.stringify(data)});return {status:response.status,value:await response.json()};}
async function state(){return (await api('state')).value;}
async function control(data){assert.equal((await api('control',data)).status,200);}
function generated(s){return s.events.filter(e=>/^e\d+$/.test(e.id));}
const ads='How did ads do this week?',reply='Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.';
async function record(name,run){const start=Date.now();try{const detail=await run();results.push({name,result:'pass',elapsedMs:Date.now()-start,...detail});}catch(e){results.push({name,result:'fail',error:e.stack});}await writeFile(evidence+'/live-results.json',JSON.stringify(results,null,2));console.log(results.at(-1));}
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await record('Finish uses original Task expiry, rolls back completion and permits next send',async()=>{
 await control({reset:true,delays:2});const begin=await api('begin',ads);assert.equal(begin.value.kind,'working');const before=await state();await control({delays:2,afterQuery:'from "bus_events"'});const finish=await api('finish',begin.value.taskId);assert.equal(finish.status,500);assert.equal(finish.value.error,'The workspace write did not finish.');assert.deepEqual(await state(),before);const next=await api('begin',ads);assert.equal(next.value.kind,'working');assert.equal((await api('finish',next.value.taskId)).value.kind,'replied');return {finish,completionUnchanged:true,nextReply:reply};
});
await record('Four delayed statements return the exact unfinished error with no persisted Task',async()=>{await control({reset:true,delays:4});const before=await state();const start=Date.now();const begin=await api('begin',ads);assert.equal(begin.status,500);assert.equal(begin.value.error,'The workspace write did not finish.');assert.deepEqual(await state(),before);return {begin,elapsed:Date.now()-start,noWrites:true};});
await browser.close();if(results.some(r=>r.result==='fail'))process.exitCode=1;

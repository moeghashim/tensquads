import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6ECTYVV78E1D9B09SS3DVZM';
const origin='http://127.0.0.1:3107';
const browser=await chromium.launch({headless:true});
const results=[];const timeline=[];let page;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function admin(data={}) {const response=await fetch(origin+'/__validation',{method:'POST',body:JSON.stringify(data)});assert.equal(response.status,200,await response.clone().text());return response.json();}
const generated=s=>s.events.filter(e=>/^e\d+$/.test(e.id)).sort((a,b)=>a.seq-b.seq);
const details=()=>page.getByRole('complementary',{name:'Message details'});
const send=()=>page.getByRole('button',{name:'Send next event'});
let errors=[];
async function fresh(){if(page)await page.close();page=await browser.newPage({viewport:{width:1440,height:1500}});errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/traffic');await expect(page.getByRole('heading',{name:'Squad traffic',exact:true})).toBeVisible();await page.waitForFunction(()=>{const e=document.querySelector('[data-handler="simulate"]');return e&&Object.keys(e).some(k=>k.startsWith('__reactProps'));});await admin({reset:true});await page.reload();await page.waitForFunction(()=>{const e=document.querySelector('[data-handler="simulate"]');return e&&Object.keys(e).some(k=>k.startsWith('__reactProps'));});}
function cleanReact(){assert.deepEqual(errors.filter(e=>/Cannot update a component|rendering a different component|Maximum update depth|Too many re-renders/i.test(e)),[]);}
async function scenario(name,run){try{await run();results.push({name,result:'pass',live:true,evidence:'extra-live-results.json and extra-live-transcript.txt',reason:''});console.log('PASS',name);}catch(e){results.push({name,result:'fail',live:true,evidence:'extra-live-results.json and extra-live-transcript.txt',reason:String(e)});console.log('FAIL',name,e.stack);await page?.screenshot({path:evidence+'/failure-'+results.length+'.png',fullPage:true});}writeFileSync(evidence+'/extra-live-results.json',JSON.stringify({setup:'Actual TanStack app and server functions. Test-only requireWorkspace uses an isolated migrated PGlite database; Clerk and Neon connections are not exercised.',results,timeline},null,2));}

await scenario('Workspace lookup time counts toward the same deadline before the event read',async()=>{
 await fresh();const before=await admin();await admin({lookupDelay:31000});const start=Date.now();await send().click();await sleep(32000);const after=await admin();assert.deepEqual(after.events,before.events);assert.deepEqual(after.store,before.store);assert.deepEqual(after.cursor,before.cursor);assert.equal(after.controls.transactionStarts,0);timeline.push({scenario:'late-workspace-lookup',elapsed:Date.now()-start,before,after});await send().click();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(1);cleanReact();
});
await scenario('A late Result rolls back a changed shared-state value as well as its event and cursor',async()=>{
 await fresh();await send().click();await expect.poll(async()=>generated(await admin()).length).toBe(1);await expect(details()).toContainText('Daily stock check');await admin({stockSentinel:'rollback-sentinel'});const before=await admin();await admin({readDelay:20000,writeDelay:11000});await send().click();await sleep(33000);const after=await admin();assert.deepEqual(after.events,before.events);assert.deepEqual(after.store,before.store);assert.deepEqual(after.cursor,before.cursor);assert.ok(after.controls.log.some(e=>e.stage==='after-insert-delay'));assert.equal(JSON.parse(after.store.find(e=>e.key==='inventory.low_stock').value),'rollback-sentinel');timeline.push({scenario:'late-result-state-rollback',before,after});await send().click();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(2);await expect(details()).toContainText('2 products under 10');const committed=await admin();assert.notEqual(committed.store.find(e=>e.key==='inventory.low_stock').value,JSON.stringify('rollback-sentinel'));cleanReact();await page.screenshot({path:evidence+'/rollback-recovery.png',fullPage:true});
});
await scenario('Nine queued clicks wrap the eight-event script with unique ids and updated state',async()=>{
 await fresh();for(let i=0;i<9;i++)await send().click();await expect.poll(async()=>generated(await admin()).length,{timeout:20000}).toBe(9);const state=await admin();assert.deepEqual(generated(state).map(e=>e.id),Array.from({length:9},(_,i)=>'e'+(100+i)));assert.equal(generated(state).at(-1).body,'Daily stock check');await expect(details()).toContainText('Daily stock check');cleanReact();timeline.push({scenario:'script-wrap',state});
});
await scenario('If the selected id disappears, the inspector shows the last available event',async()=>{
 await fresh();await page.locator('[data-event-id="e1056financemaster"]').click();await expect(details()).toContainText('Last 7 days');await admin({deleteId:'e1056financemaster'});await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Squad traffic',exact:true}).click();await expect(details()).toContainText('Refund $42 on #A-1012');cleanReact();
});
await scenario('A caller without a deadline receives a fresh window and commits one event',async()=>{
 await fresh();const state=await admin({defaultAdvance:true});assert.equal(generated(state).length,1);assert.equal(generated(state)[0].body,'Daily stock check');timeline.push({scenario:'no-explicit-deadline',state});
});
await browser.close();console.log(JSON.stringify(results,null,2));

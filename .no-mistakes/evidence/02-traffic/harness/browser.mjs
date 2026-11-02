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
async function scenario(name,run){try{await run();results.push({name,result:'pass',live:true,evidence:'live-results.json and live-transcript.txt',reason:''});console.log('PASS',name);}catch(e){results.push({name,result:'fail',live:true,evidence:'live-results.json and live-transcript.txt',reason:String(e)});console.log('FAIL',name,e.stack);await page?.screenshot({path:evidence+'/failure-'+results.length+'.png',fullPage:true});}writeFileSync(evidence+'/live-results.json',JSON.stringify({setup:'Actual TanStack app and server functions. Test-only requireWorkspace uses an isolated migrated PGlite database; Clerk and Neon connections are not exercised.',results,timeline},null,2));}
await scenario('Open traffic, inspect an event, and filter without losing the inspector',async()=>{
 await fresh();assert.equal((await admin()).events.length,9);await expect(details()).toContainText('Sweatshirt shipped');
 await page.getByRole('region',{name:'Squad map'}).getByRole('button',{name:'Inventory'}).click();await expect(page.locator('[data-event-id]')).toHaveCount(0);await expect(details()).toContainText('Sweatshirt shipped');
 await page.getByRole('region',{name:'Squad map'}).getByRole('button',{name:'Inventory'}).click();await expect(page.locator('[data-event-id]')).toHaveCount(9);
 await page.locator('[data-event-id]').filter({hasText:'Last 7 days'}).click();await expect(details().locator('pre')).toContainText('"revenue": 8420');cleanReact();
 await page.screenshot({path:evidence+'/traffic-1440.png',fullPage:true});await page.setViewportSize({width:390,height:1500});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await page.screenshot({path:evidence+'/traffic-390.png',fullPage:true});
});
await scenario('Three rapid Send clicks commit three ordered events and select the newest',async()=>{
 await fresh();let release;let posts=0;let active=0;let maxActive=0;const held=new Promise(r=>release=r);
 await page.route('**/*',async route=>{if(route.request().method()==='POST'&&route.request().headers()['x-tsr-serverfn']==='true'){posts++;active++;maxActive=Math.max(maxActive,active);if(posts===1)await held;await route.continue();active--;}else await route.continue();});
 await send().click();await send().click();await send().click();await sleep(400);assert.equal(posts,1);release();
 await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(3);await expect(details()).toContainText('Customer asks if #A-1019 has shipped');
 const state=await admin();assert.deepEqual(generated(state).map(e=>e.id),['e100','e101','e102']);assert.equal(posts,3);assert.equal(maxActive,1);cleanReact();timeline.push({scenario:'rapid-clicks',posts,maxActive,events:generated(state),store:state.store,cursor:state.cursor});await page.screenshot({path:evidence+'/queued-clicks.png',fullPage:true});
});
await scenario('A failed advance refreshes and the next queued click still commits',async()=>{
 await fresh();let release;let posts=0;let gets=0;const held=new Promise(r=>release=r);
 await page.route('**/*',async route=>{const req=route.request();if(req.headers()['x-tsr-serverfn']==='true'){if(req.method()==='POST'){posts++;if(posts===1){await held;await route.abort('failed');return;}}else gets++;}await route.continue();});
 await send().click();await send().click();await sleep(200);assert.equal(posts,1);release();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(1);await expect(details()).toContainText('Daily stock check');assert.equal(posts,2);assert.ok(gets>=2);cleanReact();timeline.push({scenario:'failed-advance',posts,gets,state:await admin()});
});
await scenario('Live ticks while clicks are pending are skipped and do not pile up',async()=>{
 await fresh();await page.clock.install();await page.clock.pauseAt(new Date());let release;const held=new Promise(r=>release=r);let posts=0;
 await page.route('**/*',async route=>{if(route.request().method()==='POST'&&route.request().headers()['x-tsr-serverfn']==='true'){posts++;if(posts===1)await held;}await route.continue();});
 await page.getByRole('button',{name:'Paused',exact:true}).click();await send().click();await send().click();await page.clock.fastForward(14000);await sleep(200);assert.equal(posts,1);release();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(2);await sleep(300);assert.equal(posts,2);
 await page.clock.fastForward(3500);await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(3);await expect(details()).toContainText('Customer asks if #A-1019 has shipped');await page.getByRole('button',{name:'Live',exact:true}).click();await page.clock.fastForward(14000);await sleep(200);assert.equal(posts,3);cleanReact();timeline.push({scenario:'live-no-pileup',posts,state:await admin()});
});
await scenario('Live commits away from traffic and selects that event when traffic is reopened',async()=>{
 await fresh();await page.clock.install();await page.clock.pauseAt(new Date());await page.getByRole('button',{name:'Paused',exact:true}).click();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();await expect(page).toHaveURL(/overview$/);await page.clock.fastForward(3500);await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(1);await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Squad traffic',exact:true}).click();await expect(details()).toContainText('Daily stock check');await page.getByRole('button',{name:'Live',exact:true}).click();cleanReact();timeline.push({scenario:'live-away',state:await admin()});
});
await scenario('A successful advance with a hung refresh releases the guard after 30 seconds',async()=>{
 await fresh();await page.clock.install();await page.clock.pauseAt(new Date());let posts=0;let gets=0;let release;const held=new Promise(r=>release=r);let holding=true;
 await page.route('**/*',async route=>{const req=route.request();if(req.headers()['x-tsr-serverfn']==='true'){if(req.method()==='POST')posts++;else {gets++;if(holding)await held;}}await route.continue();});
 await send().click();await expect.poll(async()=>generated(await admin()).length).toBe(1);await expect.poll(()=>gets).toBeGreaterThan(0);await send().click();await page.clock.fastForward(29999);await sleep(100);assert.equal(posts,1);holding=false;await page.clock.fastForward(1);await expect.poll(()=>posts).toBe(2);release();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(2);await expect(details()).toContainText('2 products under 10');cleanReact();timeline.push({scenario:'hung-refresh',posts,gets,state:await admin()});
});
await scenario('A hung advance followed by a hung refresh releases queued clicks within 60 seconds',async()=>{
 await fresh();await page.clock.install();await page.clock.pauseAt(new Date());let posts=0;let gets=0;let releasePost,releaseGet;const heldPost=new Promise(r=>releasePost=r);const heldGet=new Promise(r=>releaseGet=r);let holding=true;
 await page.route('**/*',async route=>{const req=route.request();if(req.headers()['x-tsr-serverfn']==='true'){if(req.method()==='POST'){posts++;if(posts===1){await heldPost;await route.abort();return;}}else{gets++;if(holding)await heldGet;}}await route.continue();});
 await send().click();await send().click();await expect.poll(()=>posts).toBe(1);await page.clock.fastForward(30000);await expect.poll(()=>gets).toBeGreaterThan(0);await page.clock.fastForward(29999);await sleep(100);assert.equal(posts,1);holding=false;await page.clock.fastForward(1);await expect.poll(()=>posts).toBe(2);releasePost();releaseGet();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(1);await expect(details()).toContainText('Daily stock check');cleanReact();timeline.push({scenario:'60-second-bound',posts,gets,state:await admin()});
});
await scenario('An advance whose pre-transaction read exceeds its deadline commits nothing',async()=>{
 await fresh();const before=await admin();await admin({readDelay:31000});const start=Date.now();await send().click();await sleep(32000);const after=await admin();assert.deepEqual(after.events,before.events);assert.deepEqual(after.store,before.store);assert.deepEqual(after.cursor,before.cursor);assert.equal(after.controls.transactionStarts,before.controls.transactionStarts);timeline.push({scenario:'late-read',elapsed:Date.now()-start,before,after});await send().click();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(1);cleanReact();
});
await scenario('A write exceeding the original deadline rolls back its event, state writes, and cursor',async()=>{
 await fresh();await send().click();await expect.poll(async()=>generated(await admin()).length).toBe(1);await expect(details()).toContainText('Daily stock check');const before=await admin();await admin({readDelay:20000,writeDelay:11000});const start=Date.now();await send().click();await sleep(33000);const after=await admin();assert.deepEqual(after.events,before.events);assert.deepEqual(after.store,before.store);assert.deepEqual(after.cursor,before.cursor);assert.ok(after.controls.log.some(e=>e.stage==='after-insert-delay'));timeline.push({scenario:'late-write',elapsed:Date.now()-start,before,after});await send().click();await expect.poll(async()=>generated(await admin()).length,{timeout:15000}).toBe(2);await expect(details()).toContainText('2 products under 10');cleanReact();
});
await scenario('Fewer than four milliseconds remaining rejects before opening a transaction',async()=>{
 await fresh();const result=await admin({directRemainder:3});assert.equal(result.error,'The workspace write did not finish.');assert.equal(result.transactions,0);assert.equal(generated(await admin()).length,0);timeline.push({scenario:'three-ms-boundary',result});
});
await browser.close();console.log(JSON.stringify(results,null,2));

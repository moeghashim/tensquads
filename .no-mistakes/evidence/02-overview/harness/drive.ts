import { chromium, expect } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { installPinnedFonts } from '../e2e/fonts.ts';
import { renderDesignMarkup } from '../scripts/render-design.mjs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6E90HCJ2TVF0P0ZWYPHKXJ1';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(); await installPinnedFonts(page,true);
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const results:any[]=[];
const base='http://127.0.0.1:3107';
const control=async(action='state')=>{const r=await context.request.get(`${base}/__test?action=${action}`);expect(r.status()).toBe(200);return r.json()};
const open=async()=>{await page.goto(`${base}/overview`);await expect(page.locator('main h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(e=>Object.keys(e).some(k=>k.startsWith('__reactProps'))));await page.waitForLoadState('networkidle');};
const snap=async(name:string)=>page.screenshot({path:`${evidence}/${name}.png`,fullPage:true});
const tasks=()=>page.locator("main [data-loop='kpis'] > div").filter({hasText:'Tasks done by squads'});
const approvals=()=>page.locator("main [data-loop='approvals'] > div");
const badge=()=>page.locator("[data-if='dockUnread']");
const events=(s:any)=>s.events.filter((e:any)=>/^e\d+$/.test(e.id));
const run=async(name:string,work:()=>Promise<any>)=>{try{const detail=await work();results.push({name,result:'pass',detail});console.log('PASS '+name)}catch(e){results.push({name,result:'fail',error:String(e)});await snap('failure-'+results.length);console.log('FAIL '+name+' '+e)}};
await run('Seeded overview at 1440 and 390 matches design layout and computed figures',async()=>{
 const state=await control('reset');await open();
 await expect(page.locator('main h1')).toHaveText('Good morning, Moe');
 await expect(page.locator("main [data-loop='kpis'] > div")).toHaveCount(6);
 await expect(page.locator("main [data-loop='bars']").first().locator('> div')).toHaveCount(14);
 await expect(approvals()).toHaveCount(3);
 await expect(page.locator("main [data-loop='agents'] > button")).toHaveCount(5);
 await expect(tasks()).toContainText('331'); await expect(badge()).toHaveText('4');
 expect(state.tiles.flatMap((r:any)=>r.tiles).some((t:any)=>t.label==='Tasks done by squads')).toBe(false);
 expect(state.overview.tiles.map((t:any)=>t.value)).toEqual(['$8,420','186','$45.27','31%','331','34h']);
 await expect(page.locator('[data-design-contrast]')).toHaveText('4 of 5 squads online');
 const pill=await page.locator('[data-design-contrast]').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
 expect(pill).toEqual({color:'rgb(0, 134, 53)',background:'rgba(4, 184, 76, 0.08)'});
 const measurements=[];
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:width===1440?900:844});await snap(`overview-${width}`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const design=await context.newPage();await installPinnedFonts(design,true);await design.setViewportSize({width,height:width===1440?900:844});
 const inventory=JSON.parse(readFileSync('design/inventory/Main.json','utf8'));
 const markup=await renderDesignMarkup(design,inventory,{view:'overview',dockOpen:false});
 const source=readFileSync('design/Main.dc.html','utf8');const css=source.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
 await design.setContent(`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${markup}</body></html>`);
 await design.locator('[data-handler="goAdmin"]').evaluate(e=>e.remove());
 await design.evaluate(()=>{for(const n of document.querySelectorAll('[data-loop],[data-if]'))(n as HTMLElement).style.display='contents'});
 await design.evaluate(()=>document.fonts.ready);
 await design.screenshot({path:`${evidence}/design-${width}.png`,fullPage:true});
 const boxes=async(p:any)=>p.locator("main [data-loop='kpis'] > div, main [data-loop='agents'] > button").evaluateAll((es:any)=>es.map((e:any)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
 const built=await boxes(page),expected=await boxes(design);expect(built.length).toBe(11);expect(expected.length).toBe(11);
 for(let i=0;i<built.length;i++)for(const k of ['x','y','width','height'])expect(Math.abs(built[i][k]-expected[i][k]),`${width} box ${i} ${k}`).toBeLessThanOrEqual(.5);
 measurements.push({width,built,design:expected});await design.close();
 }
 await page.setViewportSize({width:1440,height:900});
 return {computed:state.overview.tiles,online:state.overview.online,pill,measurements};
});
await run('Approve refreshes tasks, card and badge and records exactly one Mandate and event',async()=>{
 await control('reset');await open();const before=await control();expect(before.mandates.length).toBe(0);
 await page.locator('main').getByRole('button',{name:'Approve',exact:true}).first().dblclick();
 await expect(tasks()).toContainText('332',{timeout:15000});await expect(badge()).toHaveText('3',{timeout:15000});
 await expect(approvals()).toHaveCount(2);await expect(page.locator("main [data-loop='agents'] > button").filter({hasText:'Support'})).toContainText('Refund $42 on #A-1012 (approved)');
 const state=await control();expect(events(state).length).toBe(1);expect(events(state)[0].kind).toBe('Approval');expect(events(state)[0].payload.by).toBe('Moe');
 expect(state.mandates.length).toBe(1);expect(state.mandates[0]).toMatchObject({approvalId:'ap1',ruleId:'r1',limitValue:50,saidYes:'Moe'});expect(state.mandates[0].policyVersion).toMatch(/^policy-/);
 expect(state.state.find((s:any)=>s.key==='approvals.ap1').value).toBe('"approved"');
 await snap('approved');await page.reload();await expect(tasks()).toContainText('332');return {mandate:state.mandates,events:events(state),support:state.agents.find((a:any)=>a.id==='support')};
});
await run('Decline by keyboard removes the item without changing the agent or creating a Mandate',async()=>{
 await control('reset');await open();const before=await control();const card=approvals().filter({hasText:'Raise prints ad set to $60 a day'});await card.getByRole('button',{name:'Decline',exact:true}).focus();await page.keyboard.press('Enter');await expect(card).toHaveCount(0,{timeout:15000});
 const state=await control();expect(state.agents.find((a:any)=>a.id==='marketing')).toEqual(before.agents.find((a:any)=>a.id==='marketing'));expect(state.mandates.length).toBe(0);expect(events(state).map((e:any)=>e.kind)).toEqual(['Declined']);return {events:events(state),marketing:state.agents.find((a:any)=>a.id==='marketing')};
});
await run('Approve mission then clear remaining approvals shows the empty inbox with no badge',async()=>{
 await control('reset');await open();await page.locator('main').getByRole('button',{name:'Approve mission',exact:true}).click();await expect(badge()).toHaveText('3',{timeout:15000});
 const inv=page.locator("main [data-loop='agents'] > button").filter({hasText:'Inventory'});await expect(inv).toContainText('Never run out of a top-20 product');await expect(inv).toContainText('0% done');await expect(inv).toContainText('31');
 const mission=await control();expect(events(mission).length).toBe(0);expect(mission.agents.find((a:any)=>a.id==='inventory').targets).toEqual([['Stock-outs','—','0'],['Days of stock','—','under 30'],['Reorders approved in time','—','100%']]);
 for(const left of [2,1,0]){await page.locator('main').getByRole('button',{name:'Decline',exact:true}).first().click();await expect(approvals()).toHaveCount(left,{timeout:15000})}
 await expect(page.locator('main')).toContainText('Nothing waiting. Your squads are working inside their limits.');await expect(badge()).toHaveCount(0);await snap('empty-inbox');return {mission:mission.agents.find((a:any)=>a.id==='inventory'),final:(await control()).overview};
});
await run('Request revision leaves its card even after all decisions are cleared',async()=>{
 await control('reset');await open();await page.locator('main').getByRole('button',{name:'Ask for another'}).click();await expect(badge()).toHaveText('3',{timeout:15000});await expect(page.locator('main')).toContainText('Revised mission on its way');
 for(const left of [2,1,0]){await page.locator('main').getByRole('button',{name:'Decline',exact:true}).first().click();await expect(approvals()).toHaveCount(left,{timeout:15000})}
 await expect(page.locator("main [data-loop='missionProposals'] > div")).toHaveCount(1);await expect(page.locator('main')).not.toContainText('Nothing waiting.');await expect(page.locator('main')).toContainText('Master is writing a new proposal.');await expect(page.locator('main').getByRole('button',{name:'Approve mission'})).toHaveCount(0);await snap('revising');return (await control()).overview;
});
await run('No-store and blank records retain empty layout, dashes, delta height and pending mission copy',async()=>{
 await control('reset');await control('no-store');await open();
 const data=(await control()).overview;expect(data.tiles.map((t:any)=>t.value)).toEqual(['—','—','—','—','0','—']);await expect(page.locator("main [data-loop='bars']").first().locator('> div')).toHaveCount(0);await expect(page.locator('main')).toContainText('Revenue, last 14 days');await expect(page.locator('main')).toContainText('Previous week');
 const track=await page.locator("main [data-loop='bars']").first().evaluate(e=>e.parentElement!.getBoundingClientRect().height);expect(track).toBe(201);await snap('no-store');
 await control('reset');await control('blank');await open();await expect(page.locator('main h1')).toHaveText('Good morning, —');
 const orders=page.locator("main [data-loop='kpis'] > div").filter({hasText:'Orders'});await expect(orders.locator('> span').nth(1)).toHaveText('—');expect(await orders.locator('> span').nth(2).textContent()).toBe('\u00a0');expect(await orders.locator('> span').nth(2).evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(0);
 await expect(page.locator("main [data-loop='mp.targetChips'] > span")).toHaveText(['—','Stock-outs: 0','Label: ',': Goal']);await expect(page.locator("main [data-loop='missionProposals'] > div")).toContainText('Mission pending. Your Master will propose one.');await snap('blank-fields');
 const blank=(await control()).overview;await control('email');await page.reload();await expect(page.locator('main h1')).toHaveText('Good morning, sara');return {noStore:data,blank,trackHeight:track};
});
await run('Traffic and all five agent cards navigate to their real routes',async()=>{
 await control('reset');await open();await page.locator('main').getByRole('button',{name:'See squad traffic'}).click();await expect(page).toHaveURL(/\/traffic$/);await expect(page).toHaveTitle('Agent traffic');
 const paths=[new URL(page.url()).pathname];for(const id of ['orders','support','marketing','finance','inventory']){await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();const name=id[0].toUpperCase()+id.slice(1);await page.locator("main [data-loop='agents'] > button").filter({hasText:name}).click();await expect(page).toHaveURL(new RegExp(`/agents/${id}$`));await expect(page).toHaveTitle('Agent dashboard');paths.push(new URL(page.url()).pathname)}return paths;
});
await run('Missing policy rule or limit rolls back and refreshes silently; a later click still works',async()=>{
 const cases=[];for(const action of ['missing-rule','missing-limit']){
 await control('reset');await control(action);await open();const before=await control();
 const post=page.waitForResponse(r=>r.request().method()==='POST');await page.locator('main').getByRole('button',{name:'Approve',exact:true}).first().click();await post;
 await expect(approvals()).toHaveCount(3);await expect(tasks()).toContainText('331');await expect(badge()).toHaveText('4');
 const state=await control();expect(state.approvals).toEqual(before.approvals);expect(state.agents).toEqual(before.agents);expect(state.mandates.length).toBe(0);expect(events(state).length).toBe(0);
 // Refresh must finish before the guard clears. Observe its loader requests settling through the following DOM update.
 await page.waitForLoadState('networkidle');
 await page.locator('main').getByRole('button',{name:'Decline',exact:true}).first().click();await expect(approvals()).toHaveCount(2,{timeout:15000});await expect(badge()).toHaveText('3');cases.push({action,rolledBack:state.approvals,after:(await control()).overview.count});
 }await snap('failed-write-recovered');return cases;
});
writeFileSync(`${evidence}/overview-scenarios.json`,JSON.stringify({setup:'Real TanStack routes, server functions, React UI, repositories and Kernel; disposable PGlite database and test-only workspace identity boundary. Clerk authentication and Cloudflare runtime are excluded.',results,errors},null,2));
await browser.close();if(results.some(r=>r.result==='fail'))process.exitCode=1;

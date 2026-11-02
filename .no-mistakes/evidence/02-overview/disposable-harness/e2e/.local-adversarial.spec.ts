import {test,expect,openWorkspace} from './.local-workspace.ts';
import {writeFileSync} from 'node:fs';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6ES7TDTX6YVPWJTWJ0XP5ZC';
const refund=p=>p.locator("main [data-loop='approvals'] > div").filter({hasText:'Refund $42'});
const prints=p=>p.locator("main [data-loop='approvals'] > div").filter({hasText:'Raise prints'});
const badge=p=>p.locator("[data-if='dockUnread']");
const count=p=>p.locator("main section[aria-label='Needs you'] h2 + span");
const state=()=>fetch('http://127.0.0.1:3000/__test/state').then(r=>r.json());
const gate=()=>{let release;const promise=new Promise<void>(r=>release=r);return {promise,release:()=>release()};};
const fn=r=>{try{return JSON.parse(Buffer.from(new URL(r.url()).pathname.split('/').at(-1),'base64').toString()).export??'';}catch{return '';}};
test.afterEach(async({page},info)=>{await page.screenshot({path:dir+'/'+info.title.replace(/[^a-z0-9]+/gi,'-')+'.png',fullPage:true});});

test('lost response reconciles to committed server state while next card remains pending',async({page,workspaceUser})=>{
 await openWorkspace(page,workspaceUser);const first=gate(),second=gate();let posts=0;
 await page.route('**/_serverFn/**',async route=>{if(route.request().method()!=='POST')return route.continue();posts++;if(posts===1){await first.promise;await route.fetch();await route.abort('failed');}else{await second.promise;await route.continue();}});
 await refund(page).getByRole('button',{name:'Approve',exact:true}).click();await prints(page).getByRole('button',{name:'Decline',exact:true}).click();
 await expect(badge(page)).toHaveText('2');first.release();await expect.poll(()=>posts).toBe(2);
 await expect(count(page)).toHaveText('2');await expect(badge(page)).toHaveText('2');await expect(refund(page)).toHaveCount(0);await expect(prints(page)).toHaveCount(0);
 await page.screenshot({path:dir+'/lost-response-second-pending.png',fullPage:true});
 second.release();await expect.poll(async()=>((await state()).approvals.find(x=>x.id==='ap2').status)).toBe('Declined');
 const rows=await state();writeFileSync(dir+'/lost-response-state.json',JSON.stringify(rows,null,2));
 expect(rows.mandates.filter(x=>x.approval_id==='ap1')).toHaveLength(1);
});

test('timed out refresh later restores failed card and preserves second in flight card',async({page,workspaceUser})=>{
 test.setTimeout(60000);await openWorkspace(page,workspaceUser);const read=gate(),second=gate();let posts=0,reads=0;
 await page.route('**/_serverFn/**',async route=>{const r=route.request();if(r.method()==='POST'){posts++;if(posts===1)return route.fulfill({status:500,body:'injected transport failure'});await second.promise;return route.continue();}if(fn(r).startsWith('loadOverview')){reads++;await read.promise;}await route.continue();});
 await refund(page).getByRole('button',{name:'Approve',exact:true}).click();await expect.poll(()=>reads).toBe(1);
 await prints(page).getByRole('button',{name:'Decline',exact:true}).click();
 await expect.poll(()=>posts,{timeout:35000}).toBe(2);
 await expect(refund(page)).toHaveCount(0);await expect(prints(page)).toHaveCount(0);await expect(badge(page)).toHaveText('2');
 await page.screenshot({path:dir+'/refresh-timeout-retained-patches.png',fullPage:true});
 read.release();await expect(refund(page)).toHaveCount(1);await expect(prints(page)).toHaveCount(0);await expect(count(page)).toHaveText('3');await expect(badge(page)).toHaveText('3');
 await page.screenshot({path:dir+'/fresh-read-restored-card-with-pending-second.png',fullPage:true});
 second.release();await expect.poll(async()=>((await state()).approvals.find(x=>x.id==='ap2').status)).toBe('Declined');
});

test('overview inbox and dock agree while a chat send freezes frame count',async({page,workspaceUser})=>{
 await openWorkspace(page,workspaceUser);const finish=gate();let finishing=false;
 await page.route('**/_serverFn/**',async route=>{if(fn(route.request()).startsWith('finishWorkspaceSend')){finishing=true;await finish.promise;}await route.continue();});
 await page.locator("button[data-handler='toggleDock'][aria-expanded]").click();await page.locator('#dock-input').fill('Any refunds waiting?');await page.locator('#dock-input').press('Enter');
 await expect.poll(()=>finishing).toBe(true);await page.locator("button[data-handler='toggleDock'][aria-expanded]").click();
 await refund(page).getByRole('button',{name:'Approve',exact:true}).click();
 await expect.poll(async()=>((await state()).approvals.find(x=>x.id==='ap1').status)).toBe('Approved');
 await expect(count(page)).toHaveText('3');await expect(badge(page)).toHaveText('3');
 await page.screenshot({path:dir+'/badge-during-frozen-send.png',fullPage:true});finish.release();
 await expect.poll(async()=>((await state()).bus_events.filter(x=>x.kind==='Result').length)).toBeGreaterThan(0);
});

test('late approval rolls back its row task event and Mandate then recovers after reload',async({page,workspaceUser})=>{
 test.setTimeout(60000);await openWorkspace(page,workspaceUser);expect((await fetch('http://127.0.0.1:3000/__test/delay-next')).status).toBe(200);
 await refund(page).getByRole('button',{name:'Approve',exact:true}).click();await expect(badge(page)).toHaveText('3');
 await expect(refund(page)).toHaveCount(1,{timeout:45000});await expect(badge(page)).toHaveText('4');
 const rows=await state();expect(rows.approvals.find(x=>x.id==='ap1').status).toBe('Pending');expect(rows.mandates).toHaveLength(0);expect(rows.agents.find(x=>x.id==='support').tasks).toBe(96);expect(rows.bus_events.filter(x=>x.kind==='Approval')).toHaveLength(0);
 writeFileSync(dir+'/late-approval-rollback-state.json',JSON.stringify(rows,null,2));await page.reload();await expect(refund(page)).toHaveCount(1);await expect(count(page)).toHaveText('4');await expect(badge(page)).toHaveText('4');
});

test('four rapid card decisions run with three waiting jobs in click order',async({page,workspaceUser})=>{
 await openWorkspace(page,workspaceUser);const first=gate();const bodies=[];let done=0;
 page.on('response',r=>{if(r.request().method()==='POST'&&r.ok())done++;});
 await page.route('**/_serverFn/**',async route=>{const r=route.request();if(r.method()!=='POST')return route.continue();bodies.push(r.postData()??'');if(bodies.length===1)await first.promise;await route.continue();});
 await refund(page).getByRole('button',{name:'Approve',exact:true}).click();
 await prints(page).getByRole('button',{name:'Decline',exact:true}).click();
 await page.locator('main').getByRole('button',{name:'Ask for another',exact:true}).click();
 await page.locator("main [data-loop='approvals'] > div").filter({hasText:'Reorder 50'}).getByRole('button',{name:'Decline',exact:true}).click();
 await expect(count(page)).toHaveText('0');await expect(badge(page)).toHaveCount(0);expect(bodies).toHaveLength(1);
 await page.screenshot({path:dir+'/four-clicks-first-write-held.png',fullPage:true});first.release();
 await expect.poll(()=>done).toBe(4);expect(bodies).toHaveLength(4);
 for(const [i,id] of ['ap1','ap2','mp-inventory','ap3'].entries())expect(bodies[i]).toContain(id);
 writeFileSync(dir+'/four-click-order.json',JSON.stringify({bodies,state:await state()},null,2));
});

test('late mission decision rolls back the proposal and agent',async({page,workspaceUser})=>{
 test.setTimeout(60000);await openWorkspace(page,workspaceUser);expect((await fetch('http://127.0.0.1:3000/__test/delay-next')).status).toBe(200);
 await page.locator('main').getByRole('button',{name:'Approve mission',exact:true}).click();await expect(badge(page)).toHaveText('3');
 await expect(page.locator('main').getByRole('button',{name:'Approve mission',exact:true})).toHaveCount(1,{timeout:45000});
 const rows=await state();expect(rows.mission_proposals[0].status).toBe('Proposed');expect(rows.agents.find(x=>x.id==='inventory').tasks).toBe(31);expect(rows.agents.find(x=>x.id==='inventory').mission).toBe('');expect(rows.mandates).toHaveLength(0);await expect(badge(page)).toHaveText('4');writeFileSync(dir+'/late-mission-rollback-state.json',JSON.stringify(rows,null,2));
});

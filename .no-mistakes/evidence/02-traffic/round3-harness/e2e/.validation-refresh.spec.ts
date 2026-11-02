import { test, expect, generatedEvents, openWorkspace } from '../.traffic-validation/workspace.ts';
for (const action of ['send', 'live']) {
 for (const stallAdvance of [false,true]) {
  test(`${action} resumes after hung refresh following ${stallAdvance ? 'timed-out' : 'successful'} advance without reload`, async ({page,workspaceUser,accountId})=>{
   test.setTimeout(90000);
   await openWorkspace(page,workspaceUser);
   await page.clock.install();
   await page.reload();
   await page.goto('/traffic');
   const holds: (()=>void)[]=[];
   let postCount=0, heldReads=0, blockReads=true;
   await page.route('**/_serverFn/**',async route=>{
    const req=route.request();
    if(req.method()==='POST') {
     postCount++;
     if(stallAdvance && postCount===1) {await new Promise<void>(resolve=>holds.push(resolve));await route.abort().catch(()=>{});return;}
    } else if(req.method()==='GET' && blockReads) {
     heldReads++;await new Promise<void>(resolve=>holds.push(resolve));await route.continue().catch(()=>{});return;
    }
    await route.continue();
   });
   try {
    if(action==='send') await page.getByRole('button',{name:'Send next event'}).click();
    else {await page.getByRole('button',{name:'Paused',exact:true}).click();await page.clock.fastForward(3500);}
    await expect.poll(()=>postCount).toBe(1);
    if(stallAdvance) await page.clock.fastForward(30100);
    await expect.poll(()=>heldReads).toBeGreaterThan(0);
    const before=(await generatedEvents(accountId)).length;
    await page.getByRole('button',{name:'Send next event'}).click();
    expect(postCount).toBe(1);
    blockReads=false;
    await page.clock.fastForward(30100);
    if(action==='send') await page.getByRole('button',{name:'Send next event'}).click();
    else await page.clock.fastForward(3500);
    await expect.poll(()=>postCount).toBeGreaterThanOrEqual(2);
    await expect.poll(async()=>(await generatedEvents(accountId)).length).toBeGreaterThan(before);
    console.log(JSON.stringify({action,stallAdvance,heldReads,posts:postCount,before,after:(await generatedEvents(accountId)).length,recoveredWithoutReload:true}));
   } finally {blockReads=false;for(const release of holds)release();await page.unrouteAll({behavior:'ignoreErrors'});}
  });
 }
}

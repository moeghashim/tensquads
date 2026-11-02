import { test, expect } from '../.traffic-validation/workspace.ts';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ';
test('missing agent shows its id and does not create a hub node',async({page,request})=>{
 expect((await request.get('/__test/reset?mode=missing')).ok()).toBe(true);
 await page.goto('/traffic');
 const hub=page.getByRole('region',{name:'Squad map'});
 await expect(hub.getByRole('button',{name:'Orders',exact:false})).toHaveCount(0);
 await expect(hub.getByRole('button')).toHaveCount(4);
 await expect(page.getByRole('complementary',{name:'Message details'}).getByText('orders → Master',{exact:true})).toBeVisible();
 await page.screenshot({path:`${evidence}/round3-missing-agent.png`,fullPage:true});
});
test('repeated event id changes neither event history nor shared state nor cursor',async({page,request})=>{
 const inserted=await request.get('/__test/duplicate');expect(inserted.ok()).toBe(true);
 const before=await (await request.get('/__test/snapshot')).json();
 expect(before.events.some(row=>row.id==='e100')).toBe(true);
 await page.goto('/traffic');
 const completed=page.waitForResponse(res=>res.request().method()==='POST'&&res.request().headers()['x-tsr-serverfn']==='true');
 await page.getByRole('button',{name:'Send next event'}).click();
 expect((await completed).ok()).toBe(true);
 const after=await (await request.get('/__test/snapshot')).json();
 expect(after).toEqual(before);
 console.log(JSON.stringify({duplicateId:'e100',events:after.events.length,historyUnchanged:true,storeUnchanged:true,cursorUnchanged:true}));
});
test('empty bus keeps blank inspector cards and the shared state table',async({page,request})=>{
 await request.get('/__test/empty');await page.goto('/traffic');
 const details=page.getByRole('complementary',{name:'Message details'});
 await expect(page.locator('[data-event-id]')).toHaveCount(0);
 await expect(details.locator('pre')).toHaveText('');
 await expect(details.getByRole('heading',{name:'Message',exact:true})).toBeVisible();
 await expect(details.getByText('None',{exact:true})).toHaveCount(2);
 await expect(details.getByText('policy.refund_auto_limit',{exact:true})).toBeVisible();
 await page.screenshot({path:`${evidence}/round3-empty-bus.png`,fullPage:true});
});

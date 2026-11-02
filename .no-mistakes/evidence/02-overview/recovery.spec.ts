import {test,expect,openWorkspace} from './.local-workspace.ts';
const evidence=process.env.LOCAL_EVIDENCE;
const badge=(p:any)=>p.locator("[data-if='dockUnread']");
for(const sibling of [false,true]) test(`late accepted frame restores rejected refund on Traffic${sibling?' while mission stays in flight':''}`,async({page,workspaceUser})=>{
 test.setTimeout(90000);
 await openWorkspace(page,workspaceUser);
 let releaseWrite=()=>{},releaseRead=()=>{},releaseMission=()=>{};
 const writeGate=new Promise<void>(r=>releaseWrite=r),readGate=new Promise<void>(r=>releaseRead=r),missionGate=new Promise<void>(r=>releaseMission=r);
 let heldWrite=false,holdReads=false,heldRead=false,heldMission=false,refundPosts=0;
 const routes:Promise<any>[]=[];
 await page.route('**/_serverFn/**',async route=>{
  const req=route.request(),body=req.postData()??'';
  if(req.method()==='POST'&&body.includes('ap1')){refundPosts++;heldWrite=true;await writeGate;await route.fulfill({status:500,body:'rejected',contentType:'text/plain'});return;}
  if(req.method()==='POST'&&body.includes('mp-inventory')){heldMission=true;await missionGate;await route.continue();return;}
  if(req.method()==='GET'&&holdReads){const response=await route.fetch();const text=await response.text();if(text.includes('"approvalCount"')){heldRead=true;await readGate;}await route.fulfill({response});return;}
  await route.continue();
 });
 try{
  await page.locator("main [data-loop='approvals'] > div").filter({hasText:'Refund $42'}).getByRole('button',{name:'Approve',exact:true}).click();
  await expect.poll(()=>heldWrite).toBe(true);
  if(sibling)await page.getByRole('button',{name:'Approve mission',exact:true}).click();
  await expect(badge(page)).toHaveText(sibling?'2':'3');
  await page.getByRole('button',{name:'See squad traffic',exact:true}).click();
  await expect(page.locator("[data-if='isOverview']")).toHaveCount(0);
  holdReads=true;releaseWrite();
  await expect.poll(()=>heldRead).toBe(true);
  await page.waitForTimeout(31500);
  if(sibling)await expect.poll(()=>heldMission).toBe(true);
  expect(refundPosts).toBe(1);
  await expect(badge(page)).toHaveText(sibling?'2':'3');
  await page.screenshot({path:`${evidence}/late-frame-${sibling?'sibling':'single'}-before.png`,fullPage:true});
  holdReads=false;releaseRead();
  await expect(badge(page)).toHaveText(sibling?'3':'4',{timeout:15000});
  await page.screenshot({path:`${evidence}/late-frame-${sibling?'sibling':'single'}-recovered.png`,fullPage:true});
  console.log(`After refresh exceeded 30s: Traffic badge recovered to ${sibling?3:4}; refund posts=${refundPosts}; mission held=${heldMission}`);
 }finally{
  holdReads=false;releaseWrite();releaseRead();
  if(sibling&&heldMission){const done=page.waitForResponse(r=>r.request().method()==='POST'&&(r.request().postData()??'').includes('mp-inventory'));releaseMission();await done;await expect(badge(page)).toHaveText('3',{timeout:15000});}
  else releaseMission();
  await page.unrouteAll({behavior:'wait'});
 }
});

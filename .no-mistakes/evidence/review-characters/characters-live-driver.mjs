import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6GJPGSB73WPV1B1J7FFMMBD';
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
const results=[];
async function run(name, fn) { try {results.push({name,result:'pass',details:await fn()});} catch(e){results.push({name,result:'fail',details:e.stack});} }
const base='http://127.0.0.1:8791';
await run('Review navigation opens the complete squadmate cast',async()=>{
 await page.goto(base+'/review/');
 await page.getByRole('link',{name:'Squadmates Proposal:',exact:false}).click();
 await page.waitForURL(base+'/review/characters');
 assert.equal(await page.title(),'tensquads squadmates');
 assert.deepEqual(await page.locator('.mate b').allTextContents(),['Petra','Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor','Delphi']);
 assert.equal(await page.locator('.mate svg[role=img][aria-label]').count(),9);
 await page.screenshot({path:evidence+'/characters-desktop.png',fullPage:true});
 return {url:page.url(),cast:await page.locator('.mate').allTextContents()};
});
await run('State sheet, example conversations and avatar sizes render',async()=>{
 assert.equal(await page.locator('.states th').count(),10);
 assert.equal(await page.locator('.states td svg').count(),27);
 assert.equal(await page.locator('.list .row').count(),7);
 assert.deepEqual(await page.locator('.sizes svg').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width)),[16,24,32,48,96]);
 assert.deepEqual(await page.locator('.states tr:first-child th').allTextContents(),['','WaitingNothing to do now. Blinks slowly.','PlanningLooks up while it plans.','Running skillLooks at the work.','CheckingSquints while the code check runs.','DoneThe check passed.','Sent backThe check failed once. Looks down.','BlockedWaits for a person. Holds no machine.','EscalatedSecond fail. Needs you now.','DroppedNothing to do at all. Asleep.']);
 assert.equal(errors.length,0);
 return {stateLabels:await page.locator('.states th').allTextContents(),sampleRows:await page.locator('.list').innerText()};
});
await run('Waiting characters animate and respect reduced motion',async()=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 const normal=await page.locator('.sm-blink').first().evaluate(n=>({name:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration}));
 assert.equal(normal.name,'sm-blink');
 const animation=await page.locator('.sm-blink').first().evaluate(n=>n.getAnimations().map(a=>({state:a.playState,frames:a.effect.getKeyframes().map(f=>f.transform)})));
 assert.equal(animation[0].state,'running');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.sm-blink').first().evaluate(n=>getComputedStyle(n).animationName),'none');
 return {normal,animation,reducedMotion:'none'};
});
await run('390px sheet keeps overflow inside the state table',async()=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/review/characters');
 await page.screenshot({path:evidence+'/characters-mobile.png',fullPage:true});
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,tableContainer:document.querySelector('.states').clientWidth,tableWidth:document.querySelector('.states').scrollWidth}));
 assert.equal(dimensions.document,390);
 assert.ok(dimensions.tableWidth>dimensions.tableContainer);
 await page.locator('.states').hover();
 await page.mouse.wheel(900,0);
 await page.waitForTimeout(200);
 assert.ok(await page.locator('.states').evaluate(n=>n.scrollLeft)>0);
 await page.locator('.states').screenshot({path:evidence+'/characters-mobile-states-scrolled.png'});
 return dimensions;
});
await run('Direct and HEAD requests retain review headers; keyboard returns to review; home stays unchanged',async()=>{
 const response=await page.goto(base+'/review/characters');
 assert.equal(response.status(),200);
 for (const method of ['GET','HEAD']) {
 const r=await page.request.fetch(base+'/review/characters',{method});
 assert.equal(r.status(),200);
 assert.equal(r.headers()['x-robots-tag'],'noindex, nofollow');
 assert.equal(r.headers()['cache-control'],'no-cache');
 if(method==='HEAD') assert.equal((await r.body()).length,0);
 }
 await page.keyboard.press('Tab');
 assert.equal(await page.locator(':focus').innerText(),'Back to review');
 await page.keyboard.press('Enter');
 await page.waitForURL(base+'/review/');
 await page.goto(base+'/');
 assert.equal(await page.getByRole('heading',{level:1}).innerText(),'Hire a squad of AI agents to run your business');
 assert.equal(await page.getByText('Coming soon',{exact:true}).count(),1);
 assert.equal(await page.locator('.mate').count(),0);
 return {direct:response.status(),robots:response.headers()['x-robots-tag'],backNavigation:true,holdingPage:true,errors};
});
writeFileSync(evidence+'/characters-live-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
await browser.close();
if(results.some(r=>r.result==='fail'))process.exitCode=1;

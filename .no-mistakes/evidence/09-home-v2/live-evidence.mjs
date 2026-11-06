import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.cwd();
const require=createRequire(root+'/package.json');
const {chromium}=require('playwright');
const {installPinnedFonts}=await import(root+'/e2e/fonts.ts');
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6S1W135JR0DMWMXFVW0AT1J';
const origin='http://localhost:37777';
const browser=await chromium.launch({args:['--font-render-hinting=none','--disable-font-subpixel-positioning','--force-color-profile=srgb']});
const results=[];
async function pageFor(options={}) {
 const context=await browser.newContext({viewport:{width:1440,height:900},...options});
 const page=await context.newPage();
 await installPinnedFonts(page);
 await page.route(/^http:\/\/localhost:37777\//,async route=>{
  const response=await route.fetch({headers:{...route.request().headers(),host:'tensquads.moe-678.workers.dev',cookie:'__clerk_db_jwt=dev; __client_uat=0'}});
  await route.fulfill({response});
 });
 return {context,page};
}
try {
 for (const width of [1440,390]) {
  const {context,page}=await pageFor({reducedMotion:'reduce',viewport:{width,height:width===1440?900:844}});
  await page.goto(origin);
  await page.waitForSelector('.c.settled');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${evidence}/built-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const visited=new Set();
  const controls=await page.locator('a,button,textarea,[tabindex="0"]').count();
  for(let i=0;i<controls+5;i++) {
   await page.keyboard.press('Tab');
   visited.add(await page.evaluate(()=>{const e=document.activeElement;return e?.tagName+':'+(e?.textContent||e?.getAttribute('aria-label')||e?.id||'').trim().replace(/\s+/g,' ').slice(0,90)}));
  }
  results.push({scenario:`layout-${width}`,horizontalScroll:false,keyboardVisited:[...visited]});
  await page.goto('file://'+root+'/docs/designs/home-v2/home.html');
  await page.waitForSelector('.c.settled');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${evidence}/design-${width}.png`,fullPage:true});
  await context.close();
 }
 const {context,page}=await pageFor({reducedMotion:'no-preference'});
 await page.route('**/*',async route=>{
  if(route.request().resourceType()==='script') return route.abort();
  await route.fallback();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 const before=await page.locator('.c').evaluateAll(es=>es.map(e=>getComputedStyle(e).opacity));
 assert.deepEqual(before,['0','0','0','0']);
 await page.waitForTimeout(7200);
 const after=await page.locator('.c').evaluateAll(es=>es.map(e=>getComputedStyle(e).opacity));
 results.push({scenario:'fallback diagnostic',before,after,htmlClass:await page.locator('html').getAttribute('class')});
 await page.screenshot({path:evidence+'/blocked-hydration-fallback.png',fullPage:false});
 assert.deepEqual(after,['1','1','1','1']);
 await page.screenshot({path:evidence+'/blocked-hydration-fallback.png',fullPage:false});
 results.push({scenario:'six-second fallback with external scripts blocked',before,after});
 await context.close();
 const c=await pageFor({reducedMotion:'reduce'});
 await c.page.goto(origin);
 await c.page.waitForSelector('.c.settled');
 for(const pill of ['.yes','.no']) {
  await c.page.locator('.c').nth(1).locator(pill).click();
  assert.equal(new URL(c.page.url()).pathname,'/');
  assert.equal(await c.page.locator('.ask .sr').textContent(),'3');
  assert.equal(await c.page.locator('.c.approved').count(),1);
 }
 const links=c.page.getByRole('link',{name:'Start free',exact:true});
 const count=await links.count();
 for(let i=0;i<count;i++) {
  await links.nth(i).click();
  assert.equal(new URL(c.page.url()).pathname,'/signup');
  await c.page.goto(origin);
 }
 results.push({scenario:'every Start free link opens signup; hero pills do nothing',startFreeLinks:count});
 await c.context.close();
} finally {
 await browser.close();
 await writeFile(evidence+'/live-results.json',JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));

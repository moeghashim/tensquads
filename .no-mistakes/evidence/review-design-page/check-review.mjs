import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(process.cwd() + '/package.json');
const {chromium} = require('playwright');
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6GF0N9HC79G3CQAXNM556YA';
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
const results=[];
const base='http://127.0.0.1:8791';
try {
 let response=await page.goto(base+'/review/');
 assert.equal(response.status(),200);
 assert.equal(await page.locator('.tile').count(),0);
 assert.equal(await page.locator('.oq').count(),5);
 await page.screenshot({path:evidence+'/review-desktop.png',fullPage:true});
 await page.getByRole('link',{name:/^Build plan/}).click();
 await page.getByRole('heading',{name:/Build Plan/i}).waitFor();
 assert.match(await page.locator('body').innerText(),/Built/);
 await page.getByRole('link',{name:'Back to review'}).click();
 await page.getByRole('link',{name:/^Design/}).click();
 assert.equal(new URL(page.url()).pathname,'/review/design/');
 assert.equal(await page.locator('.tile').count(),11);
 const tiles=await page.locator('.tile').evaluateAll(els=>els.map(e=>({title:e.querySelector('b').textContent,href:e.getAttribute('href'),image:e.querySelector('img').getAttribute('src')})));
 for(const t of tiles){
  const img=page.locator(`img[src="${t.image}"]`); await img.scrollIntoViewIfNeeded();
  await img.evaluate(el=>el.decode());
  assert.deepEqual(await img.evaluate(el=>[el.naturalWidth,el.naturalHeight]),[720,450]);
 }
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:evidence+'/gallery-desktop.png',fullPage:true});
 results.push({scenario:'Review navigation separates the design gallery while retaining the plan and five questions',result:'pass'});
 for(const t of tiles){
  await page.goto(base+'/review/design/');
  await page.locator(`a[href="${t.href}"]`).click();
  await page.waitForFunction(()=>document.body?.innerText.trim().length>150);
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).pathname,t.href);
  assert.equal(await page.locator('x-dc').count(),0);
  results.push({screen:t.title,url:page.url(),visibleText:(await page.locator('body').innerText()).slice(0,350)});
  if(t.href.endsWith('Agents.dc.html')){
    await page.screenshot({path:evidence+'/squads-design.png',fullPage:true});
    await page.getByRole('button',{name:/Support Customer inbox/}).click();
    await page.getByText('Support squad',{exact:true}).waitFor();
    await page.screenshot({path:evidence+'/interactive-support-dashboard.png',fullPage:true});
    results.push({scenario:'Open Squads from the gallery and select Support to view its dashboard',result:'pass'});
  }
 }
 assert.deepEqual(errors,[]);
 results.push({scenario:'All eleven thumbnail cards load rendered original screens without runtime exceptions',result:'pass'});
 for(const route of ['/review/design','/review/design/']){
  response=await page.goto(base+route);
  assert.equal(response.status(),200); assert.equal(await page.title(),'tensquads design');
  assert.equal(response.headers()['x-robots-tag'],'noindex, nofollow');
  assert.equal(await page.locator('.tile').count(),11);
 }
 await page.getByRole('link',{name:'Back to review'}).click();
 assert.equal(new URL(page.url()).pathname,'/review/');
 results.push({scenario:'Both direct gallery URLs load and Back to review returns to the review page',result:'pass'});
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/review/design/');
 for(const image of await page.locator('.tile img').all()) {await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 assert.equal(await page.locator('.tile').count(),11);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:evidence+'/gallery-mobile.png',fullPage:true});
 await page.locator('.tile').first().click();
 await page.waitForFunction(()=>document.body?.innerText.includes('Hire a squad'));
 results.push({scenario:'At 390px the gallery has no horizontal overflow and a thumbnail opens its design',result:'pass'});
} finally {
 writeFileSync(evidence+'/browser-results.json',JSON.stringify({results,errors},null,2));
 await browser.close();
}

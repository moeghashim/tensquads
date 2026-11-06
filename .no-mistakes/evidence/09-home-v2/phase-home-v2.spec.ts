import { readFileSync } from 'node:fs';
import { test, expect, waitForScreenFonts } from './support.ts';
import { installPinnedFonts } from './fonts.ts';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6S4CXD1012BHXS5T6W7340D';
async function host(page, value='tensquads.moe-678.workers.dev') {
 await page.route(/^http:\/\/localhost:\d+\//, async route => {
 const response=await route.fetch({headers:{...route.request().headers(),host:value}});
 await route.fulfill({response});
 });
}
for (const width of [1440,390]) test(`reviewer visual pair ${width}`, async ({page}) => {
 await page.emulateMedia({reducedMotion:'reduce'}); await page.setViewportSize({width,height:900}); await host(page); await page.goto('/'); await waitForScreenFonts(page);
 await expect(page.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
 await page.screenshot({path:`${evidence}/built-${width}.png`,fullPage:true});
 const selectors=['.new','h1','.ask','.cards','.dock','.logos','#agents','#how','#control','#pricing','.final','footer'];
 const positions=async p=>p.evaluate(selectors=>Object.fromEntries(selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,w:r.width,h:r.height}]})),selectors);
 const built=await positions(page);
 const design=await page.context().newPage(); await design.setViewportSize({width,height:900}); await design.emulateMedia({reducedMotion:"reduce"});
 await installPinnedFonts(design,true);
 await design.route('http://design.local/home-dashboard.jpg',r=>r.fulfill({contentType:'image/jpeg',body:readFileSync('docs/designs/home-v2/home-dashboard.jpg')}));
 await design.setContent(readFileSync('docs/designs/home-v2/home.html','utf8').replace('<head>','<head><base href="http://design.local/">'));
 await design.evaluate(()=>document.fonts.ready); await expect(design.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
 await design.screenshot({path:`${evidence}/design-${width}.png`,fullPage:true});
 expect(await positions(design)).toEqual(built);
 await design.close();
});
test('blocked hydration reveals cards after six seconds',async({browser,baseURL})=>{
 const page=await browser.newPage(); await installPinnedFonts(page); await host(page);
 await page.route('**/*', async route=>{if(route.request().resourceType()==='script')await route.abort();else await route.fallback()});
 await page.goto(baseURL!,{waitUntil:'domcontentloaded'});
 expect(await page.locator('.c').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).opacity))).toEqual(['0','0','0','0']);
 await expect(page.locator('.c').first()).toHaveCSS('opacity','1',{timeout:8000});
 await page.screenshot({path:`evidence}/fallback.png`.replace('evidence}',evidence),fullPage:false});
 await page.close();
});
test('every start link and the decorative approval pills keep their designed behavior',async({page})=>{
 await host(page); await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('/');
 await expect(page.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
 const cards=page.locator('.c'); const before=await cards.allTextContents();
 await cards.nth(1).locator('.yes').click(); await cards.nth(1).locator('.no').click();
 expect(await cards.allTextContents()).toEqual(before); await expect(page.locator('.ask .sr')).toHaveText('3');
 const links=await page.getByRole('link',{name:'Start free',exact:true}).count();
 for(let i=0;i<links;i++){await page.getByRole('link',{name:'Start free',exact:true}).nth(i).click();await expect(page).toHaveURL(/\/signup$/);await page.goto('/');}
 await page.getByRole('link',{name:'Talk to us',exact:true}).click();await expect(page).toHaveURL(/\/signup$/);
});
test('local default remains old and all homepage controls can be reached with Tab',async({page})=>{
 await page.goto('/'); await expect(page.getByRole('heading',{name:'Hire a squad of AI agents to run your business'})).toBeVisible();
 await host(page); await page.goto('/');
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const reachable=new Set(); const wanted=await page.locator('.home-v2 a, .home-v2 button, .home-v2 textarea, .home-v2 [tabindex="0"]').count();
 for(let i=0;i<wanted+3;i++) {await page.keyboard.press('Tab'); const index=await page.evaluate(()=>Array.from(document.querySelectorAll('.home-v2 a, .home-v2 button, .home-v2 textarea, .home-v2 [tabindex="0"]')).indexOf(document.activeElement)); if(index>=0)reachable.add(index);}
 expect(reachable.size).toBe(wanted); expect(errors).toEqual([]);
});

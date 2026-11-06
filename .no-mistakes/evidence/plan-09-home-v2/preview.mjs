import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6R7N1BRR0PS1553HHS9SPD2';
const base='http://127.0.0.1:8791';
const browser=await chromium.launch({headless:true});
const results=[];
async function run(name, fn){try{const detail=await fn(); results.push({name,result:'pass',detail});}catch(e){results.push({name,result:'fail',detail:e.stack});}writeFileSync(evidence+'/preview-results.json',JSON.stringify(results,null,2));}
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await run('Review index identifies the selected design; homepage and dashboard bytes are served intact',async()=>{
 await page.goto(base+'/review');
 await expect(page.locator('a.card[href="/review/home"]')).toContainText('docs/designs/home-v2');
 await expect(page.locator('a.card[href="/review/home"]')).toContainText('9d75858ddd2a');
 await page.screenshot({path:evidence+'/review-index.png',fullPage:true});
 await page.locator('a.card[href="/review/home"]').click();
 await expect(page.locator('h1')).toHaveText('Your squad does the work.');
 const response=await context.request.get(base+'/review/home');
 expect(createHash('sha256').update(await response.body()).digest('hex')).toBe('9d75858ddd2a6edbb455eca2069204b1f7e4d98dc5ceff1c1d1755b0a168309f');
 expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
 const image=await context.request.get(base+'/review/home-dashboard.jpg');
 expect(createHash('sha256').update(await image.body()).digest('hex')).toBe('8d8c5146b04b334a761df8f6a5e39e1ea5f6eefa79bc4a25909b6b2b2ff6c310');
 await expect(page.locator('.shot img')).toHaveJSProperty('naturalWidth',2880);
 return {htmlStatus:response.status(),imageStatus:image.status(),imageWidth:await page.locator('.shot img').evaluate(e=>e.naturalWidth)};
});
await run('Cards are invisible on first frames, arrive in order, then Pisa approval reduces count to three',async()=>{
 await page.addInitScript(()=>{
 window.samples=[];window.arrivals=[];window.ends=[];
 document.addEventListener('animationstart',e=>{if(e.target.matches('.c'))window.arrivals.push({t:performance.now(),index:[...document.querySelectorAll('.c')].indexOf(e.target)});});
 document.addEventListener('animationend',e=>{if(e.target.matches('.c'))window.ends.push({t:performance.now(),index:[...document.querySelectorAll('.c')].indexOf(e.target),duration:e.elapsedTime});});
 const sample=()=>{const cards=[...document.querySelectorAll('.c')];if(cards.length)window.samples.push({t:performance.now(),opacity:cards.map(e=>getComputedStyle(e).opacity)});if(performance.now()<650)requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 await page.goto(base+'/review/home',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(200);await page.screenshot({path:evidence+'/first-frames.png'});
 await expect(page.locator('.c').first()).toHaveClass(/approved/,{timeout:8000});
 await expect(page.locator('.ask .sr')).toHaveText('3');
 await expect(page.locator('.c .done').first()).toBeVisible();
 await page.waitForTimeout(4700);
 const timing=await page.evaluate(()=>({samples:window.samples,arrivals:window.arrivals,ends:window.ends}));
 writeFileSync(evidence+'/animation-timing.json',JSON.stringify(timing,null,2));
 expect(timing.samples.length).toBeGreaterThan(0);for(const s of timing.samples)expect(s.opacity).toEqual(['0','0','0','0']);
 expect(timing.arrivals.map(x=>x.index)).toEqual([0,1,2,3]);
 for(let i=1;i<4;i++)expect(Math.abs(timing.arrivals[i].t-timing.arrivals[i-1].t-450)).toBeLessThan(200);
 for(const x of timing.ends)expect(x.duration).toBe(1.4);expect(timing.ends.length).toBe(4);
 await page.screenshot({path:evidence+'/home-1440-live.png',fullPage:true});
 return timing;
});
await run('New and Existing toggle replace examples and placeholder; example fills and focuses the prompt',async()=>{
 await page.getByRole('button',{name:'New business',exact:true}).click();
 await expect(page.locator('#draft')).toHaveAttribute('placeholder','Describe what you want to sell and to whom…');
 await expect(page.locator('#ex button')).toHaveText(['Date-seed coffee, caffeine-free','Handmade ceramics on Etsy','A print-on-demand streetwear brand']);
 await page.getByRole('button',{name:'Handmade ceramics on Etsy',exact:true}).click();
 await expect(page.locator('#draft')).toHaveValue('Handmade ceramics on Etsy');await expect(page.locator('#draft')).toBeFocused();
 await page.getByRole('button',{name:'Existing business',exact:true}).click();
 await expect(page.locator('#draft')).toHaveAttribute('placeholder','Paste your store URL or describe what you sell…');
 await expect(page.locator('#ex button')).toHaveText(['A Shopify store doing 300 orders a month','A cafe with a wholesale side','Two Amazon listings and a website']);
 await page.getByRole('button',{name:'A cafe with a wholesale side',exact:true}).click();await expect(page.locator('#draft')).toHaveValue('A cafe with a wholesale side');
 await page.screenshot({path:evidence+'/prompt-example.png'});
 return {value:await page.locator('#draft').inputValue(),placeholder:await page.locator('#draft').getAttribute('placeholder')};
});
await run('Squadmate details open on hover and keyboard focus; limits fill when scrolled into view',async()=>{
 await page.locator('.m[tabindex]').first().hover();await expect(page.locator('#tip-orders')).toBeVisible();
 await page.mouse.move(0,0);await page.locator('.m[tabindex]').first().focus();await expect(page.locator('#tip-orders')).toBeVisible();
 await page.screenshot({path:evidence+'/squadmate-focus.png'});
 const focus=await page.locator('.m[tabindex]').first().evaluate(e=>({width:getComputedStyle(e).outlineWidth,color:getComputedStyle(e).outlineColor,offset:getComputedStyle(e).outlineOffset}));
 await page.locator('.panel').scrollIntoViewIfNeeded();await page.waitForTimeout(2200);
 const widths=await page.locator('.panel .bar span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width/e.parentElement.getBoundingClientRect().width));
 expect(widths[0]).toBeCloseTo(.5,2);expect(widths[1]).toBeCloseTo(.38,2);expect(widths[2]).toBeCloseTo(.62,2);
 await page.screenshot({path:evidence+'/limits-filled.png'});return {focus,widths};
});
await run('At 390px the completed preview has no horizontal scroll and keeps its prompt usable',async()=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/review/home');await page.waitForTimeout(10000);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await expect(page.locator('.c .done').first()).toBeVisible();
 await page.screenshot({path:evidence+'/home-390-live.png',fullPage:true});
 await page.getByRole('button',{name:'New business',exact:true}).click();await page.getByRole('button',{name:'Date-seed coffee, caffeine-free',exact:true}).click();await expect(page.locator('#draft')).toHaveValue('Date-seed coffee, caffeine-free');
 return {scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),visibleCards:await page.locator('.c:visible').count()};
});
await run('Reduced motion shows cards immediately and still completes the approval',async()=>{
 const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const p=await c.newPage();await p.goto(base+'/review/home',{waitUntil:'domcontentloaded'});
 const initial=await p.locator('.c').evaluateAll(es=>es.map(e=>({opacity:getComputedStyle(e).opacity,animation:getComputedStyle(e).animationName})));
 for(const s of initial){expect(s.opacity).toBe('1');expect(s.animation).toBe('none');}
 await expect(p.locator('.ask .sr')).toHaveText('3');await p.screenshot({path:evidence+'/reduced-motion.png'});await c.close();return initial;
});
await run('With JavaScript disabled all desktop cards remain readable',async()=>{
 const c=await browser.newContext({viewport:{width:1440,height:900},javaScriptEnabled:false});const p=await c.newPage();await p.goto(base+'/review/home');
 for(const card of await p.locator('.c').all())await expect(card).toBeVisible();
 await p.screenshot({path:evidence+'/javascript-off.png'});const opacity=await p.locator('.c').evaluateAll(es=>es.map(e=>getComputedStyle(e).opacity));expect(opacity).toEqual(['1','1','1','1']);await c.close();return {opacity};
});
await run('If the animation script is blocked the six-second fallback reveals the cards',async()=>{
 const c=await browser.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();
 await p.route('**/review/home',async route=>{const response=await route.fetch();const html=await response.text();const head=html.match(/<script>([\s\S]*?)<\/script>/)[1];const hash=createHash('sha256').update(head).digest('base64');await route.fulfill({response,headers:{...response.headers(),'content-security-policy':`script-src 'sha256-${hash}'`}});});
 await p.goto(base+'/review/home',{waitUntil:'domcontentloaded'});expect(await p.locator('.c').first().evaluate(e=>getComputedStyle(e).opacity)).toBe('0');
 await expect.poll(()=>p.locator('.c').evaluateAll(es=>es.map(e=>getComputedStyle(e).opacity)),{timeout:8000}).toEqual(['1','1','1','1']);await p.screenshot({path:evidence+'/fallback.png'});await c.close();return 'Bottom animation script blocked by browser CSP; cards visible after 6.5 seconds';
});
await run('Root landing page remains unchanged and preview has no uncaught script errors',async()=>{await page.setViewportSize({width:1440,height:900});await page.goto(base+'/');await expect(page.locator('h1')).toHaveText('Hire a squad of AI agents to run your business');await expect(page.getByText('Coming soon',{exact:true})).toBeVisible();await page.screenshot({path:evidence+'/landing-unchanged.png'});expect(errors).toEqual([]);return {heading:await page.locator('h1').innerText(),errors};});
await browser.close();console.log(JSON.stringify(results,null,2));

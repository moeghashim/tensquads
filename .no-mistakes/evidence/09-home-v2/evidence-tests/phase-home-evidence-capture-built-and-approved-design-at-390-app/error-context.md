# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase-home-evidence.spec.ts >> capture built and approved design at 390
- Location: e2e/phase-home-evidence.spec.ts:11:32

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('.c').first()
Expected pattern: /settled/
Received string:  "c approved"
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" locator('.c').first() with timeout 5000ms
  - waiting for locator('.c').first()
    7 × locator resolved to <div class="c">…</div>
      - unexpected value "c"
    7 × locator resolved to <div class="c approved">…</div>
      - unexpected value "c approved"

```

```yaml
- img "Pisa, Orders, waiting"
- text: Pisa Orders $18
- heading "Ship order A-1031 by express" [level=3]
- paragraph: The customer needs it by Friday. Express is $18. Your shipping limit is $12.
- text: Address and stock checked
```

# Test source

```ts
  1  | import { readFileSync, writeFileSync } from 'node:fs';
  2  | import { test, expect, waitForScreenFonts } from './support.ts';
  3  | const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6S1W135JR0DMWMXFVW0AT1J';
  4  | async function host(page) {
  5  |  await page.route(/^http:\/\/localhost:\d+\//, async route => {
  6  |  const incoming = route.request().headers();
  7  |  const response = await route.fetch({headers:{...incoming, host:'tensquads.moe-678.workers.dev',cookie:'__clerk_db_jwt=dev; __client_uat=0'}});
  8  |  await route.fulfill({response});
  9  |  });
  10 | }
  11 | for(const width of [1440,390]) test(`capture built and approved design at ${width}`,async({page})=>{
  12 |  await page.setViewportSize({width,height:width===1440?900:844});
  13 |  await page.emulateMedia({reducedMotion:'reduce'});
  14 |  await host(page); await page.goto('/'); await waitForScreenFonts(page);
> 15 |  await expect(page.locator('.c').first()).toHaveClass(/settled/);
     |                                           ^ Error: expect(locator).toHaveClass(expected) failed
  16 |  await page.screenshot({path:`${evidence}/built-${width}.png`,fullPage:true,animations:'disabled'});
  17 |  const built=await page.locator('.new, h1, .cards, .dock, #agents, #pricing').evaluateAll(nodes=>nodes.map(n=>({selector:n.className||n.id,y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height})));
  18 |  await page.setContent(readFileSync('docs/designs/home-v2/home.html','utf8'));
  19 |  await waitForScreenFonts(page); await expect(page.locator('.c').first()).toHaveClass(/settled/);
  20 |  await page.screenshot({path:`${evidence}/design-${width}.png`,fullPage:true,animations:'disabled'});
  21 |  const design=await page.locator('.new, h1, .cards, .dock, #agents, #pricing').evaluateAll(nodes=>nodes.map(n=>({selector:n.className||n.id,y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height})));
  22 |  writeFileSync(`${evidence}/geometry-${width}.json`, JSON.stringify({built,design},null,2));
  23 |  expect(built).toEqual(design);
  24 | });
  25 | test('fallback reveals cards if hydration cannot start',async({browser,baseURL})=>{
  26 |  const context=await browser.newContext(); const page=await context.newPage();
  27 |  await host(page); await page.route(/\.(?:js|tsx?)(?:\?|$)/,route=>route.abort());
  28 |  await page.goto(baseURL+'/',{waitUntil:'domcontentloaded'});
  29 |  await expect(page.locator('.c').first()).toHaveCSS('opacity','0');
  30 |  await expect(page.locator('.c').first()).toHaveCSS('opacity','1',{timeout:9000});
  31 |  await page.screenshot({path:`${evidence}/hydration-fallback.png`,fullPage:true}); await context.close();
  32 | });
  33 | test('all signup links, section links and tab stops work; approval pills stay inert',async({page})=>{
  34 |  await host(page); await page.goto('/');
  35 |  const signupCount=await page.locator('a[href="/signup"]').count();
  36 |  for(let i=0;i<signupCount;i++) { await page.locator('a[href="/signup"]').nth(i).click(); await expect(page).toHaveURL(/\/signup$/); await page.goto('/'); }
  37 |  for(const id of ['agents','how','control','pricing']) { await page.locator(`nav a[href="#${id}"]`).click(); await expect(page).toHaveURL(new RegExp(`#${id}$`)); await expect(page.locator(`#${id}`)).toBeInViewport(); }
  38 |  await page.goto('/');
  39 |  await page.locator('.c').nth(1).locator('.yes').click(); await page.locator('.c').nth(1).locator('.no').click();
  40 |  await expect(page.locator('.c').nth(1)).not.toHaveClass(/approved/); await expect(page).toHaveURL(/\/$/);
  41 |  const expected=await page.locator('a, button, textarea, [tabindex="0"]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).length);
  42 |  const reached=[];
  43 |  await page.goto('/');
  44 |  for(let i=0;i<expected;i++) { await page.keyboard.press('Tab'); reached.push(await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent?.trim().slice(0,70),outline:getComputedStyle(document.activeElement).outline}))); }
  45 |  expect(reached.every(x=>x.tag!=='BODY')).toBe(true);
  46 |  writeFileSync(`${evidence}/controls.json`,JSON.stringify({signupLinks:signupCount,anchors:['agents','how','control','pricing'],pills:'inert',tabStops:reached},null,2));
  47 | });
  48 | 
```
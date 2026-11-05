import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(resolve('package.json'));
const { chromium, expect } = require('@playwright/test');
const { installPinnedFonts } = await import(pathToFileURL(resolve('e2e/fonts.ts')));
import { writeFileSync } from 'node:fs';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6MW0RRFTBZPPB9ZMDHT7SPK';
const browser = await chromium.launch({args:['--font-render-hinting=none','--disable-font-subpixel-positioning','--force-color-profile=srgb']});
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await installPinnedFonts(page, true);
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
const report={signup:[], review:{},workspace:{}};
try {
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.goto('http://localhost:3106/signup');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(e=>Object.keys(e).some(k=>k.startsWith('__reactProps$'))));
  await page.getByRole('button',{name:/A new business/}).click();
  await page.getByRole('button',{name:'Choose my squads'}).click();
  await expect(page.getByRole('heading',{name:'Your first squads for your business'})).toBeVisible();
  for(const name of ['Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor']) await expect(page.getByRole('button',{name:new RegExp('^'+name)})).toBeVisible();
  const svg=await page.locator('svg[viewBox="0 0 64 64"]').count();
  expect(svg).toBe(7);
  const scroll=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(scroll.scroll).toBeLessThanOrEqual(scroll.width);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${evidence}/signup-squadmates-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:/Ready for your first order/}).click();
  await page.getByRole('button',{name:/Replies in your voice/}).click();
  await page.getByRole('button',{name:/Drafts your launch campaign/}).click();
  await expect(page.getByText('Pick at least one squad to start.')).toBeVisible();
  await page.getByRole('button',{name:'Create my workspace'}).click();
  await expect(page.getByLabel('Email')).toHaveCount(0);
  await page.screenshot({path:`${evidence}/signup-zero-squads-${width}.png`,fullPage:true,animations:'disabled'});
  report.signup.push({width,names:7,drawings:svg,scroll,zeroSquadGuard:'blocked account form'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://localhost:3107/review/characters');
 await expect(page.getByRole('heading',{name:'Squadmates',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const names=await page.locator('.mate b').allTextContents();
 expect(names).toEqual(['Petra','Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor','Delphi','Sydney']);
 await expect(page.getByRole('img',{name:'Sydney, People',exact:true})).toBeVisible();
 const states=await page.locator('.states th').allTextContents();
 expect(states.length).toBe(10);
 expect(await page.locator('.states svg').count()).toBe(27);
 await page.screenshot({path:`${evidence}/characters-after-1440.png`,fullPage:true,animations:'disabled'});
 const previous = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await installPinnedFonts(previous,true);
 await previous.goto('http://localhost:3107/review/characters-before.html');
 await previous.evaluate(()=>document.fonts.ready);
 await previous.screenshot({path:`${evidence}/characters-before-1440.png`,fullPage:true,animations:'disabled'});
 const comparisons=[];
 for(let i=0;i<9;i++) {
  const a=await page.locator('.mate').nth(i).screenshot({animations:'disabled'});
  const b=await previous.locator('.mate').nth(i).screenshot({animations:'disabled'});
  expect(a.equals(b),`Existing card ${names[i]} pixels`).toBe(true);
  comparisons.push(names[i]);
 }
 for(let i=0;i<27;i++) {
  const a=await page.locator('.states td svg').nth(i).screenshot({animations:'disabled'});
  const b=await previous.locator('.states td svg').nth(i).screenshot({animations:'disabled'});
  expect(a.equals(b),`State drawing ${i} pixels`).toBe(true);
 }
 const animation=await page.locator('.mate .sm-blink').first().evaluate(e=>getComputedStyle(e).animationName);
 expect(animation).toBe('sm-blink');
 await page.emulateMedia({reducedMotion:'reduce'});
 const reduced=await page.locator('.mate .sm-blink').first().evaluate(e=>getComputedStyle(e).animationName);
 expect(reduced).toBe('none');
 report.review={names,states,unchangedCards:comparisons,unchangedStateDrawings:27,animation,reducedMotionAnimation:reduced};
 await previous.close();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${evidence}/characters-after-390.png`,fullPage:true,animations:'disabled'});
 for(const route of ['/overview','/agents','/agents/support','/chat','/traffic','/rules']) {
  await page.goto('http://localhost:3106'+route);
  await expect(page).toHaveURL(/\/signin$/);
  report.workspace[route]='redirected to /signin; no Clerk session configured';
 }
 expect(errors).toEqual([]);
 report.pageErrors=errors;
 writeFileSync(`${evidence}/live-observations.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}

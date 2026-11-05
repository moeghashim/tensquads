import {chromium, expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {installPinnedFonts} from '../e2e/fonts.ts';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6NNV77CMZM2SZ3FT396JEV2';
const browser=await chromium.launch({headless:true,args:['--font-render-hinting=none','--disable-font-subpixel-positioning','--force-color-profile=srgb']});
const log=[];
try {
 const page=await browser.newPage({deviceScaleFactor:1,viewport:{width:1440,height:900}});
 await installPinnedFonts(page);
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 for (const width of [1440,390]) {
  await page.setViewportSize({width,height:width===390?844:900});
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('button',{name:'New business',exact:true}).click();
  await page.getByRole('button',{name:'Existing business',exact:true}).click();
  await page.evaluate(async()=> {await Promise.all([500,600,700].map(w=>document.fonts.load(`${w} 18px 'Familjen Grotesk'`))); await document.fonts.ready;});
  const roles=['Orders','Support','Marketing','Finance','Inventory','Market researcher','Website builder'];
  const names=['Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor'];
  for(let i=0;i<roles.length;i++) {
   await expect(page.locator('.mini').nth(i).locator('.tag')).toHaveText(roles[i]);
   await expect(page.locator('.mini').nth(i).locator('.tag')).toBeVisible();
   await expect(page.locator('.mini').nth(i).locator('.mini-name')).toHaveText(names[i]);
  }
  const drawn=await page.locator('.home-page svg[aria-label]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('aria-label').split(',')[0]))].sort());
  expect(drawn).toEqual(['Petra',...names,'Delphi'].sort());
  await expect(page.locator('.price > span')).toHaveText(['$49','$149','$399']);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('h1')).fontFamily,loaded:document.fonts.check("700 64px 'Familjen Grotesk'")}));
  expect(dims.scroll).toBeLessThanOrEqual(width); expect(dims.loaded).toBe(true); expect(dims.font).toContain('Familjen Grotesk');
  await page.screenshot({path:`${evidence}/homepage-${width}.png`,fullPage:true,animations:'disabled'});
  if(width===390) await page.locator('.minis').screenshot({path:`${evidence}/mobile-role-labels.png`,animations:'disabled'});
  const before=await page.locator('#control').innerText();
  const url=page.url(); const requests=[]; const listener=r=>requests.push(r.url());
  page.on('request',listener);
  for(const label of ['Approve','Decline']) { await page.getByRole('button',{name:label,exact:true}).click(); expect(await page.locator('#control').innerText()).toBe(before); expect(page.url()).toBe(url); }
  page.off('request',listener); expect(requests).toEqual([]);
  log.push({viewport:width,visibleRoleLabels:roles,drawn,prices:['$49','$149','$399'],layout:dims,approvalButtons:'No content, URL, or network changes'});
 }
 const box=page.getByRole('textbox',{name:'Describe your business'});
 await box.fill('Custom shop description');
 for(let i=0;i<4;i++) {await page.getByRole('button',{name:'New business',exact:true}).click();await page.getByRole('button',{name:'Existing business',exact:true}).click();}
 await expect(box).toHaveValue('Custom shop description');
 await expect(page.getByRole('button',{name:'Existing business',exact:true})).toHaveAttribute('aria-pressed','true');
 log.push({repeatedToggle:'Typed draft retained; Existing business selected',pageErrors:errors}); expect(errors).toEqual([]);
 writeFileSync(`${evidence}/live-homepage.json`,JSON.stringify(log,null,2));
 console.log(JSON.stringify(log,null,2));
} finally {await browser.close();}

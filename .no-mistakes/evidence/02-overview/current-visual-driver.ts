import {chromium,expect} from '@playwright/test';
import {installPinnedFonts} from '../e2e/fonts.ts';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6E1MX216VYJ1R76P4Y74P86';
const browser=await chromium.launch();
const page=await browser.newPage(); await installPinnedFonts(page,true);
const checks=[];
try{
for(const name of ['seed','approved','empty-inbox','revising','no-store','blank']){
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.setContent(readFileSync(`${dir}/current-overview-${name}.html`,'utf8'));
  await page.evaluate(async()=>{await document.fonts.ready;});
  await expect(page.getByRole('heading',{name:/Good morning/})).toBeVisible();
  const fit=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);expect(fit).toBe(true);
  if(name==='seed'){
   await expect(page.locator("main [data-loop='kpis'] > div")).toHaveCount(6);
   await expect(page.locator("main [data-loop='bars']").first().locator('> div')).toHaveCount(14);
   await expect(page.locator("main [data-loop='agents'] > button")).toHaveCount(5);
  }
  if(name==='blank'){
   const orders=page.locator("main [data-loop='kpis'] > div").filter({hasText:'Orders'});
   await expect(orders.locator('span').nth(1)).toHaveText('—');
   expect(await orders.locator('span').nth(2).evaluate(e=>({height:e.getBoundingClientRect().height,text:e.textContent}))).toEqual({height:20,text:'\u00a0'});
   await expect(page.locator("[data-loop='mp.targetChips'] span")).toHaveText('—');
  }
  await page.screenshot({path:`${dir}/current-overview-${name}-${width}.png`,fullPage:true});
  checks.push({surface:'server-rendered product HTML (no hydration or authenticated route)',name,width,noHorizontalScroll:fit});
 }
}
writeFileSync(`${dir}/current-render-checks.json`,JSON.stringify(checks,null,2));
console.log('Captured six current product render states at 1440 and 390; no horizontal scroll; blank delta retains 20px height.');
}finally{await browser.close();}

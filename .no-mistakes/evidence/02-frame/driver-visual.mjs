import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {installPinnedFonts} from '../e2e/fonts.ts';
import {renderDesignMarkup} from '../scripts/render-design.mjs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6DN54VTEX6MZG45D17D2FEQ';
const browser=await chromium.launch({headless:true,args:['--font-render-hinting=none','--disable-font-subpixel-positioning','--force-color-profile=srgb']});
const inventory=JSON.parse(await readFile('design/inventory/Main.json','utf8'));
const source=await readFile('design/Main.dc.html','utf8');
const fontLink='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">';
const results=[];
async function fonts(page){await page.evaluate(async()=>{await Promise.all(['400 15px Inter','500 14px Inter','600 15px Inter','400 12px "JetBrains Mono"'].map(f=>document.fonts.load(f)));await document.fonts.ready;});await page.addStyleTag({content:'html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }'});}
await fetch('http://127.0.0.1:55441/api/control',{method:'POST',body:JSON.stringify({reset:true})});
for(const [width,height] of [[1440,900],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});await installPinnedFonts(page,true);await page.goto('http://127.0.0.1:55441/overview');await expect(page.getByRole('button',{name:'Ask Master'})).toBeVisible();await fonts(page);
 for(const open of [false,true]){
  if(open)await page.getByRole('button',{name:'Ask Master'}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${evidence}/frame-${open?'open':'closed'}-${width}.png`,fullPage:true,animations:'disabled',caret:'hide'});
  const canvas=await browser.newPage({viewport:{width,height}});await installPinnedFonts(canvas,true);const body=await renderDesignMarkup(canvas,inventory,{view:'overview',dockOpen:open});
  await canvas.setContent(`<!doctype html><html><head>${fontLink}<style>${source.match(/<style>([\s\S]*?)<\/style>/)[1]}x-dc{display:contents}</style></head><body>${body}</body></html>`);
  await canvas.locator('[data-handler="goAdmin"]').evaluate(e=>e.remove());await canvas.locator('main').evaluate(e=>e.replaceChildren());await canvas.evaluate(()=>{for(const e of document.querySelectorAll('[data-loop],[data-if]'))e.style.display='contents';});await fonts(canvas);
  await canvas.screenshot({path:`${evidence}/design-${open?'open':'closed'}-${width}.png`,fullPage:true,animations:'disabled',caret:'hide'});await canvas.close();
  results.push({width,open,noHorizontalScroll:true,fontLoaded:await page.evaluate(()=>document.fonts.check('500 14px Inter'))});
 }
 await page.close();
}
await browser.close();await writeFile(evidence+'/visual-checks.json',JSON.stringify(results,null,2));

import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {installPinnedFonts} from '../e2e/fonts.ts';
import {accessibilityViolations} from '../e2e/accessibility-helper.ts';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6E90HCJ2TVF0P0ZWYPHKXJ1';
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();await installPinnedFonts(page,true);
const checks=[];
for(const width of [1440,390]){
 const design=readFileSync(`${dir}/design-${width}.png`),build=readFileSync(`${dir}/overview-${width}.png`);
 await page.setViewportSize({width:width*2,height:900});await page.setContent(`<html><body style="margin:0;display:flex;align-items:start"><img width="${width}" alt="Design" src="data:image/png;base64,${design.toString('base64')}"><img width="${width}" alt="Build" src="data:image/png;base64,${build.toString('base64')}"></body></html>`);await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>(e as HTMLImageElement).decode())));await page.screenshot({path:`${dir}/side-by-side-${width}.png`,fullPage:true});
}
await page.request.get('http://127.0.0.1:3107/__test?action=reset');await page.goto('http://127.0.0.1:3107/overview');await page.waitForLoadState('networkidle');
for(const width of [1440,390]){await page.setViewportSize({width,height:900});const violations=await accessibilityViolations(page);expect(violations).toEqual([]);checks.push({width,violations});}
await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:3107/overview');await page.waitForLoadState('networkidle');
const buttons=await page.locator('button').count();const reached=new Set<string>();const focus=[];
for(let i=0;i<buttons+2;i++){await page.keyboard.press('Tab');const active=await page.evaluate(()=>{const e=document.activeElement as HTMLElement;const s=getComputedStyle(e);return {index:Array.from(document.querySelectorAll('button')).indexOf(e as HTMLButtonElement),tag:e.tagName,name:e.innerText,handler:e.dataset.handler,outline:s.outline,offset:s.outlineOffset}});if(active.tag==='BUTTON'){reached.add(String(active.index));expect(active.outline).toBe('rgb(1, 105, 204) solid 2px');expect(active.offset).toBe('2px');focus.push(active);}}
expect(reached.size).toBe(buttons);writeFileSync(`${dir}/accessibility-keyboard.json`,JSON.stringify({checks,buttons,reached:reached.size,focus},null,2));
await browser.close();console.log(JSON.stringify({checks,buttons,reached:reached.size}));

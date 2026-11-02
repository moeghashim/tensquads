import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {installPinnedFonts} from '../e2e/fonts.ts';
import {renderDesignMarkup} from '../scripts/render-design.mjs';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6E1MX216VYJ1R76P4Y74P86';
const browser=await chromium.launch();
const context=await browser.newContext({deviceScaleFactor:1});
const page=await context.newPage();
await installPinnedFonts(page,true);
const reports=[];
const cases=['overview-seed','overview-no-store','overview-blanks','overview-email','overview-approved','overview-revising'];
try{
for(const name of cases){
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:width===1440?900:844});
 await page.setContent(readFileSync(`${dir}/${name}.html`,'utf8'));
 await page.evaluate(async()=>{await document.fonts.ready;});
 await expect(page.getByRole('heading',{name:'Revenue, last 14 days'})).toBeVisible();
 await expect(page.getByText('Demo data',{exact:true})).toBeVisible();
 const kpis=page.locator("main [data-loop='kpis'] > div");
 await expect(kpis).toHaveCount(6);
 const bars=page.locator("main [data-loop='bars']").first().locator('> div');
 if(name==='overview-no-store'){
 await expect(bars).toHaveCount(0);
 const values=await kpis.locator('span:nth-child(2)').allTextContents();
 expect(values).toEqual(['—','—','—','—','0','—']);
 await expect(page.getByText('Nothing waiting. Your squads are working inside their limits.',{exact:true})).toBeVisible();
 }else await expect(bars).toHaveCount(14);
 if(name==='overview-seed'){
 await expect(page.getByRole('heading',{name:'Good morning, Moe'})).toBeVisible();
 await expect(kpis.nth(4)).toContainText('331');
 await expect(kpis.nth(0)).toContainText('$8,420');
 await expect(kpis.nth(5)).toContainText('34h');
 await expect(page.locator("[data-design-contrast='overview-online-pill']")).toHaveText('4 of 5 squads online');
 await expect(page.locator("main [data-loop='agents'] > button")).toHaveCount(5);
 }
 if(name==='overview-email') await expect(page.getByRole('heading',{name:'Good morning, owner'})).toBeVisible();
 if(name==='overview-blanks'){
 await expect(page.getByRole('heading',{name:'Good morning, —'})).toBeVisible();
 await expect(kpis.nth(1).locator('span').nth(1)).toHaveText('—');
 expect(await kpis.nth(1).locator('span').nth(2).textContent()).toBe('\u00a0');
 const chips=page.locator("[data-loop='mp.targetChips'] > span");
 expect(await chips.allTextContents()).toEqual(['—','—','Stock-outs: 0']);
 await expect(page.locator("main [data-loop='missionProposals']")).toContainText('Mission pending. Your Master will propose one.');
 }
 if(name==='overview-approved'){
 await expect(kpis.nth(4)).toContainText('332');
 await expect(page.locator("[data-if='dockUnread']")).toHaveText('3');
 await expect(page.locator("main [data-loop='agents']")).toContainText('Refund $42 on #A-1012 (approved)');
 }
 if(name==='overview-revising'){
 await expect(page.getByText('Revised mission on its way',{exact:true})).toBeVisible();
 await expect(page.getByText('Nothing waiting. Your squads are working inside their limits.',{exact:true})).toHaveCount(0);
 await expect(page.locator("main [data-loop='approvals'] > div")).toHaveCount(0);
 await expect(page.locator("[data-if='dockUnread']")).toHaveCount(0);
 }
 const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,chart:document.querySelector("main [data-loop='bars']")?.parentElement?.getBoundingClientRect().height}));
 expect(dimensions.scroll).toBeLessThanOrEqual(width);
 expect(dimensions.chart).toBe(201);
 await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true});
 reports.push({name,width,...dimensions,assertions:'passed',surface:'isolated SSR render of actual components; not authenticated E2E'});
 }
}
for(const width of [1440,390]){
 const canvas=await context.newPage();await installPinnedFonts(canvas,true);await canvas.setViewportSize({width,height:width===1440?900:844});
 const inventory=JSON.parse(readFileSync('design/inventory/Main.json','utf8'));
 const body=await renderDesignMarkup(canvas,inventory,{view:'overview',dockOpen:false});
 const source=readFileSync('design/Main.dc.html','utf8');const css=source.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
 await canvas.setContent(`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`);
 await canvas.locator("[data-handler='goAdmin']").evaluate(e=>e.remove());
 await canvas.evaluate(async()=>{for(const node of document.querySelectorAll('[data-loop], [data-if]')) (node as HTMLElement).style.setProperty('display','contents');await document.fonts.ready;});
 await canvas.screenshot({path:`${dir}/design-${width}.png`,fullPage:true});
 await canvas.close();
}
writeFileSync(`${dir}/render-checks.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();}

import { chromium } from '@playwright/test';
import {writeFileSync} from 'node:fs';
const root='/Users/moeghashim/.no-mistakes/evidence/01M6NM17MKPTFEAH7F40YRS7D2/';
const browser=await chromium.launch();
const context=await browser.newContext();
const page=await context.newPage();
const records=[];
try {
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const response=await page.goto('http://127.0.0.1:4317/');
  await page.locator('h1').waitFor();
  await page.screenshot({path:root+'home-'+width+'.png',fullPage:true});
  records.push({width,status:response.status(),title:await page.title(),h1:await page.locator('h1').allTextContents(),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
 }
 await page.goto('http://127.0.0.1:4317/traffic');
 await page.screenshot({path:root+'unsigned-traffic.png',fullPage:true});
 records.push({trafficUnsignedFinalUrl:page.url(),text:(await page.locator('body').innerText()).slice(0,600)});
 writeFileSync(root+'browser.json',JSON.stringify(records,null,2));
 console.log(JSON.stringify(records));
} finally {await context.close();await browser.close();}

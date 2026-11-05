import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6NC4RDTNH0JF13FF0F042VJ';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://localhost:3001/');
 await page.getByRole('heading',{level:1}).waitFor();
 await page.screenshot({path:`${evidence}/default-home-1440.png`,fullPage:true});
 const heading=await page.getByRole('heading',{level:1}).innerText();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${evidence}/default-home-390.png`,fullPage:true});
 const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 writeFileSync(`${evidence}/web-check.json`,JSON.stringify({url:page.url(),heading,widths},null,2));
 console.log(JSON.stringify({heading,widths}));
} finally {await browser.close();}

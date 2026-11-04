import {chromium} from '@playwright/test';
import globalSetup from '../e2e/global-setup.ts';
import {appendFileSync} from 'node:fs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6KZB4CV27SEBFR2FEWTCWC1';
const log=(s)=>{ console.log(s); appendFileSync(`${evidence}/parallel-startup.log`,s+'\n') };
const b=await chromium.launch();
try {
 await Promise.all([29669,25042].map(async port=>{
 const origin=`http://localhost:${port}`;
 log(`RUN warmup ${origin}`);
 await globalSetup({projects:[{use:{baseURL:origin}}]});
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto(origin); await p.getByRole('button',{name:'Get started',exact:true}).first().waitFor({timeout:5000}).catch(()=>{});
 await p.screenshot({path:`${evidence}/home-${port}.png`,fullPage:true});
 log(`${origin} title=${await p.title()} heading=${await p.locator('h1').allTextContents()} screenshot=home-${port}.png`);
 await p.close();
 }));
}finally {await b.close()}

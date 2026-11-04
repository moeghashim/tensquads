import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6M8G6W2JNYBACG7F0R8T5C7';
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const results=[];
 for(const path of ['/admin','/admin/images']) {
  const response=await page.goto('http://localhost:3001'+path);
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page).toHaveTitle('Sign in');
  await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Platform admin'})).toHaveCount(0);
  results.push({path,url:page.url(),status:response.status(),heading:await page.getByRole('heading').allTextContents(),adminNavigationVisible:false});
 }
 await page.screenshot({path:evidence+'/visitor-admin-signin-1440.png',fullPage:true});
 await context.addCookies([{name:'ts_special_account',value:'northwind.'+Date.now(),url:'http://localhost:3001',httpOnly:true,sameSite:'Lax'}]);
 await page.goto('http://localhost:3001/admin');
 await expect(page).toHaveURL(/\/signin$/);
 results.push({action:'signed-out request with forged account cookie',url:page.url()});
 for (const fn of ['loadAdminAccounts','loadAdminImages','loadAdminAttention','openSpecialSession']) {
   const result=await page.evaluate(async (name)=> {
    const mod=await import('/src/server/admin.ts');
    try { const value=await mod[name](name==='openSpecialSession'?{data:'northwind'}:undefined); return {returned:value}; }
    catch(e) { return {redirectTo:e?.options?.to ?? e?.to ?? null, type:e?.constructor?.name, message:String(e)}; }
   },fn);
   if(result.redirectTo!=='/signin') throw new Error(fn+': '+JSON.stringify(result));
   results.push({serverFunction:fn,...result});
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:evidence+'/visitor-admin-signin-390.png',fullPage:true});
 await writeFile(evidence+'/visitor-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}

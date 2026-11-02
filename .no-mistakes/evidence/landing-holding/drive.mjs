import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6DXB99H08YYD3P5TGEG06H0';
const base='http://127.0.0.1:8799';
const log=[];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 for (const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  const response=await page.goto(base);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Hire a squad of AI agents to run your business',exact:true})).toBeVisible();
  await expect(page.getByText('Coming soon',{exact:true})).toBeVisible();
  await expect(page.locator('main p')).toHaveText('Orders, support, marketing, finance and stock, each handled by its own agent. One master keeps them in sync and only interrupts you when it matters.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${evidence}/holding-${width}.png`,fullPage:true});
  log.push({scenario:'holding',width,status:response.status(),heading:await page.locator('h1').innerText(),horizontalOverflow:false});
 }
 const api=context.request;
 const head=await api.head(base);expect(head.status()).toBe(200);expect((await head.body()).length).toBe(0);
 expect(head.headers()['content-type']).toBe('text/html; charset=utf-8');
 expect(head.headers()['x-content-type-options']).toBe('nosniff');
 expect(head.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 log.push({request:'HEAD /',status:head.status(),bodyBytes:0,headers:head.headers()});
 for(const method of ['POST','PUT','DELETE','OPTIONS']) {
 const response=await api.fetch(base,{method,maxRedirects:0});
 expect(response.status()).toBe(405);expect(response.headers().allow).toBe('GET, HEAD');
 log.push({request:`${method} /`,status:response.status(),allow:response.headers().allow});
 }
 const unknown=await api.get(base+'/unknown-path',{maxRedirects:0});expect(unknown.status()).toBe(302);expect(unknown.headers().location).toBe('https://10squads.com/');log.push({request:'GET /unknown-path',status:302,location:unknown.headers().location});
 const www=await api.get(base+'/review/plan',{headers:{host:'www.10squads.com'},maxRedirects:0});expect(www.status()).toBe(301);expect(www.headers().location).toBe('https://10squads.com/review/plan');log.push({request:'GET www.10squads.com/review/plan (local Host header)',status:301,location:www.headers().location});
 await page.setViewportSize({width:1440,height:900});
 for(const path of ['/review','/review/']) {
 const response=await page.goto(base+path);expect(response.status()).toBe(200);expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
 await expect(page.getByRole('heading',{name:'tensquads review',exact:true})).toBeVisible();
 expect(await page.locator('a.card').count()).toBe(12);
 }
 await page.screenshot({path:`${evidence}/review-index.png`,fullPage:true});
 await page.getByRole('link',{name:'Build plan Decisions, architecture, phases and the proof of concept'}).click();
 await expect(page.getByRole('heading',{name:'tensquads — Build Plan',exact:true})).toBeVisible();
 await expect(page.getByText('<slug>.10squads.com',{exact:true}).first()).toBeVisible();
 expect(await page.getByRole('img').count()).toBe(3);
 await page.screenshot({path:`${evidence}/review-plan.png`,fullPage:true});
 log.push({scenario:'review-plan',url:page.url(),diagrams:3,domain:'<slug>.10squads.com',text:await page.locator('h1').innerText()});
 await page.getByRole('link',{name:'Back to review'}).click();
 const links=await page.locator('a.card[href*="/review/design/"]').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),name:n.innerText})));
 for(const link of links) {
 const response=await page.goto(base+link.href);expect(response.status()).toBe(200);
 await expect(page.locator('x-dc')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('{{');
 await expect(page.locator('body')).not.toHaveText('');
 await page.screenshot({path:`${evidence}/${link.href.split('/').pop()}.png`,fullPage:true});
 log.push({scenario:'design-render',url:page.url(),status:response.status(),bodyCharacters:(await page.locator('body').innerText()).length,pageErrors:[...errors]});
 }
 await page.goto(base+'/review/design/Onboarding.dc.html');
 await page.getByRole('button',{name:'A new business',exact:false}).click();
 await expect(page.getByLabel('Business name',{exact:true})).toBeVisible();
 await page.getByLabel('Business name',{exact:true}).fill('Local Review Coffee');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:'A new business',exact:false}).click();
 await expect(page.getByLabel('Business name',{exact:true})).toHaveValue('Local Review Coffee');
 await page.screenshot({path:`${evidence}/review-interaction.png`,fullPage:true});
 log.push({scenario:'interactive-design',action:'Choose a new business, enter a name, go back, return',businessName:await page.getByLabel('Business name',{exact:true}).inputValue()});
 const missing=await api.get(base+'/review/missing.html',{maxRedirects:0});expect(missing.status()).toBe(404);expect(missing.headers()['x-robots-tag']).toBe('noindex, nofollow');log.push({request:'GET /review/missing.html',status:missing.status(),robots:missing.headers()['x-robots-tag']});
 expect(errors).toEqual([]);
 log.push({pageErrors:errors,result:'All live checks passed'});
} catch(error){log.push({failure:error.stack});throw error;}
finally {writeFileSync(`${evidence}/live-results.json`,JSON.stringify(log,null,2));await browser.close();}

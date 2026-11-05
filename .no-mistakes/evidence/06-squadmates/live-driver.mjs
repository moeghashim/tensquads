import { chromium, expect } from '/Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6N8JDS7M4WE6C45DFZ3BHB9/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { installPinnedFonts } from '/Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6N8JDS7M4WE6C45DFZ3BHB9/e2e/fonts.ts';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6N8JDS7M4WE6C45DFZ3BHB9';
mkdirSync(evidence,{recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
await installPinnedFonts(page,true);
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
const results=[];
async function scenario(name,fn){try{const detail=await fn();results.push({name,result:'pass',detail});console.log('PASS '+name)}catch(e){results.push({name,result:'fail',error:e.message});console.log('FAIL '+name+' '+e.message);await page.screenshot({path:evidence+'/failure-'+results.length+'.png',fullPage:true});}}
async function hydrated(){await page.waitForFunction(()=>Array.from(document.querySelectorAll('button,a,input')).some(n=>Object.keys(n).some(k=>k.startsWith('__reactProps$'))));}
async function fits(){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
await scenario('Review characters: ten named drawings, nine states, small sizes and reduced motion',async()=>{
 await page.goto('http://localhost:3472/review/characters');
 await expect(page.getByRole('heading',{name:'Squadmates',exact:true})).toBeVisible();
 const names=['Petra','Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor','Delphi','Sydney'];
 await expect(page.locator('.cast .mate')).toHaveCount(10);
 for(const name of names){const card=page.locator('.mate').filter({has:page.locator('b',{hasText:new RegExp('^'+name+'$')})});await expect(card.locator('svg')).toHaveAttribute('role','img');await expect(card.locator('svg')).toHaveAttribute('aria-label',new RegExp('^'+name+', '));}
 await expect(page.locator('.states tbody tr')).toHaveCount(4);
 for(const state of ['waiting','planning','running','checking','done','sentback','blocked','escalated','dropped']) await expect(page.locator('.states svg[aria-label$=", '+state+'"]')).toHaveCount(3);
 for(const size of [16,24,32,48,96])await expect(page.locator('.sizes svg[width="'+size+'"]')).toHaveCount(1);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:evidence+'/characters-1440.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.sm-blink').first().evaluate(n=>getComputedStyle(n).animationName)).toBe('none');
 await page.setViewportSize({width:390,height:844});await fits();
 await page.screenshot({path:evidence+'/characters-390.png',fullPage:true});
 return {cast:names,states:9,sizes:[16,24,32,48,96],reducedMotion:'animation none',mobile:'no outer horizontal scroll'};
});
await scenario('Choose new and existing business squads: character names, grey role labels, drawings, selection and Petra copy',async()=>{
 const observations=[];
 for(const width of [1440,390])for(const kind of ['new','existing']){
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.goto('http://localhost:3471/signup');await hydrated();
  await page.getByRole('button',{name:kind==='new'?/A new business/:/An existing business/}).click();
  if(kind==='new')await expect(page.getByText('Petra uses this to brief every squad. You can change it later.')).toBeVisible();
  await page.getByRole('button',{name:'Choose my squads'}).click();
  const choices=page.locator('[data-handler="a.toggle"]');
  const expected=[['Pisa','Orders'],['Kyoto','Support'],['Rio','Marketing'],['Zurich','Finance'],['Giza','Inventory'],['Machu','Market researcher'],['Angkor','Website builder']];
  await expect(choices).toHaveCount(7);
  for(const [name,role] of expected){const choice=choices.filter({hasText:name});await expect(choice).toHaveCount(1);await expect(choice).toContainText(role);await expect(choice.locator('svg').first()).toHaveAttribute('aria-hidden','true');expect(await choice.locator('svg').first().getAttribute('aria-label')).toBe(null);}
  const selected=await choices.locator('[aria-pressed]').count();
  await expect(page.getByText((kind==='new'?'3':'4')+" squads and Petra's squad will be created.",{exact:false})).toBeVisible();
  await expect(page.getByText('Petra will propose a mission for each squad; you approve them in your inbox.',{exact:false})).toBeVisible();
  const first=choices.first();const before=await first.getAttribute('aria-pressed');await first.click();await expect(first).toHaveAttribute('aria-pressed',before==='true'?'false':'true');await first.click();
  await first.focus();await page.keyboard.press('Tab');expect(await choices.nth(1).evaluate(n=>n===document.activeElement)).toBe(true);
  const focus=await choices.nth(1).evaluate(n=>({width:getComputedStyle(n).outlineWidth,color:getComputedStyle(n).outlineColor,offset:getComputedStyle(n).outlineOffset}));
  expect(focus).toEqual({width:'2px',color:'rgb(1, 105, 204)',offset:'2px'});
  await fits();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:evidence+'/signup-'+kind+'-'+width+'.png',fullPage:true});
  observations.push({kind,width,choices:await choices.allTextContents(),focus});
 }
 return observations;
});
await scenario('Deselect all squads: zero-selection guard blocks account form and keyboard can restore a squad',async()=>{
 await page.goto('http://localhost:3471/signup');await hydrated();await page.getByRole('button',{name:/A new business/}).click();await page.getByRole('button',{name:'Choose my squads'}).click();
 const picked=page.locator('[data-handler="a.toggle"][aria-pressed="true"]');
 while(await picked.count())await picked.first().click();
 await expect(page.getByText('Pick at least one squad to start.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Create my workspace'}).click();await expect(page.getByLabel('Email',{exact:true})).toHaveCount(0);
 await page.screenshot({path:evidence+'/signup-zero-390.png',fullPage:true});
 const first=page.locator('[data-handler="a.toggle"]').first();await first.focus();await page.keyboard.press('Space');await expect(first).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText("1 squad and Petra's squad will be created.",{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Create my workspace'}).click();await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 return {zero:'no account form',restored:'keyboard selection opens account form'};
});
const protectedRoutes=[];
for(const path of ['/overview','/chat','/agents','/agents/support','/traffic','/rules','/admin/images']){
 await page.goto('http://localhost:3471'+path);await hydrated();protectedRoutes.push({requested:path,actual:new URL(page.url()).pathname});
}
await page.screenshot({path:evidence+'/workspace-auth-required.png',fullPage:true});
writeFileSync(evidence+'/live-results.json',JSON.stringify({results,protectedRoutes,pageErrors:errors,environment:{clerkPublishable:false,clerkSecret:false,testDatabase:false}},null,2));
console.log(JSON.stringify({results:results.map(({name,result,error})=>({name,result,error})),protectedRoutes,pageErrors:errors},null,2));
await browser.close();
process.exitCode=results.some(r=>r.result==='fail')?1:0;

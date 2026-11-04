import { chromium, expect } from '/Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6M72YKE2Q67QNDJA3VQDYA0/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { installPinnedFonts } from '/Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6M72YKE2Q67QNDJA3VQDYA0/e2e/fonts.ts';
import { waitForHydration, waitForScreenFonts } from '/Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6M72YKE2Q67QNDJA3VQDYA0/e2e/support.ts';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6M72YKE2Q67QNDJA3VQDYA0';
const browser=await chromium.launch({headless:true});
const report={signup:[],guard:null,workspaceAccess:[],errors:[]};
try {
const page=await browser.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
await installPinnedFonts(page);
const roster=[['Pisa','Orders'],['Kyoto','Support'],['Rio','Marketing'],['Zurich','Finance'],['Giza','Inventory'],['Machu','Market researcher'],['Angkor','Website builder']];
for(const kind of ['new','existing']) {
 await page.goto('http://localhost:3106/signup'); await waitForHydration(page);
 await page.getByRole('button',{name:kind==='new'?/A new business/:/An existing business/}).click();
 await page.getByRole('button',{name:'Choose my squads'}).click();
 const choices=page.locator('[data-loop="agents"] button'); await expect(choices).toHaveCount(7);
 for(const [name,role] of roster) {
  const choice=choices.filter({hasText:name}); await expect(choice).toHaveCount(1);
  await expect(choice).toHaveAccessibleName(new RegExp('^'+name+' ?'+role));
  await expect(choice.locator('svg[viewBox="0 0 64 64"]')).toHaveAttribute('aria-hidden','true');
  await expect(choice.locator('svg[viewBox="0 0 64 64"]')).not.toHaveAttribute('aria-label');
  await expect(choice.locator('[data-design-contrast="squadmate-role-tag"]')).toHaveCSS('color','rgb(143, 143, 143)');
 }
 await expect(page.getByText(`${kind==='new'?3:4} squads and Petra's squad will be created.`,{exact:false})).toBeVisible();
 await expect(page.getByText('Petra will propose a mission for each squad; you approve them in your inbox.',{exact:false})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/\bmaster\b/i);
 await expect(page.locator('body style')).toHaveCount(0);
 const blinkRules=await page.locator('head style').evaluateAll(nodes=>nodes.filter(n=>n.textContent.includes('@keyframes sm-blink')).length); assert.equal(blinkRules,1);
 const keyboardSeen=new Set();
 for(let n=0;n<30;n++) {await page.keyboard.press('Tab');const t=await page.evaluate(()=>document.activeElement?.textContent?.trim()??'');for(const [name] of roster)if(t.startsWith(name))keyboardSeen.add(name);}
 assert.equal(keyboardSeen.size,7);
 const names=await choices.allTextContents(); const selected=await choices.evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-pressed')==='true').map(n=>n.textContent));
 const captures=[];
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:width===1440?900:844}); await waitForScreenFonts(page);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  const path=`${evidence}/signup-${kind}-${width}.png`; await page.screenshot({path,fullPage:true});captures.push(path);
 }
 report.signup.push({kind,names,selected,keyboardReached:[...keyboardSeen],roleTagColor:'#8f8f8f',decorativeFaces:true,headBlinkRules:blinkRules,noHorizontalScroll:[1440,390],captures});
}
await page.goto('http://localhost:3106/signup'); await waitForHydration(page);
await page.getByRole('button',{name:/A new business/}).click(); await page.getByRole('button',{name:'Choose my squads'}).click();
for(const name of [/Ready for your first order/,/Replies in your voice/,/Drafts your launch campaign/])await page.getByRole('button',{name}).click();
await page.getByRole('button',{name:'Create my workspace'}).click();
await expect(page.getByText('Pick at least one squad to start.',{exact:false})).toBeVisible();await expect(page.getByLabel('Email')).toHaveCount(0);
await page.screenshot({path:`${evidence}/signup-zero-squads-390.png`,fullPage:true});
report.guard={url:page.url(),message:await page.getByText('Pick at least one squad to start.',{exact:false}).innerText(),accountFormAbsent:true};
for(const route of ['/overview','/chat','/agents','/agents/support','/traffic','/rules']) {
 await page.goto('http://localhost:3106'+route); await waitForHydration(page);
 await expect(page).toHaveURL(/\/signin$/);report.workspaceAccess.push({requested:route,landed:page.url()});
}
await page.screenshot({path:`${evidence}/workspace-access-blocker.png`,fullPage:true});
assert.deepEqual(report.errors,[]);
}finally {writeFileSync(`${evidence}/live-observations.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));

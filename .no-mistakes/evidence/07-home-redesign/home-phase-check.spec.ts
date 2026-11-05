import { writeFileSync } from 'node:fs';
import { test, expect, waitForScreenFonts, expectNoHorizontalScroll } from './support.ts';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6NNV77CMZM2SZ3FT396JEV2';
for (const width of [1440,390]) {
 test(`approved characters, mobile roles, prices and inert approvals at ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/'); await waitForScreenFonts(page);
  await page.evaluate(async()=>{await Promise.all([500,600,700].map(w=>document.fonts.load(`${w} 18px 'Familjen Grotesk'`)));await document.fonts.ready;});
  await expectNoHorizontalScroll(page);
  const pairs=[['Pisa','Orders'],['Kyoto','Support'],['Rio','Marketing'],['Zurich','Finance'],['Giza','Inventory'],['Machu','Market researcher'],['Angkor','Website builder']];
  for (const [name,role] of pairs) {const row=page.locator('.mini').filter({has:page.getByText(name,{exact:true})});await expect(row.locator('.mini-name')).toHaveText(name);await expect(row.locator('.tag')).toBeVisible();await expect(row.locator('.tag')).toHaveText(role);}
  const characters=await page.locator('svg[role="img"]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('aria-label')?.split(',')[0]))].sort());
  expect(characters).toEqual(['Petra','Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor','Delphi'].sort());
  await expect(page.locator('.price > span')).toHaveText(['$49','$149','$399']);
  expect(await page.locator('h1').evaluate(n=>getComputedStyle(n).fontFamily)).toContain('Familjen Grotesk');
  await page.screenshot({path:`${evidence}/homepage-${width}.png`,fullPage:true,animations:'disabled'});
  const before=await page.locator('.sheet').innerText(); const url=page.url();const writes:string[]=[];
  page.on('request',r=>{if(r.method()!=='GET')writes.push(`${r.method()} ${r.url()}`)});
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('button',{name:'Decline',exact:true}).click();}
  expect(await page.locator('.sheet').innerText()).toBe(before);expect(page.url()).toBe(url);expect(writes).toEqual([]);expect(errors).toEqual([]);
  await page.getByRole('button',{name:'New business',exact:true}).click();await page.getByRole('textbox',{name:'Describe your business'}).fill('A disposable test business');await page.getByRole('button',{name:'Existing business',exact:true}).click();await expect(page.getByRole('textbox',{name:'Describe your business'})).toHaveValue('A disposable test business');
  await page.getByRole('button',{name:'A cafe with a wholesale side',exact:true}).click();await expect(page.getByRole('textbox',{name:'Describe your business'})).toHaveValue('A cafe with a wholesale side');
  writeFileSync(`${evidence}/observations-${width}.json`, JSON.stringify({width,characters,roles:pairs,prices:['$49','$149','$399'],approvalBefore:before,approvalAfter:await page.locator('.sheet').innerText(),writeRequests:writes,pageErrors:errors,horizontalScroll:false},null,2));
 });
}

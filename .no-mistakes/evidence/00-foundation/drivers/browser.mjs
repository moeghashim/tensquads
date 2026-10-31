import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6A41GP1MDXJ1Q12SBYVHE25';
const browser=await chromium.launch({headless:true});
const observations=[];
try {
 for (const [width,height] of [[1440,900],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');
  assert.equal(response.status(),200); assert.equal(await page.title(),'tensquads');
  assert.equal((await page.locator('body').innerText()).trim(),'');
  assert.deepEqual(errors,[]);
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(dimensions.scroll<=width);
  const axe=await new AxeBuilder({page}).disableRules(['page-has-heading-one']).analyze();
  assert.deepEqual(axe.violations,[]);
  await page.screenshot({path:`${evidence}/empty-${width}.png`,fullPage:true});
  writeFileSync(`${evidence}/empty-${width}.html`,await page.content());
  observations.push({width,height,status:response.status(),title:await page.title(),body:'',errors,dimensions,axeViolations:axe.violations});
  await context.close();
 }
 writeFileSync(`${evidence}/browser.json`,JSON.stringify(observations,null,2));
 console.log(JSON.stringify(observations));
} finally {await browser.close();}

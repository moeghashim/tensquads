import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {SQUADMATES,AGENT_LOOP_STATES,squadmateMarkup,UnknownSquadmateError,UnknownSquadmateStateError} from '@tensquads/squadmates';
import {avatar as oldAvatar,SQUADMATES as oldMates} from './base/apps/landing/review-src/squadmates.mjs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6HPGGQBH38TSSPYH3BCKY6Q';
const report={api:{},html:{},browser:[]};
const petra=SQUADMATES.find(m=>m.id==='master');
assert.deepEqual([petra.name,petra.roleTag,petra.role],['Petra','Master','Master']);
report.api.petra=petra;
const states=['idle',...AGENT_LOOP_STATES.map(s=>s.id)];
let comparisons=0;
for(const mate of oldMates) for(const state of states) for(const size of [16,24,32,48,64,96,112]) {
 assert.equal(squadmateMarkup(mate.id,state,size),oldAvatar(mate,state,size)); comparisons++;
}
report.api.preservedDrawings=comparisons;
report.api.invalidInputs=[];
for(const id of ['legal','__proto__','constructor','<script>alert(1)</script>','']) {
 assert.throws(()=>squadmateMarkup(id,'idle',64),UnknownSquadmateError);
 try{squadmateMarkup(id,'idle',64)}catch(e){report.api.invalidInputs.push({id,error:e.name,message:e.message})}
}
for(const state of ['asleep','__proto__','constructor','<script>alert(1)</script>','']) {
 assert.throws(()=>squadmateMarkup('master',state,64),UnknownSquadmateStateError);
}
report.api.invalidStatesRejected=true;
const responses=await Promise.all([fetch('http://localhost:8790/review/characters'),fetch('http://localhost:8789/review/characters')]);
for(const response of responses)assert.equal(response.status,200);
const [before,after]=await Promise.all(responses.map(r=>r.text()));
writeFileSync(`${evidence}/characters-before.html`,before);
writeFileSync(`${evidence}/characters-after.html`,after);
const card=`<div class="mate" style="background:${SQUADMATES.at(-1).tint}">${squadmateMarkup('hr','idle',112)}<b>Sydney</b><span class="tag">People</span><p class="pl">Named after Sydney, Australia</p><p>Hires people and runs onboarding.</p></div>`;
assert.equal(after.split(card).length,2);
assert.equal(after.replace(card,''),before);
assert.equal(after,readFileSync('apps/landing/public/review/characters.html','utf8'));
report.html={beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),sydneyCardBytes:Buffer.byteLength(card),identicalApartFromSydney:true,beforeSha256:createHash('sha256').update(before).digest('hex'),afterSha256:createHash('sha256').update(after).digest('hex'),headers:Object.fromEntries(responses[1].headers)};
const browser=await chromium.launch();
try{
 for(const [label,port] of [['before',8790],['after',8789]])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  await page.goto(`http://localhost:${port}/review/characters`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.mate').count(),label==='after'?10:9);
  assert.equal(await page.locator('.mate').first().locator('b').innerText(),'Petra');
  assert.equal(await page.locator('.mate').first().locator('.tag').innerText(),'Master');
  const stateRows=await page.locator('.states tbody tr').count(); assert.equal(stateRows,4);
  assert.equal(await page.locator('.states svg').count(),27);
  if(label==='after'){
   const sydney=page.locator('.mate').filter({has:page.locator('b',{hasText:'Sydney'})});
   assert.equal(await sydney.locator('.tag').innerText(),'People');
   assert.equal(await sydney.locator('svg').getAttribute('aria-label'),'Sydney, People');
   assert.equal(await sydney.locator('svg text').textContent(),'Sydney');
  }
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tableWidth:document.querySelector('.states table').scrollWidth,tableContainer:document.querySelector('.states').clientWidth,blink:getComputedStyle(document.querySelector('.sm-blink')).animationName}));
  assert.equal(dimensions.scrollWidth,width);assert.equal(dimensions.blink,'none');assert.deepEqual(errors,[]);
  await page.screenshot({path:`${evidence}/characters-${label}-${width}.png`,fullPage:true});
  if(label==='after'&&width===1440){
   await page.emulateMedia({reducedMotion:'no-preference'});
   assert.equal(await page.locator('.sm-blink').first().evaluate(el=>getComputedStyle(el).animationName),'sm-blink');
   await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Back to review');
  }
  report.browser.push({label,width,cards:label==='after'?10:9,stateDrawings:27,dimensions,pageErrors:errors,consoleErrors});
  await page.close();
 }
}finally{await browser.close();writeFileSync(`${evidence}/validation.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));

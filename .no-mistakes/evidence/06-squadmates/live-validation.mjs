import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import * as api from '@tensquads/squadmates';
import { charactersPage } from '../apps/landing/review-src/characters.mjs';
import worker from '../apps/landing/src/index.js';

const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6HHE0P2XT4TFRDYPX9KTYGZ';
const base = '76dd1b47821f2d313a40f462c07155e408beb112';
const old = path => execFileSync('git', ['show', `${base}:${path}`], {encoding:'utf8'});
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const oldDrawingURL = moduleURL(old('apps/landing/review-src/squadmates.mjs'));
const oldDrawing = await import(oldDrawingURL);
const oldSheet = await import(moduleURL(old('apps/landing/review-src/characters.mjs').replace('"./squadmates.mjs"', JSON.stringify(oldDrawingURL))));
const states = ['idle', ...api.AGENT_LOOP_STATES.map(s=>s.id)];
assert.equal(states.length,10);
assert.equal(api.AGENT_LOOP_STATES.some(s=>s.id==='idle'),false);
let calls = 0;
for (const mate of oldDrawing.SQUADMATES) for (const state of states) for (const size of [16,24,32,44,48,64,96,112]) {
  assert.equal(api.squadmateMarkup(mate.id,state,size),oldDrawing.avatar(mate,state,size));
  calls++;
}
assert.equal(api.SQUADMATE_CSS,oldDrawing.SQUADMATE_CSS);
const currentBody=charactersPage();
const sydneyCard=currentBody.match(/<div class="mate"[^>]*>[^]*?<b>Sydney<\/b>[^]*?<\/div>/)?.[0];
// Find the Sydney card without swallowing earlier cards.
const cards=currentBody.match(/<div class="mate"[^]*?<\/div>/g);
const added=cards.filter(c=>c.includes('<b>Sydney</b>'));
assert.equal(added.length,1);
assert.equal(currentBody.replace(added[0],''),oldSheet.charactersPage());
const hr=api.SQUADMATES.find(m=>m.id==='hr');
const support=api.SQUADMATES.find(m=>m.id==='support');
assert.equal(hr.tint,'#def5ee'); assert.equal(hr.body,support.body);
assert.equal(hr.place,'Sydney, Australia'); assert.equal(hr.roleTag,'People');
assert.equal(api.SQUADMATES.find(m=>m.id==='master').roleTag,null);
const rejected=[];
for(const id of ['legal','','__proto__','constructor','<script>alert(1)</script>']) {
  assert.throws(()=>api.squadmateMarkup(id,'idle',64),api.UnknownSquadmateError);
  rejected.push(id);
}
for(const state of ['asleep','','__proto__']) assert.throws(()=>api.squadmateMarkup('hr',state,64),api.UnknownSquadmateStateError);
const built=readFileSync('apps/landing/public/review/characters.html','utf8');
assert.ok(built.includes(currentBody));
const before=built.replace(currentBody,oldSheet.charactersPage());
writeFileSync(`${evidence}/characters-before.html`,before);
writeFileSync(`${evidence}/characters-after.html`,built);
const grid=`<!doctype html><meta charset="utf-8"><title>Live package consumer: all characters and draw states</title>${api.SQUADMATE_CSS}<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td,th{padding:8px;text-align:center}td:first-child{text-align:left}</style><h1>All characters and draw states</h1><table><tr><th>Character</th>${states.map(s=>`<th>${s}</th>`).join('')}</tr>${api.SQUADMATES.map(m=>`<tr><th>${m.name}</th>${states.map(s=>`<td>${api.squadmateMarkup(m.id,s,64)}</td>`).join('')}</tr>`).join('')}</table>`;
writeFileSync(`${evidence}/all-states.html`,grid);
const server=createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/before'||url.pathname==='/all-states') {res.writeHead(200,{'content-type':'text/html'}).end(url.pathname==='/before'?before:grid);return;}
 const response=await worker.fetch(new Request(url),{ASSETS:{fetch:async request=> {
  const asset=new URL(request.url).pathname;
  if(asset==='/review/characters.html')return new Response(built,{headers:{'content-type':'text/html'}});
  return new Response('Not found',{status:404});
 }}});
 res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500).end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(`${origin}/review/characters`,{waitUntil:'networkidle'});
 assert.equal(response.status(),200);
 assert.equal(await page.locator('.mate').count(),10);
 const card=page.locator('.mate').filter({has:page.locator('b',{hasText:/^Sydney$/})});
 assert.equal(await card.locator('svg text').textContent(),'Sydney');
 assert.equal(await card.locator('.tag').textContent(),'People');
 assert.equal(await card.locator('.pl').textContent(),'Named after Sydney, Australia');
 assert.ok((await card.textContent()).includes('Hires people and runs onboarding.'));
 assert.equal(await card.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(222, 245, 238)');
 assert.equal(await card.locator('svg > rect').first().getAttribute('fill'),'#34b98c');
 assert.equal(await page.locator('.mate').first().locator('.tag').textContent(),'Master');
 assert.equal(await page.locator('.states th').count(),10);
 assert.equal(await page.locator('.states svg').count(),27);
 assert.equal(await page.locator('.sizes svg').count(),5);
 await page.screenshot({path:`${evidence}/characters-after-1440.png`,fullPage:true});
 await card.screenshot({path:`${evidence}/sydney-card.png`});
 await page.goto(`${origin}/before`,{waitUntil:'networkidle'});
 assert.equal(await page.locator('.mate').count(),9);
 await page.screenshot({path:`${evidence}/characters-before-1440.png`,fullPage:true});
 await page.goto(`${origin}/all-states`,{waitUntil:'networkidle'});
 assert.equal(await page.locator('svg').count(),100);
 assert.equal(await page.locator('svg').evaluateAll(svgs=>svgs.every(s=>s.getBoundingClientRect().width===64&&s.getBoundingClientRect().height===64)),true);
 await page.screenshot({path:`${evidence}/all-states-1440.png`,fullPage:true});
 await page.goto(`${origin}/review/characters`,{waitUntil:'networkidle'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${evidence}/characters-after-390.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 const transcript={packageImport:'@tensquads/squadmates',legacyExactComparisons:calls,reviewByteContract:'Removing only Sydney card yields byte-for-byte legacy charactersPage() output',roster:api.SQUADMATES.map(({id,name,place,roleTag})=>({id,name,place,roleTag})),loopStates:api.AGENT_LOOP_STATES.map(s=>s.id),drawStates:states,unknownIdsRejected:rejected,unknownStatesRejected:['asleep','','__proto__'],httpStatus:response.status(),browser:'Playwright Chromium, isolated profile',browserErrors:errors,renderedGridSVGs:100,mobileWidth:390,mobileHorizontalOverflow:false};
 writeFileSync(`${evidence}/live-results.json`,JSON.stringify(transcript,null,2)+'\n');
 console.log(JSON.stringify(transcript,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

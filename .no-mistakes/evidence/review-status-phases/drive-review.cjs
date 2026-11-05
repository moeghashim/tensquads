const {execFileSync,spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=process.cwd();
const evidence=__dirname;
const fixture=path.join(root,'.phase-live');
const {chromium}=require(path.join(root,'node_modules/playwright'));
const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:fixture,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
(async()=>{
fs.mkdirSync(fixture,{recursive:true});
const archive=execFileSync('/usr/bin/git',['archive','HEAD','apps/landing','design','docs/PLAN.md'],{cwd:root,maxBuffer:1<<27});
execFileSync('tar',['-x','-C',fixture],{input:archive});
fs.symlinkSync(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'dir');
git('init','--initial-branch=main');
git('config','user.name','Review Test');git('config','user.email','review@example.test');git('config','commit.gpgsign','false');git('config','core.hooksPath','/dev/null');
git('add','.');git('commit','-m','Disposable review history');
for(const task of ['00-foundation','01-public-screens','02-frame','02-overview','02-chat','02-agents','02-agent-detail','02-traffic','02-rules','03-super-admin','04-machine-trial','05-proof-of-concept']) git('update-ref',`refs/remotes/origin/${task}`,'HEAD');
git('checkout','-b','06-squadmates');git('commit','--allow-empty','-m','Work in progress');git('update-ref','refs/remotes/origin/06-squadmates','HEAD');git('checkout','main');
const bin=path.join(fixture,'bin');fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin,'gh'), '#!/bin/sh\nexec '+process.execPath+' '+path.join(bin,'gh.cjs')+' "$@"\n',{mode:0o755});
fs.writeFileSync(path.join(bin,'gh.cjs'),`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2); fs.appendFileSync(process.env.CALL_LOG,JSON.stringify(args)+'\\n');
if(JSON.stringify(args.slice(0,3))!==JSON.stringify(['pr','list','-R']) || JSON.stringify(args.slice(4))!==JSON.stringify(['--state','all','--json','state'])) process.exit(2);
if(process.env.MODE==='failure') process.exit(1);
const i=['moeghashim/tensquads-agent-kit','moeghashim/tensquads-market-researcher','moeghashim/tensquads-website-builder'].indexOf(args[3]);
if(i<0) process.exit(2);
console.log(JSON.stringify(process.env.MODE==='merged'?[{state:'MERGED'}]:[[{state:'OPEN'},{state:'MERGED'}],[{state:'OPEN'}],[]][i]));
`,{mode:0o755});
const server=http.createServer((req,res)=>{
let p=path.join(fixture,'apps/landing/public',new URL(req.url,'http://localhost').pathname);
if(!path.extname(p)) p+=fs.existsSync(p)&&fs.statSync(p).isDirectory()?'/index.html':'.html';
if(!fs.existsSync(p)) return res.writeHead(404).end();
res.setHeader('content-type',p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(p));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const observations=[];
try{
for(const mode of ['mixed','failure','merged']){
 const calls=path.join(evidence,mode+'-gh-calls.jsonl');fs.writeFileSync(calls,'');
 const build=spawn(process.execPath,['apps/landing/build-review.mjs','HEAD'],{cwd:fixture,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,MODE:mode,CALL_LOG:calls}});
 let log='';build.stdout.on('data',d=>log+=d);build.stderr.on('data',d=>log+=d);
 const code=await new Promise(r=>build.on('close',r));
 fs.writeFileSync(path.join(evidence,mode+'-build.log'),log);assert.equal(code,0,log);
 assert.equal(fs.readFileSync(calls,'utf8').trim().split('\n').length,3);
 assert.equal((log.match(/Warning: Cannot read/g)||[]).length,mode==='failure'?3:0);
 await page.goto(`http://127.0.0.1:${server.address().port}/review/`,{waitUntil:'networkidle'});
 await page.getByRole('link',{name:/Build plan Decisions/}).click();await page.waitForLoadState('networkidle');
 const phases=page.locator('.ph > .bx');assert.equal(await phases.count(),8);
 const proof=phases.nth(5);
 const expected=mode==='merged'?15:mode==='mixed'?13:12;
 assert.equal(await page.locator('.hero strong').innerText(),`${expected} of 17`);
 assert.equal(await proof.locator('.pill').innerText(),mode==='merged'?'Built':'In progress');
 assert.equal(await proof.locator('.cnt').innerText(),`${mode==='merged'?4:mode==='mixed'?2:1} of 4 tasks merged`);
 assert.equal(await proof.locator('.bar span').evaluate(e=>e.style.width),mode==='merged'?'100%':mode==='mixed'?'50%':'25%');
 assert.equal(await phases.nth(6).locator('.pill').innerText(),'In progress');
 assert.equal(await phases.nth(7).locator('.pill').innerText(),'Planned');
 const hero=await page.locator('.hero').innerText();
 if(mode==='mixed') {assert.match(hero,/05-market-researcher/);assert.match(hero,/05-website-builder/);assert.doesNotMatch(hero,/05-agent-kit/);}
 else {assert.doesNotMatch(hero,/05-agent-kit|05-market-researcher|05-website-builder/);}
 await page.locator('.hero').screenshot({path:path.join(evidence,mode+'-summary.png')});
 await page.locator('.ph').locator('..').screenshot({path:path.join(evidence,mode+'-phases-1440.png')});
 const desktop=await phases.evaluateAll(es=>es.map(e=>({title:e.querySelector('b').innerText,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width})));
 assert.equal(new Set(desktop.map(e=>e.y)).size,2);
 observations.push({mode,url:page.url(),summary:hero,phases:await phases.allInnerTexts(),desktop});
 fs.copyFileSync(path.join(fixture,'apps/landing/public/review/plan.html'),path.join(evidence,mode+'-plan.html'));
 if(mode==='merged'){
 await page.setViewportSize({width:390,height:844});
 await page.locator('.ph').locator('..').screenshot({path:path.join(evidence,'merged-phases-390.png')});
 const mobile=await phases.evaluateAll(es=>es.map(e=>({title:e.querySelector('b').innerText,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,right:e.getBoundingClientRect().right})));
 assert.equal(new Set(mobile.map(e=>e.y)).size,4);assert.ok(mobile.every(e=>e.x>=0&&e.right<=390));
 const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 observations.push({mobile,overflow});assert.equal(overflow.width,overflow.scroll);
 }
 console.log(mode+': '+expected+' of 17; Proof '+await proof.innerText());
}
assert.deepEqual(errors,[]);observations.push({pageErrors:errors});
fs.writeFileSync(path.join(evidence,'live-observations.json'),JSON.stringify(observations,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(fixture,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

import {execFileSync,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const run=promisify(execFile), root=process.cwd(), temp=join(root,'.review-live-test'), repo=join(temp,'repo');
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6NABAJ4BE76T707X6VEWB7S';
mkdirSync(repo,{recursive:true});mkdirSync(evidence,{recursive:true});mkdirSync(join(temp,'gh-config'),{recursive:true});
execFileSync('tar',['-xf','-','-C',repo],{input:execFileSync('git',['archive','2c65dd9752b44b8f67d26878a7fdaf9b76549ad8'],{maxBuffer:1<<28})});
symlinkSync(join(root,'node_modules'),join(repo,'node_modules'),'dir');
const git=(...args)=>execFileSync('git',['-c','user.name=Disposable Test','-c','user.email=test@example.invalid','-c','core.hooksPath=/dev/null',...args],{cwd:repo,encoding:'utf8'}).trim();
git('init','-b','main');git('add','.');git('commit','-m','Disposable baseline','--signoff');
const base=git('rev-parse','HEAD'), tree=git('rev-parse','HEAD^{tree}');
const requests=[];let records={},mode='planned';
const api=createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part;
 const payload=JSON.parse(body);requests.push({mode,path:req.url,...payload});
 writeFileSync(join(evidence,'api-requests.json'),JSON.stringify(requests,null,2));
 const name=payload.variables?.repo;
 const query=payload.query; const selected=records[name];
 res.setHeader('Content-Type','application/json');
 if(!selected){res.statusCode=404;res.end(JSON.stringify({message:'Disposable repository unavailable'}));return;}
 // The API applies the same state filter and page size requested by the real gh client.
 const state=payload.variables?.state ?? payload.variables?.states;
 const mergedOnly=query.includes('MERGED') || JSON.stringify(state).includes('MERGED');
 const nodes=(mergedOnly?selected.filter(p=>p.state==='MERGED'):selected).slice(0,Number(payload.variables?.limit??payload.variables?.first??30));
 res.end(JSON.stringify({data:{repository:{id:name,name,owner:{login:'moeghashim'},pullRequests:{nodes,pageInfo:{hasNextPage:false,endCursor:null},totalCount:nodes.length}}}}));
});
const socket=join(root,'.s');
await new Promise(resolve=>api.listen(socket,resolve));
writeFileSync(join(temp,'gh-config/config.yml'),`http_unix_socket: ${socket}\n`);
const env={...process.env,GH_CONFIG_DIR:join(temp,'gh-config'),GH_HOST:'disposable.invalid',GH_ENTERPRISE_TOKEN:'disposable-test-token',GH_TOKEN:'',GITHUB_TOKEN:'',GITHUB_ENTERPRISE_TOKEN:'',GH_NO_UPDATE_NOTIFIER:'1',GH_PROMPT_DISABLED:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const web=createServer((req,res)=>{
 let p=new URL(req.url,'http://local').pathname;
 if(p==='/review/'||p==='/review')p='/review/index.html';
 if(p==='/review/plan')p+='.html';
 const path=join(repo,'apps/landing/public',p);
 if(!existsSync(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':'image/png');res.end(readFileSync(path));
});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
async function check(name,total,classes,count,warnings){
 mode=name;
 const build=await run('node',['apps/landing/build-review.mjs','main'],{cwd:repo,env,maxBuffer:1<<24,timeout:180000});
 writeFileSync(join(evidence,`${name}-build.log`),build.stdout+build.stderr);
 assert.equal((build.stderr.match(/Warning: Cannot read pull requests/g)||[]).length,warnings);
 const url=`http://127.0.0.1:${web.address().port}/review/`;
 await page.goto(url);await page.getByRole('link',{name:'Build plan',exact:false}).click();
 await page.waitForSelector('.ph .bx');
 assert.equal(await page.locator('.hero .big strong').innerText(),`${total} of 17`);
 const cards=await page.locator('.ph .bx').evaluateAll(nodes=>nodes.map(n=>({title:n.querySelector('b').textContent,state:n.querySelector('.pill').textContent,class:n.className,text:n.innerText})));
 assert.equal(cards.length,8);assert.deepEqual(cards.map(c=>c.class),classes.map(c=>'bx '+c));
 if(count)assert.ok(cards[5].text.includes(count));
 await page.locator('.hero').screenshot({path:join(evidence,`${name}-summary.png`)});
 await page.locator('.ph').scrollIntoViewIfNeeded();
 await page.locator('.ph').screenshot({path:join(evidence,`${name}-phases.png`)});
 writeFileSync(join(evidence,`${name}-plan.html`),await page.content());
 await page.setViewportSize({width:390,height:844});
 await page.locator('.ph').screenshot({path:join(evidence,`${name}-mobile-phases.png`)});
 const overflow=await page.locator('.ph').evaluate(el=>el.scrollWidth>el.clientWidth);
 assert.equal(overflow,false);await page.setViewportSize({width:1440,height:1000});
 results.push({name,total,cards,phaseGridOverflowsAt390:overflow,warningCount:warnings});
 console.log(name,JSON.stringify(results.at(-1)));
}
try{
 await check('planned',0,Array(8).fill('planned'),'0 of 4 tasks merged',3);
 // Use real merge commits and remote-tracking refs in the disposable repository.
 const side=git('commit-tree',tree,'-p',base,'-m','Disposable side');
 let head=base;
 for(const [i,task] of ['02-chat','05-proof-of-concept'].entries())head=git('commit-tree',tree,'-p',head,'-p',side,'-m',`Merge pull request #${i+1} from moeghashim/${task}`);
 git('update-ref','refs/heads/main',head);git('reset','--hard','main');
 git('update-ref','refs/remotes/origin/00-foundation',base);
 git('update-ref','refs/remotes/origin/06-squadmates',git('commit-tree',tree,'-p',head,'-m','Disposable open task'));
 for(const task of ['05-agent-kit','05-market-researcher','05-website-builder'])git('update-ref',`refs/remotes/origin/${task}`,base);
 const olderMerged=[...Array.from({length:50},(_,i)=>({number:100-i,state:'OPEN'})),{number:1,state:'MERGED'}];
 records={'tensquads-agent-kit':olderMerged,'tensquads-market-researcher':[],'tensquads-website-builder':[{number:2,state:'OPEN'}]};
 await check('mixed',4,['built','planned','progress','planned','planned','progress','progress','planned'],'2 of 4 tasks merged',0);
 records=Object.fromEntries(Object.keys(records).map(key=>[key,olderMerged]));
 await check('external-merged',6,['built','planned','progress','planned','planned','built','progress','planned'],'4 of 4 tasks merged',0);
 records={};
 await check('external-unavailable',3,['built','planned','progress','planned','planned','progress','progress','planned'],'1 of 4 tasks merged',3);
 records=Object.fromEntries(['tensquads-agent-kit','tensquads-market-researcher','tensquads-website-builder'].map(key=>[key,olderMerged]));
 for(const task of ['00-foundation','01-public-screens','02-frame','02-overview','02-chat','02-agents','02-agent-detail','02-traffic','02-rules','03-super-admin','04-machine-trial','05-proof-of-concept','06-squadmates','07-home-redesign'])git('update-ref',`refs/remotes/origin/${task}`,head);
 await check('all-built',17,Array(8).fill('built'),'4 of 4 tasks merged',0);
 assert.equal(await page.locator('.hero .now').innerText(),'Nothing in progress.');
 assert.deepEqual(errors,[]);
 for(const scenario of ['planned','mixed','external-merged','external-unavailable','all-built'])assert.equal(requests.filter(r=>r.mode===scenario).length,3);
 writeFileSync(join(evidence,'live-results.json'),JSON.stringify({results,errors,requests},null,2));
}finally{await browser.close();await new Promise(resolve=>web.close(resolve));await new Promise(resolve=>api.close(resolve));}

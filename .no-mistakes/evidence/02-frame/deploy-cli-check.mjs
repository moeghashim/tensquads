import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source = process.cwd();
const sandbox = mkdtempSync(join(source, '.deploy-check-'));
const lines = [];
function log(text) { lines.push(text); console.log(text); }
const blocked = ['CF_API_TOKEN','CLOUDFLARE_API_KEY','CF_API_KEY','CLOUDFLARE_EMAIL','CF_EMAIL','CLOUDFLARE_API_USER_SERVICE_KEY','CLOUDFLARE_ACCOUNT_ID','CF_ACCOUNT_ID','WRANGLER_LOG'];
try {
 for (const dir of ['scripts','apps/web','node_modules/wrangler/bin','node_modules/.bin']) mkdirSync(join(sandbox,dir),{recursive:true});
 for (const file of ['scripts/deploy-cloudflare.mjs','scripts/write-dev-vars.mjs','apps/web/wrangler.jsonc','apps/web/package.json','package.json']) copyFileSync(join(source,file), join(sandbox,file));
 const childRecord = join(sandbox,'child.json');
 // Controlled executable boundary: this records the child, and never runs Wrangler or a deploy.
 writeFileSync(join(sandbox,'node_modules/wrangler/bin/wrangler.js'), `const fs=require('node:fs'); fs.writeFileSync(process.env.RECORD,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env})); process.exit(Number(process.env.CHILD_STATUS||0));`);
 const env = {PATH:process.env.PATH, RECORD:childRecord, CLOUDFLARE_API_TOKEN:'fixture-parent', CLOUDFLARE_WORKERS_API_TOKEN:'fixture-shell-only', CI:'false'};
 for (const key of blocked) env[key]='fixture-conflict';
 function run(args) { return spawnSync(process.execPath,args,{cwd:sandbox,env,encoding:'utf8'}); }
 const cases = [ ['missing file',null], ['missing key','OTHER=1\n'], ['empty','CLOUDFLARE_WORKERS_API_TOKEN=\n'], ['spaces','CLOUDFLARE_WORKERS_API_TOKEN=   \n'], ['double-quoted spaces','CLOUDFLARE_WORKERS_API_TOKEN=" "\n'], ['single-quoted whitespace',"CLOUDFLARE_WORKERS_API_TOKEN=' \t '\n"] ];
 for (const [name,text] of cases) {
  if(text !== null) writeFileSync(join(sandbox,'.env'),text);
  const result=run(['scripts/deploy-cloudflare.mjs']);
  assert.equal(result.status,1); assert.equal(result.stderr.trim(),'CLOUDFLARE_WORKERS_API_TOKEN is absent.'); assert.equal(result.stdout,''); assert.equal(existsSync(childRecord),false);
  log(`CLI ${name}: exit 1; stderr: CLOUDFLARE_WORKERS_API_TOKEN is absent.; no child started despite conflicting shell credentials.`);
 }
 writeFileSync(join(sandbox,'.env'),'CLOUDFLARE_WORKERS_API_TOKEN="fixture-project"\nCLOUDFLARE_API_TOKEN=fixture-ignored\n');
 let result=run(['scripts/deploy-cloudflare.mjs']);
 assert.equal(result.status,0); assert.equal(result.stdout,''); assert.equal(result.stderr,'');
 const child=JSON.parse(readFileSync(childRecord,'utf8'));
 assert.deepEqual(child.args,['deploy']); assert.equal(child.cwd,join(sandbox,'apps/web')); assert.equal(child.env.CLOUDFLARE_API_TOKEN,'fixture-project'); assert.equal(child.env.CI,'true');
 for(const key of blocked) assert.equal(child.env[key],undefined);
 log('Controlled child boundary: node -> wrangler.js deploy; cwd apps/web; project .env token selected; all nine conflicting aliases removed; CI=true; no token printed. This is boundary evidence, not a live Cloudflare deploy.');
 env.CHILD_STATUS='17'; result=run(['scripts/deploy-cloudflare.mjs']); assert.equal(result.status,17); log('Controlled child failure: wrapper preserves child exit status 17.'); delete env.CHILD_STATUS;
 const config=JSON.parse(readFileSync(join(sandbox,'apps/web/wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
 assert.equal(config.account_id,'678c5a795f40f7e9f33b8a71248cc829');
 log(`Normalized Wrangler config: account_id=${config.account_id}; worker=${config.name}.`);
 // Execute npm's actual script chain, substituting only Vite and the publish child.
 writeFileSync(join(sandbox,'node_modules/.bin/vite'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.BUILD_RECORD,process.argv.slice(2).join(" ")); process.exit(Number(process.env.BUILD_STATUS||0));\n',{mode:0o755});
 env.BUILD_RECORD=join(sandbox,'build.txt'); rmSync(childRecord);
 result=spawnSync('npm',['run','deploy:cloudflare'],{cwd:sandbox,env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr); assert.equal(readFileSync(env.BUILD_RECORD,'utf8'),'build'); assert.equal(existsSync(childRecord),true);
 log('Controlled npm entry: deploy:cloudflare -> cf:deploy -> vite build -> deploy wrapper -> child recorder.');
 rmSync(childRecord); env.BUILD_STATUS='23';
 result=spawnSync('npm',['run','deploy:cloudflare'],{cwd:sandbox,env,encoding:'utf8'});
 assert.notEqual(result.status,0); assert.equal(existsSync(childRecord),false);
 log('Controlled npm build failure: nonzero status; deploy child never starts.');
} finally {
 rmSync(sandbox,{recursive:true,force:true});
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6CTK0QB1VAR4YDWFJGW75N3/deploy-cli-transcript.txt',lines.join('\n')+'\n');
}

import assert from 'node:assert/strict';
import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='.test-phase/guard';
mkdirSync(`${root}/scripts/test`,{recursive:true});
mkdirSync(`${root}/packages/adapters/src`,{recursive:true});
mkdirSync(`${root}/node_modules/forbidden-helper`,{recursive:true});
copyFileSync('scripts/test/worker-bundle.test.mjs',`${root}/scripts/test/worker-bundle.test.mjs`);
writeFileSync(`${root}/node_modules/forbidden-helper/package.json`,JSON.stringify({name:'forbidden-helper',type:'module',exports:'./index.js'}));
const attempts=[];
for (const [name,entry,dependency] of [
 ['direct filesystem reintroduction', 'export {readFileSync} from "node:fs";', ''],
 ['transitive filesystem reintroduction', 'export {load} from "forbidden-helper";', 'import {readFileSync} from "node:fs"; export const load=(path)=>readFileSync(path);'],
 ['transitive PGlite reintroduction', 'export {Database} from "forbidden-helper";', 'export {PGlite as Database} from "@electric-sql/pglite";'],
]) {
 writeFileSync(`${root}/packages/adapters/src/index.ts`,entry);
 writeFileSync(`${root}/node_modules/forbidden-helper/index.js`,dependency);
 const run=spawnSync(process.execPath,['--test',`${root}/scripts/test/worker-bundle.test.mjs`],{encoding:'utf8'});
 attempts.push({name,entry,dependency,exit:run.status,stdout:run.stdout,stderr:run.stderr});
}
assert.notEqual(attempts[0].exit,0);
assert.equal(attempts[1].exit,0);
assert.equal(attempts[2].exit,0);
writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6A41GP1MDXJ1Q12SBYVHE25/guard-mutations.json',JSON.stringify(attempts,null,2));
console.log(attempts.map(({name,exit})=>({name,exit})));

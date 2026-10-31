import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6A41GP1MDXJ1Q12SBYVHE25';
const built = await build({entryPoints:['.test-phase/worker.ts'],bundle:true,format:'esm',platform:'neutral',external:['node:*'],conditions:['workerd','worker','browser'],target:'es2024',write:false,metafile:true});
const code = built.outputFiles[0].text;
writeFileSync(`${evidence}/full-worker-bundle.js`, code);
console.log('Banned-token matches in full bundle:', code.split('\n').filter(line => /node:fs|readFileSync|PGlite/.test(line)).join('\n'));
const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:code,compatibilityDate:'2026-10-23',compatibilityFlags:['nodejs_compat']}));
try {
 const response = await mf.dispatchFetch('http://localhost/adapter');
 assert.equal(response.status,200);
 const result = await response.json();
 assert.equal(result.migrationSql,readFileSync('packages/adapters/src/neon/migration.sql','utf8'));
 assert.ok(result.exports.includes('openPostgres'));
 assert.ok(!result.exports.includes('openPglite'));
 assert.equal(result.repositoryAreas.length,6);
 assert.match(result.firstEvent.trace,/^tr_[0-9a-f]{6}$/);
 writeFileSync(`${evidence}/worker-response.json`,JSON.stringify({status:response.status,...result},null,2));
 writeFileSync(`${evidence}/worker-bundle-inputs.json`,JSON.stringify(Object.keys(built.metafile.inputs),null,2));
 console.log(JSON.stringify({status:response.status,exports:result.exports,repositoryAreas:result.repositoryAreas,firstEvent:result.firstEvent,migrationBytes:result.migrationSql.length}));
} finally {await mf.dispose();}

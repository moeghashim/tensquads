import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import net from 'node:net';
import {PGlite} from './tooling/node_modules/@electric-sql/pglite/dist/index.js';
import {createServer} from './tooling/node_modules/pglite-server/dist/index.js';
import {WebSocketServer} from './tooling/node_modules/ws/wrapper.mjs';
const db=new PGlite(); await db.waitReady;
const server=createServer(db);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const pgPort=server.address().port;
const wss=new WebSocketServer({host:'127.0.0.1',port:0});
await new Promise(resolve=>wss.on('listening',resolve));
const wsPort=wss.address().port;
wss.on('connection',ws=>{
 const tcp=net.connect(pgPort,'127.0.0.1');
 tcp.on('data',data=>ws.send(data));
 ws.on('message',data=>tcp.write(data));
 tcp.on('error',()=>ws.close()); tcp.on('close',()=>ws.close()); ws.on('close',()=>tcp.destroy());
});
writeFileSync('.test-phase/neon-local.mjs',`import {neonConfig} from '@neondatabase/serverless';\nimport WebSocket from './tooling/node_modules/ws/wrapper.mjs';\nneonConfig.webSocketConstructor=WebSocket;\nneonConfig.wsProxy=()=> '127.0.0.1:${wsPort}';\nneonConfig.useSecureWebSocket=false;\nneonConfig.pipelineConnect=false;\nneonConfig.pipelineTLS=false;\n`);
const run=()=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--import','./.test-phase/neon-local.mjs','packages/seed/src/cli.ts'],{env:{...process.env,NEON_POSTGRES_CONNECTION_STRING:`postgres://postgres:disposable@127.0.0.1:${pgPort}/postgres?sslmode=disable`},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 const timer=setTimeout(()=>{child.kill();reject(new Error('seed CLI timed out'));},20000);
 child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
});
try {
 const first=await run(); console.log(first); assert.equal(first.code,0);
 const second=await run(); console.log(second); assert.equal(second.code,0); assert.equal(first.stdout,second.stdout);
 const counts=await db.query('SELECT count(*)::int AS accounts FROM accounts');
 assert.equal(counts.rows[0].accounts,9);
 const result={transport:'Real Neon Pool over local WebSocket-to-Postgres bridge, disposable PGlite SQL engine',first,second,counts:counts.rows};
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6A41GP1MDXJ1Q12SBYVHE25/seed-cli.json',JSON.stringify(result,null,2));
} finally {
 for (const client of wss.clients) client.terminate();
 await new Promise(resolve=>wss.close(resolve));
 await new Promise(resolve=>server.close(resolve));
 await db.close();
}

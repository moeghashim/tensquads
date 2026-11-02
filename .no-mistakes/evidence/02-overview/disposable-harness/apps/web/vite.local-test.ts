import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
export default defineConfig({
 resolve: {tsconfigPaths:true},
 plugins:[{
  name:'disposable-test-boundaries',enforce:'pre',
  transform(code,id){
   if(id.endsWith('/src/server/session.ts')) return 'export async function requireClerkUser(){ return "local-test-user"; }';
   if(id.endsWith('/src/server/worker-env.ts')) return 'export async function workerEnv(name){ return name === "TEST_DATABASE_URL" ? "disposable" : ""; }';
   if(id.endsWith('/neon/postgres.ts')) return readFileSync('../../.local-test/database.ts','utf8');
  },
  configureServer(server){server.middlewares.use('/__test',async(req,res)=>{try{const fixture=await server.ssrLoadModule('../../packages/adapters/src/neon/postgres.ts'); if(req.url.startsWith('/no-store')){await fixture.noStore();res.end('updated');}else if(req.url.startsWith('/delay-next')){await fixture.delayNext();res.end('armed');}else if(req.url.startsWith('/reset')){await fixture.reset();res.end('reset');}else if(req.url.startsWith('/empty-mission')){await fixture.emptyMission();res.end('updated');}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await fixture.state()));}}catch(e){res.statusCode=500;res.end(String(e));}});}
 },tanstackStart(),viteReact()],
 server:{port:3000,host:'127.0.0.1'}
});

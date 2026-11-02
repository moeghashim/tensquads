import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const database = resolve('../../.traffic-validation/database.ts');
export default defineConfig({
 resolve: { tsconfigPaths: true },
 ssr: { external: ['cloudflare:workers'] },
 plugins: [{name:'isolated-test-boundaries', enforce:'pre',
 transform(code,id) {
  if(id.endsWith('/server/session.ts')) return `import {ready} from ${JSON.stringify(database)}; export async function requireClerkUser() { await ready; return 'validation-user'; }`;
  if(id.endsWith('/neon/postgres.ts')) return `import {db,ready} from ${JSON.stringify(database)}; export function openPostgres() { return {db, migrate:()=>ready, close:async()=>{}}; }`;
 },
 configureServer(server) {
  server.middlewares.use('/__test',async(req,res,next)=> {
   try {
    const mod = await server.environments.ssr.runner.import(database);
    if(req.url?.startsWith('/reset')) {await mod.reset(new URL(req.url,'http://localhost').searchParams.get('mode') ?? 'seed'); res.end('reset');}
    else if(req.url?.startsWith('/stock')) {await mod.client.exec(`update state_entries set value='\"before-write\"' where account_id='traffic-validation' and key='inventory.low_stock'`);res.end('stock');}
    else if(req.url?.startsWith('/empty')) {await mod.client.exec("delete from bus_events where account_id='traffic-validation'");res.end('empty');}
    else if(req.url?.startsWith('/duplicate')) {await mod.client.exec("insert into bus_events (account_id,id,time_text,from_agent,to_agent,kind,skill,body,payload,writes,trace,seq) values ('traffic-validation','e100','11:03','master','inventory','Task','shopify.stock_levels','already seen','{}','[]','tr_repeat',99)");res.end('duplicate');}
    else if(req.url?.startsWith('/snapshot')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({events:await mod.events(),cursor:(await mod.client.query("select * from bus_cursors")).rows,store:(await mod.client.query("select * from state_entries order by key")).rows}));}
    else if(req.url?.startsWith('/events')) {res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(await mod.events()));}
    else next();
   } catch(e){res.statusCode=500;res.end(String(e));}
  });
 }
 },tanstackStart(),viteReact()]
});

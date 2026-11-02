import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const root=process.cwd();
const session=resolve(root,'.test-overview-local/session.ts');
export default defineConfig({
 root:resolve(root,'apps/web'),
 resolve:{tsconfigPaths:true},
 plugins:[{name:'isolated-test-account',enforce:'pre',resolveId(id,importer){ if(id==='./workspace-session.ts' && importer?.includes('/src/server/')) return session; },configureServer(server){server.middlewares.use('/__test',async(req,res)=>{try{ const mod=await server.environments.ssr.runner.import(session); const action=new URL(req.url??'','http://localhost').searchParams.get('action')??'state';res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await mod.control(action)));}catch(e){res.statusCode=500;res.end(String(e));}});}},tanstackStart(),viteReact()],
 server:{host:'127.0.0.1',port:3107,strictPort:true},
});

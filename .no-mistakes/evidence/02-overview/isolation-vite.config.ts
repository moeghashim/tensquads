import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const root = process.cwd();
export default defineConfig({
 root: resolve(root,'apps/web'),
 resolve: {tsconfigPaths:true},
 plugins:[{name:'isolated-test-environment',enforce:'pre',configureServer(server){server.middlewares.use('/__local_reset',async(_req,res)=>{try{const mod=await server.environments.ssr.runner.import(root+'/.local-test/database.ts');await mod.resetLocalDatabase();res.end('reset');}catch(e){res.statusCode=500;res.end(String(e));}})},transform(code,id){
 if(id.endsWith('/server/workspace-session.ts')) return code.replace('await requireClerkUser()', '"local-validation-user"').replace('await databaseUrl()', '"isolated-local"').replace('const { openPostgres, accountForClerkUser } = await import("@tensquads/adapters");', `const { accountForClerkUser } = await import("@tensquads/adapters"); const { openLocalDatabase: openPostgres } = await import("${root}/.local-test/database.ts");`).replace('const database = openPostgres(connection);','const database = await openPostgres(connection);');
 }},tanstackStart(),react()],
 server:{port:3000,host:'127.0.0.1'},
});

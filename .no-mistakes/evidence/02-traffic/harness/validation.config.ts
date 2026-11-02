import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const db = fileURLToPath(new URL('../../.validation-traffic/db.ts',import.meta.url));
export default defineConfig({resolve:{tsconfigPaths:true},plugins:[{
 name:'disposable-local-database',enforce:'pre',
 transform(code,id){if(id.endsWith('/server/workspace-session.ts'))return code.replace('const userId = await requireClerkUser();','const userId = "validation-user";').replace('const database = openPostgres(connection);',`const database = await (await import(${JSON.stringify(db)})).database();`);},
 configureServer(server){server.middlewares.use('/__validation',async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const {action,value}=JSON.parse(body||'{}'); const module=await server.environments.ssr.runner.import(db);res.setHeader('content-type','application/json');res.end(JSON.stringify(await module.admin(action,value)));}catch(error){res.statusCode=500;res.end(String(error.stack));}});}
},tanstackStart(),react()],server:{host:'127.0.0.1',port:3000,strictPort:true}});

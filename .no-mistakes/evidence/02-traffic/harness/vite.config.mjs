import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const session=fileURLToPath(new URL('./session.ts',import.meta.url));
export default defineConfig({
 resolve:{tsconfigPaths:true},
 plugins:[{name:'validation-controls',configureServer(server){server.middlewares.use('/__validation',async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const data=JSON.parse(Buffer.concat(chunks).toString()||'{}');const control=globalThis.__trafficValidation;if(!control)throw new Error('Session not loaded');res.setHeader('content-type','application/json');res.end(JSON.stringify(await control.admin(data)));}catch(e){res.statusCode=500;res.end(String(e));}});}}, {name:'disposable-workspace',enforce:'pre',resolveId(source){if(source.endsWith('/worker-env.ts')||source==='./worker-env.ts') return fileURLToPath(new URL('./worker-env.ts',import.meta.url)); if(source.endsWith('/workspace-session.ts')||source==='./workspace-session.ts')return session;}},tanstackStart(),react()],
 server:{host:'127.0.0.1',port:3107},
});

import './neon.mjs';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {openPostgres,createRepositories,readWorkspaceFrame,schema} from '@tensquads/adapters';
import {Kernel} from '@tensquads/kernel';
import {replaceDemoAccount} from '../packages/seed/src/demo-account.ts';
import {eq,and} from 'drizzle-orm';
import * as esbuild from 'esbuild';
const opened=openPostgres('postgres://phase_user:phase_password@127.0.0.1:55439/phase_test');
await opened.migrate();
const db=opened.db,scope={accountId:'live-phase',mode:'account'};
await replaceDemoAccount(db,scope.accountId,'local-owner');
let remaining=0,afterQuery=null,ready=true;
const transaction=db.transaction.bind(db);
db.transaction=(callback,...options)=>transaction(async tx=>{
 const client=tx.session.client,query=client.query;
 client.query=async function(...args){if(ready&&remaining>0){remaining--;await new Promise(r=>setTimeout(r,8000));}const result=await query.apply(this,args);const text=typeof args[0]==='string'?args[0]:args[0]?.text??'';if(afterQuery&&text.includes(afterQuery))ready=true;return result;};
 try{return await callback(tx);}finally{client.query=query;}
},...options);
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,Outlet,RouterProvider} from '@tanstack/react-router';
import {WorkspaceProvider} from './apps/web/src/workspace/provider.tsx';
import {WorkspaceShell} from './apps/web/src/workspace/shell.tsx';
const root=createRootRoute({component:Outlet});
const workspace=createRoute({getParentRoute:()=>root,id:'_workspace',loader:()=>fetch('/api/frame').then(r=>r.json()),component:()=> <WorkspaceProvider frame={workspace.useLoaderData()}><WorkspaceShell><Outlet/></WorkspaceShell></WorkspaceProvider>});
const routes=['/overview','/chat','/agents','/agents/$id','/traffic','/rules'].map(path=>createRoute({getParentRoute:()=>workspace,path,component:()=>null}));
const router=createRouter({routeTree:root.addChildren([workspace.addChildren(routes)])});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);`;
const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'.phase-test/out',format:'iife',jsx:'automatic',plugins:[{name:'local-http-transport',setup(build){build.onResolve({filter:/^#\/server\/workspace.ts$/},()=>({path:'transport',namespace:'local'}));build.onLoad({filter:/.*/,namespace:'local'},()=>({contents:`async function call(method,data,signal){const r=await fetch('/api/'+method,{method:'POST',body:JSON.stringify(data),signal});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}export const beginWorkspaceSend=({data,signal})=>call('begin',data,signal);export const finishWorkspaceSend=({data,signal})=>call('finish',data,signal);`}));}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
const kernel=new Kernel(createRepositories(db));
async function state(){return {frame:await readWorkspaceFrame(db,scope),events:await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId,scope.accountId)),agents:await db.select().from(schema.agents).where(eq(schema.agents.accountId,scope.accountId)),mandates:await db.select().from(schema.mandates).where(eq(schema.mandates.accountId,scope.accountId))};}
const server=http.createServer(async(req,res)=>{try{
 const path=req.url;let data; if(req.method==='POST'){let body='';for await(const b of req)body+=b;data=JSON.parse(body||'null');}
 let value;
 if(path==='/api/frame')value=await readWorkspaceFrame(db,scope);
 else if(path==='/api/state')value=await state();
 else if(path==='/api/begin')value=await kernel.beginSend(scope,data);
 else if(path==='/api/finish')value=await kernel.finishSend(scope,data);
 else if(path==='/api/control'){remaining=0;if(data.reset)await replaceDemoAccount(db,scope.accountId,'local-owner');remaining=data.delays??0;afterQuery=data.afterQuery??null;ready=!afterQuery;value={ready:true};}
 else if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 else if(path==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>tensquads workspace</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>'+readFileSync('apps/web/src/design/public.css','utf8')+'</style><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 }catch(e){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}});
server.listen(55441,'127.0.0.1',()=>console.log('Real workspace components and kernel at http://127.0.0.1:55441/overview'));
process.on('SIGINT',async()=>{server.close();await opened.close();process.exit();});

import { pickWorkerAdapters } from '../packages/adapters/src/adapters-flag.ts';
import worker from '../packages/adapters/test/bus-worker.ts';
import { createCloudflareBus } from '../packages/adapters/src/cloudflare-bus/http.ts';
import { AccountBus } from '../packages/adapters/src/cloudflare-bus/account-bus.ts';
export { AccountBus };
export class DelayedAccountBus extends AccountBus {
 constructor(ctx, env) {
  const storage = new Proxy(ctx.storage, {get(target, key) {
   if (key === 'get') return async (name) => {
    if (name === 'seq') await new Promise(resolve => setTimeout(resolve, 400));
    return target.get(name);
   };
   const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }});
  super({storage,acceptWebSocket:ctx.acceptWebSocket.bind(ctx),getWebSockets:ctx.getWebSockets.bind(ctx)},env);
 }
}
export default {
 async fetch(request, env) {
  if (new URL(request.url).pathname === '/selected-next') {
   const {bus} = pickWorkerAdapters({...env,BOAT_TOKEN:'disposable',BOAT_PROFILE:'tensquads-agents',DATABASE_URL:'postgres://unused/local'});
   return Response.json(await bus.nextEvent({accountId:'selected',mode:'account'}));
  }
  if (new URL(request.url).pathname === '/defaults') {
   const {machine,bus} = pickWorkerAdapters({});
   const scope={accountId:'default',mode:'account'};
   await machine.start(scope,'local-agent','image:1');
   await machine.stop(scope,'local-agent');
   const paused={cpu:await machine.cpu(scope,'local-agent'),uptime:await machine.uptime(scope,'local-agent')};
   await machine.resume(scope,'local-agent');
   const resumed={host:await machine.host(scope,'local-agent'),uptime:await machine.uptime(scope,'local-agent')};
   await machine.remove(scope,'local-agent');
   await bus.publish(scope,{id:'default-event',from:'master',to:'orders',kind:'Task',skill:'local',text:'default mode',payload:{},writes:[]});
   return Response.json({paused,resumed,events:await bus.events(scope)});
  }
  if (new URL(request.url).pathname === '/slow-advance') {
   const body = await request.json();
   return env.SLOW_BUS.get(env.SLOW_BUS.idFromName(body.accountId)).fetch('https://bus/advance', {method:'POST', body:JSON.stringify(body)});
  }
  if (new URL(request.url).pathname === '/slow-read') {
   return env.SLOW_BUS.get(env.SLOW_BUS.idFromName('slow')).fetch('https://bus/local-events');
  }
  if (new URL(request.url).pathname === '/advance') {
   const body = await request.json();
   return env.ACCOUNT_BUS.get(env.ACCOUNT_BUS.idFromName(body.accountId)).fetch('https://bus/advance', {method:'POST', body:JSON.stringify(body)});
  }
  if (new URL(request.url).pathname === '/adapter-advance') {
   const body = await request.json();
   try { return Response.json(await createCloudflareBus(env.ACCOUNT_BUS, body.script).nextEvent({accountId:body.accountId,mode:'account'},body.deadlineAt) ?? null); }
   catch(error) {return new Response(error.message, {status:409});}
  }
  return worker.fetch(request,env);
 },
 queue: worker.queue,
};

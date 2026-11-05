import './neon-config.mjs';
import entry from '../packages/adapters/test/bus-worker.ts';
import { createCloudflareBus } from '../packages/adapters/src/cloudflare-bus/http.ts';
export { AccountBus } from '../packages/adapters/test/bus-worker.ts';
export default {
 ...entry,
 async fetch(request, env) {
  const url = new URL(request.url);
  if(url.pathname === '/scoped-store') return Response.json(await createCloudflareBus(env.ACCOUNT_BUS).store({accountId:url.searchParams.get('account'),mode:'account'}));
  return entry.fetch(request, env);
 }
};

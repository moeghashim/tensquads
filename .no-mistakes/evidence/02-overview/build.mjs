import {build} from 'esbuild';
import {resolve} from 'node:path';
await build({entryPoints:['.phase-test/render.tsx'],outdir:'.phase-test/out',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',external:['cloudflare:*'],loader:{'.css':'empty'},plugins:[{name:'web-alias',setup(b){b.onResolve({filter:/^#\//},args=>({path:resolve('apps/web/src',args.path.slice(2))}));}}]});

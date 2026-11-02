import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const session = fileURLToPath(new URL('../../.local-overview-test/session.ts', import.meta.url));
export default defineConfig({
 resolve: { tsconfigPaths: true, alias: [{find: /^\.\/workspace-session\.ts$/, replacement: session}] },
 plugins: [tanstackStart(), viteReact(), { name: 'local-controls', configureServer(server) { server.middlewares.use('/__test', async (req,res) => { try { const mod = await server.environments.ssr.runner.import(session); res.setHeader('content-type','application/json'); res.end(JSON.stringify(await mod.control(new URL(req.url,'http://local').searchParams.get('action'), new URL(req.url,'http://local').searchParams.get('id')))); } catch(e) { res.statusCode=500; res.end(String(e)); } }); } }],
});

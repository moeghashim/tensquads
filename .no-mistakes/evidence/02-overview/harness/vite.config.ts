import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const root = resolve('../..');
export default defineConfig({
 resolve: { tsconfigPaths: true },
 plugins: [
  { name: 'disposable-boundaries', enforce: 'pre', async resolveId(source, importer) {
    if (source.endsWith('/session.ts') && importer?.includes('/src/server/')) return resolve(root, '.local-test/session.ts');
    if ((source.endsWith('/postgres.ts') || source === './neon/postgres.ts') && importer?.includes('/packages/adapters/src/')) return resolve(root, '.local-test/postgres.ts');
  }, configureServer(server) {
    server.middlewares.use('/__local/reset', async (_req, res) => {
      try { const module = await server.ssrLoadModule(resolve(root, '.local-test/postgres.ts')); await module.reset(); res.end('reset'); }
      catch (error) { console.error(error); res.statusCode = 500; res.end(String(error)); }
    });
  } },
  tanstackStart(), viteReact(),
 ],
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { adaptersMode, masterStubId } from "./adapters-mode.ts";

function masterStubPlugin(): Plugin {
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	const source = readFileSync(fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)), "utf8");
	return {
		name: "master-stub",
		enforce: "pre",
		resolveId(imported) {
			return masterStubId(adaptersMode(source, process.env.CLOUDFLARE_ENV), imported, stub);
		},
	};
}

const realMaster = fileURLToPath(new URL("../../packages/domain/src/master/index.ts", import.meta.url));

const config = defineConfig({
	// No tsconfigPaths here. The adapters tsconfig maps the master to a typecheck
	// stub for tsc only. That map must not reach the bundle.
	resolve: { alias: [{ find: "@tensquads/domain/master", replacement: realMaster }] },
	plugins: [masterStubPlugin(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
});

export default config;

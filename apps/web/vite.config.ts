import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import publishStubFn from "../../packages/adapters/src/cloudflare-bus/publish-stub.ts";
import { adaptersMode, masterStubId, publishStubId } from "./adapters-mode.ts";

function masterStubPlugin(): Plugin {
	if (typeof publishStubFn !== "function") throw new Error("The publish stub is missing.");
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	const publishStub = fileURLToPath(
		new URL("../../packages/adapters/src/cloudflare-bus/publish-stub.ts", import.meta.url),
	);
	const source = readFileSync(fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)), "utf8");
	return {
		name: "master-stub",
		enforce: "pre",
		resolveId(imported) {
			const mode = adaptersMode(source, process.env.CLOUDFLARE_ENV);
			return masterStubId(mode, imported, stub) ?? publishStubId(mode, imported, publishStub);
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

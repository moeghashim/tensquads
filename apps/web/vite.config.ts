import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import publishStubFn from "../../packages/adapters/src/cloudflare-bus/publish-stub.ts";
import { adaptersMode, masterStubId, publishStubId } from "./adapters-mode.ts";
import { authorizedOrigin } from "./authorized-origin.ts";
import { HOME_V2_HOST } from "./src/server/home-v2-host.ts";

const wranglerSource = readFileSync(fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)), "utf8");
const deployedOrigin = authorizedOrigin(adaptersMode(wranglerSource, process.env.CLOUDFLARE_ENV));

function masterStubPlugin(): Plugin {
	if (typeof publishStubFn !== "function") throw new Error("The publish stub is missing.");
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	const publishStub = fileURLToPath(
		new URL("../../packages/adapters/src/cloudflare-bus/publish-stub.ts", import.meta.url),
	);
	return {
		name: "master-stub",
		enforce: "pre",
		resolveId(imported) {
			const mode = adaptersMode(wranglerSource, process.env.CLOUDFLARE_ENV);
			return masterStubId(mode, imported, stub) ?? publishStubId(mode, imported, publishStub);
		},
	};
}

const realMaster = fileURLToPath(new URL("../../packages/domain/src/master/index.ts", import.meta.url));

// A real build keeps the createMaster name so the bundle check can see it.
// Production does not set CLOUDFLARE_ENV, so its build options stay as they are.
const realNames = process.env.CLOUDFLARE_ENV === "real" ? { esbuild: { keepNames: true } } : {};

const config = defineConfig({
	define: {
		__TENSQUADS_AUTHORIZED_ORIGIN__: JSON.stringify(deployedOrigin),
	},
	server: {
		allowedHosts: [HOME_V2_HOST, "10squads.com", "www.10squads.com"],
	},
	// No tsconfigPaths here. The adapters tsconfig maps the master to a typecheck
	// stub for tsc only. That map must not reach the bundle.
	resolve: { alias: [{ find: "@tensquads/domain/master", replacement: realMaster }] },
	plugins: [masterStubPlugin(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
	...realNames,
});

export default config;

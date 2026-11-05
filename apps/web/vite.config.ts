import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function adaptersMode(): string {
	const source = readFileSync(fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)), "utf8");
	return /"ADAPTERS"\s*:\s*"([^"]*)"/.exec(source)?.[1] ?? "test";
}

function masterStubPlugin(): Plugin {
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	return {
		name: "master-stub",
		enforce: "pre",
		resolveId(source) {
			if (adaptersMode() === "real" || !source.endsWith("master-live.ts")) return null;
			return stub;
		},
	};
}

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [masterStubPlugin(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), viteReact()],
});

export default config;

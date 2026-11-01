import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const entry = fileURLToPath(new URL("../../packages/adapters/src/index.ts", import.meta.url));

// Worker target: one ESM bundle, workerd conditions, node built-ins left as imports
// so a filesystem import stays visible instead of being polyfilled away.
test("the worker bundle has no filesystem read and no PGlite", async () => {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-adapter-"));
	const outfile = join(directory, "adapter.js");
	try {
		await esbuild.build({
			entryPoints: [entry],
			bundle: true,
			format: "esm",
			platform: "neutral",
			target: "es2024",
			conditions: ["workerd", "worker", "browser"],
			outfile,
			legalComments: "none",
			logLevel: "silent",
			plugins: [
				{
					name: "external-deps-keep-pglite",
					setup(build) {
						build.onResolve({ filter: /^[^./]/ }, (args) => {
							if (args.path === "@electric-sql/pglite" || args.path.startsWith("@electric-sql/pglite/")) {
								return null;
							}
							return { path: args.path, external: true };
						});
					},
				},
			],
		});
		const output = readFileSync(outfile, "utf8");
		assert.equal(output.includes("readFileSync"), false);
		assert.equal(output.includes("node:fs"), false);
		assert.equal(output.includes("PGlite"), false);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

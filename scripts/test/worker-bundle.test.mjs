import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const entry = fileURLToPath(new URL("../../packages/adapters/src/index.ts", import.meta.url));
const readNames = new Set(["readFileSync", "readFile", "existsSync", "createReadStream"]);

function isIdentStart(char) {
	return /[A-Za-z_$]/.test(char);
}

function isIdent(char) {
	return /[A-Za-z0-9_$]/.test(char);
}

// A call at brace depth 0 runs when the module is imported.
// A call inside a function body does not. Comments and strings do not count.
export function importTimeFileReads(source) {
	const hits = [];
	let index = 0;
	let depth = 0;
	const length = source.length;

	while (index < length) {
		const char = source[index];
		const next = source[index + 1];
		if (char === "/" && next === "/") {
			index += 2;
			while (index < length && source[index] !== "\n") {
				index += 1;
			}
			continue;
		}
		if (char === "/" && next === "*") {
			index += 2;
			while (index < length && !(source[index] === "*" && source[index + 1] === "/")) {
				index += 1;
			}
			index = Math.min(length, index + 2);
			continue;
		}
		if (char === "'" || char === '"') {
			const quote = char;
			index += 1;
			while (index < length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === quote) {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}
		if (char === "`") {
			index += 1;
			while (index < length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === "`") {
					index += 1;
					break;
				}
				if (source[index] === "$" && source[index + 1] === "{") {
					index += 2;
					depth += 1;
					break;
				}
				index += 1;
			}
			continue;
		}
		if (char === "{") {
			depth += 1;
			index += 1;
			continue;
		}
		if (char === "}") {
			depth = Math.max(0, depth - 1);
			index += 1;
			continue;
		}
		if (depth === 0 && isIdentStart(char)) {
			const start = index;
			index += 1;
			while (index < length && isIdent(source[index])) {
				index += 1;
			}
			const name = source.slice(start, index);
			if (readNames.has(name)) {
				let cursor = index;
				while (cursor < length && /\s/.test(source[cursor])) {
					cursor += 1;
				}
				if (source[cursor] === "(") {
					hits.push(name);
				}
			}
			continue;
		}
		index += 1;
	}

	return hits;
}

function externalNodePlugin() {
	return {
		name: "external-node",
		setup(build) {
			build.onResolve(
				{
					filter:
						/^(node:|cloudflare:|fs$|path$|os$|crypto$|stream$|util$|buffer$|events$|net$|tls$|http$|https$|zlib$|child_process$|url$|assert$)/,
				},
				(args) => ({
					path: args.path,
					external: true,
				}),
			);
		},
	};
}

async function bundleWithMeta(entryPoints) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-adapter-"));
	const outfile = join(directory, "adapter.js");
	const result = await esbuild.build({
		entryPoints,
		bundle: true,
		format: "esm",
		platform: "neutral",
		target: "es2024",
		conditions: ["workerd", "worker", "browser"],
		outfile,
		metafile: true,
		legalComments: "none",
		logLevel: "silent",
		plugins: [externalNodePlugin()],
	});
	return { directory, outfile, metafile: result.metafile };
}

function thirdPartyImportReads(metafile) {
	const hits = [];
	for (const file of Object.keys(metafile.inputs)) {
		if (!file.includes("node_modules")) {
			continue;
		}
		const found = importTimeFileReads(readFileSync(file, "utf8"));
		if (found.length > 0) {
			hits.push({ file, found });
		}
	}
	return hits;
}

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

test("a third-party import-time file read fails the worker guard", async () => {
	assert.deepEqual(importTimeFileReads('readFileSync("secret.txt")\n'), ["readFileSync"]);
	assert.deepEqual(importTimeFileReads("export function load(path) { return readFileSync(path) }\n"), []);
	assert.deepEqual(importTimeFileReads('const note = "readFileSync(secret.txt)";\n'), []);

	const real = await bundleWithMeta([entry]);
	try {
		assert.deepEqual(thirdPartyImportReads(real.metafile), []);
	} finally {
		rmSync(real.directory, { recursive: true, force: true });
	}

	const directory = mkdtempSync(join(tmpdir(), "tensquads-import-read-"));
	const packageDir = join(directory, "node_modules", "reads-at-import");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "package.json"),
		JSON.stringify({ name: "reads-at-import", type: "module", main: "index.js" }),
	);
	writeFileSync(
		join(packageDir, "index.js"),
		'import { readFileSync } from "node:fs";\nreadFileSync("secret.txt");\nexport const value = 1;\n',
	);
	const fixture = join(directory, "entry.js");
	writeFileSync(fixture, 'import "reads-at-import";\nexport const ok = 1;\n');
	const bundled = await bundleWithMeta([fixture]);
	try {
		const hits = thirdPartyImportReads(bundled.metafile);
		assert.equal(hits.length > 0, true);
		assert.equal(
			hits.some((hit) => hit.found.includes("readFileSync")),
			true,
		);
	} finally {
		rmSync(bundled.directory, { recursive: true, force: true });
		rmSync(directory, { recursive: true, force: true });
	}
});

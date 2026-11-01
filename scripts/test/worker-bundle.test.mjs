import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function skipLineComment(source, index) {
	index += 2;
	while (index < source.length && source[index] !== "\n") index += 1;
	return index;
}

function blockCommentEnd(source, index) {
	return source[index] === "*" && source[index + 1] === "/";
}

function skipBlockComment(source, index) {
	index += 2;
	while (index < source.length && !blockCommentEnd(source, index)) index += 1;
	return Math.min(source.length, index + 2);
}

function skipQuoted(source, index) {
	const quote = source[index];
	index += 1;
	while (index < source.length) {
		if (source[index] === "\\") {
			index += 2;
			continue;
		}
		if (source[index] === quote) return index + 1;
		index += 1;
	}
	return index;
}

function templateExpression(source, index) {
	return source[index] === "$" && source[index + 1] === "{";
}

function skipTemplate(source, index, depth) {
	index += 1;
	while (index < source.length) {
		if (source[index] === "\\") {
			index += 2;
			continue;
		}
		const end = templateBoundary(source, index, depth);
		if (end) return end;
		index += 1;
	}
	return { index, depth };
}

function readCall(source, index, hits) {
	const start = index;
	index += 1;
	while (index < source.length && isIdent(source[index])) index += 1;
	const name = source.slice(start, index);
	if (readNames.has(name)) recordReadCall(source, index, name, hits);
	return index;
}

function recordReadCall(source, index, name, hits) {
	let cursor = index;
	while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
	if (source[cursor] === "(") hits.push(name);
}

function scanCode(source, index, depth, hits) {
	const char = source[index];
	if (char === "{") return { index: index + 1, depth: depth + 1 };
	if (char === "}") return { index: index + 1, depth: Math.max(0, depth - 1) };
	if (topLevelIdentifier(char, depth)) return { index: readCall(source, index, hits), depth };
	return { index: index + 1, depth };
}

function skipComment(source, index) {
	if (source[index] !== "/") return index;
	if (source[index + 1] === "/") return skipLineComment(source, index);
	if (source[index + 1] === "*") return skipBlockComment(source, index);
	return index;
}

// A call at brace depth 0 runs when the module is imported.
// A call inside a function body does not. Comments and strings do not count.
export function importTimeFileReads(source) {
	const hits = [];
	let index = 0;
	let depth = 0;
	while (index < source.length) {
		const afterComment = skipComment(source, index);
		if (afterComment !== index) {
			index = afterComment;
			continue;
		}
		if (["'", '"'].includes(source[index])) {
			index = skipQuoted(source, index);
			continue;
		}
		const scanned = scanToken(source, index, depth, hits);
		({ index, depth } = scanned);
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
						/^(node:|cloudflare:|fs$|fs\/promises$|path$|os$|crypto$|stream$|util$|buffer$|events$|net$|tls$|http$|https$|zlib$|child_process$|url$|assert$)/,
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
		banner: {
			js: 'import { createRequire as __workerGuardRequire } from "node:module"; const require = __workerGuardRequire(import.meta.url.startsWith("data:") ? process.cwd() + "/worker-guard.mjs" : import.meta.url);',
		},
		legalComments: "none",
		logLevel: "silent",
		plugins: [externalNodePlugin()],
	});
	return { directory, outfile, metafile: result.metafile };
}

function executeBundle(outfile) {
	const source = readFileSync(outfile, "utf8");
	const script = `
		import { createRequire, syncBuiltinESMExports } from "node:module";
		const require = createRequire(process.cwd() + "/worker-guard.mjs");
		const reads = [];
		const seen = new WeakSet();
		function wrapObject(target) {
			if (target === null || (typeof target !== "object" && typeof target !== "function") || seen.has(target)) return;
			seen.add(target);
			for (const name of Object.getOwnPropertyNames(target)) {
				const descriptor = Object.getOwnPropertyDescriptor(target, name);
				if (!descriptor) continue;
				if (name === "promises") {
					try { wrapObject(target.promises); } catch {}
					continue;
				}
				if (typeof Reflect.get(target, name) !== "function") continue;
				const wrapped = function (...args) {
					reads.push({ name, path: args.length === 0 ? "" : String(args[0]) });
					throw new Error("Import-time filesystem read");
				};
				try {
					Object.defineProperty(target, name, {
						value: wrapped,
						writable: true,
						enumerable: descriptor.enumerable,
						configurable: descriptor.configurable,
					});
				} catch {}
			}
		}
		for (const specifier of ["fs", "node:fs", "fs/promises", "node:fs/promises"]) wrapObject(require(specifier));
		syncBuiltinESMExports();
		globalThis.fetch = () => { throw new Error("Network is disabled"); };
		let error = null;
		try { await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)}); }
		catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
		process.stdout.write(JSON.stringify({ reads, error }));
	`;
	return JSON.parse(execFileSync(process.execPath, ["--input-type=module"], { input: script, encoding: "utf8" }));
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
		assert.deepEqual(executeBundle(real.outfile), { reads: [], error: null });
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
		const execution = executeBundle(bundled.outfile);
		assert.deepEqual(execution.reads, [{ name: "readFileSync", path: "secret.txt" }]);
		assert.equal(execution.error, "Import-time filesystem read");
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

test("bundle execution catches reads inside invoked functions and CommonJS wrappers", async () => {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-wrapped-read-"));
	try {
		for (const [extension, source] of [
			["mjs", 'import { readFileSync } from "node:fs"; function load() { readFileSync("secret.txt"); } load();'],
			["cjs", 'const fs = require("node:fs"); fs.readFileSync("secret.txt");'],
		]) {
			const fixture = join(directory, `entry.${extension}`);
			writeFileSync(fixture, source);
			const bundle = await bundleWithMeta([fixture]);
			try {
				const execution = executeBundle(bundle.outfile);
				assert.deepEqual(execution.reads, [{ name: "readFileSync", path: "secret.txt" }]);
				assert.equal(execution.error, "Import-time filesystem read");
			} finally {
				rmSync(bundle.directory, { recursive: true, force: true });
			}
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("every filesystem function records an import-time call", async () => {
	const calls = [
		['import { openSync } from "node:fs";\nopenSync("secret.txt", "r");\n', "openSync", "secret.txt"],
		['import { readSync } from "node:fs";\nreadSync(3, Buffer.alloc(0));\n', "readSync", "3"],
		['import { fdatasyncSync } from "node:fs";\nfdatasyncSync(3);\n', "fdatasyncSync", "3"],
		['import { chmod } from "node:fs/promises";\nchmod("secret.txt", 0o600);\n', "chmod", "secret.txt"],
	];
	for (const specifier of ["fs", "node:fs"]) {
		for (const name of ["ReadStream", "FileReadStream", "WriteStream", "FileWriteStream"]) {
			for (const source of [
				`import { ${name} } from "${specifier}"; new ${name}(null, { fd: 0, autoClose: false });`,
				`import fs from "${specifier}"; new fs.${name}(null, { fd: 0, autoClose: false });`,
				`const fs = require("${specifier}"); new fs.${name}(null, { fd: 0, autoClose: false });`,
			]) {
				calls.push([source, name, "null"]);
			}
		}
	}
	calls.push(['import { chmod } from "fs/promises"; chmod("secret.txt", 0o600);', "chmod", "secret.txt"]);
	for (const [source, name, path] of calls) {
		const directory = mkdtempSync(join(tmpdir(), "tensquads-any-fs-"));
		const packageDir = join(directory, "node_modules", "reads-at-import");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({ name: "reads-at-import", type: "module", main: "index.js" }),
		);
		writeFileSync(join(packageDir, "index.js"), `${source}export const value = 1;\n`);
		const fixture = join(directory, "entry.js");
		writeFileSync(fixture, 'import "reads-at-import";\nexport const ok = 1;\n');
		const bundled = await bundleWithMeta([fixture]);
		try {
			assert.deepEqual(thirdPartyImportReads(bundled.metafile), []);
			const execution = executeBundle(bundled.outfile);
			assert.deepEqual(execution.reads, [{ name, path }]);
			assert.equal(execution.error, "Import-time filesystem read");
		} finally {
			rmSync(bundled.directory, { recursive: true, force: true });
			rmSync(directory, { recursive: true, force: true });
		}
	}
});

function templateBoundary(source, index, depth) {
	if (source[index] === "`") return { index: index + 1, depth };
	if (templateExpression(source, index)) return { index: index + 2, depth: depth + 1 };
	return null;
}
function topLevelIdentifier(char, depth) {
	return depth === 0 && isIdentStart(char);
}

function scanToken(source, index, depth, hits) {
	return source[index] === "`" ? skipTemplate(source, index, depth) : scanCode(source, index, depth, hits);
}

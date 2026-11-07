import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function masterStubPlugin() {
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	const wrangler = readFileSync(new URL("../../apps/web/wrangler.jsonc", import.meta.url), "utf8");
	const mode = /"ADAPTERS"\s*:\s*"([^"]*)"/.exec(wrangler)?.[1] ?? "test";
	return {
		name: "master-stub",
		setup(build) {
			build.onResolve({ filter: /master-live\.ts$/ }, () => {
				if (mode === "real") return null;
				return { path: stub };
			});
		},
	};
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
		// A package with module and main, and no exports map, still has to be scanned.
		mainFields: ["module", "main"],
		target: "es2024",
		conditions: ["workerd", "worker", "browser"],
		outfile,
		metafile: true,
		banner: {
			js: "const require = globalThis.__workerGuardRequire;",
		},
		legalComments: "none",
		logLevel: "silent",
		plugins: [masterStubPlugin(), externalNodePlugin()],
	});
	return { directory, outfile, metafile: result.metafile };
}

// This Node stage is a fast filter. At import time a third-party module may reach
// only the built-ins the real production bundle imports. The workerd boot is the proof.
async function executeBundle(outfile) {
	const source = readFileSync(outfile, "utf8");
	const allow = [...(await productionBuiltinAllowList())].sort();
	const script = `
		import { createRequire, isBuiltin, registerHooks, syncBuiltinESMExports } from "node:module";
		const allow = new Set(${JSON.stringify(allow)});
		const reads = [];
		const forbiddenBuiltins = [];
		const seen = new WeakSet();
		const baseRequire = createRequire(process.cwd() + "/worker-guard.mjs");
		function canonicalBuiltin(specifier) {
			const name = String(specifier);
			if (!isBuiltin(name)) return null;
			return name.startsWith("node:") ? name.slice(5) : name;
		}
		function reachesFs(specifier) {
			const name = canonicalBuiltin(specifier);
			return name === "fs" || name === "fs/promises";
		}
		function rejectBuiltin(specifier) {
			const name = canonicalBuiltin(specifier);
			if (!name || allow.has(name)) return;
			forbiddenBuiltins.push(name);
			if (reachesFs(specifier)) return;
			throw new Error("Import-time built-in: " + name);
		}
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
		for (const specifier of ["fs", "node:fs", "fs/promises", "node:fs/promises"]) wrapObject(baseRequire(specifier));
		syncBuiltinESMExports();
		registerHooks({
			resolve(specifier, context, nextResolve) {
				rejectBuiltin(specifier);
				return nextResolve(specifier, context);
			},
		});
		const fsFacade = () => new Proxy(function () {}, {
			get(_target, key) {
				if (key === "promises") return fsFacade();
				if (typeof key !== "string") return undefined;
				return (...args) => {
					reads.push({ name: key, path: args.length === 0 ? "" : String(args[0]) });
					throw new Error("Import-time filesystem read");
				};
			},
		});
		const originalBinding = process.binding;
		process.binding = (specifier) => {
			rejectBuiltin(specifier);
			if (reachesFs(specifier)) return fsFacade();
			return originalBinding(specifier);
		};
		const originalLinked = process._linkedBinding;
		process._linkedBinding = (specifier) => {
			rejectBuiltin(specifier);
			if (reachesFs(specifier)) return fsFacade();
			return originalLinked(specifier);
		};
		const originalBuiltin = process.getBuiltinModule;
		process.getBuiltinModule = (specifier) => {
			rejectBuiltin(specifier);
			const loaded = originalBuiltin(specifier);
			if (reachesFs(specifier)) wrapObject(loaded);
			return loaded;
		};
		const guardedRequire = (specifier) => {
			rejectBuiltin(specifier);
			const loaded = baseRequire(specifier);
			if (reachesFs(specifier)) wrapObject(loaded);
			return loaded;
		};
		guardedRequire.resolve = (specifier) => baseRequire.resolve(specifier);
		globalThis.__workerGuardRequire = guardedRequire;
		globalThis.fetch = () => { throw new Error("Network is disabled"); };
		let error = null;
		try {
			await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)});
		}
		catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
		if (error === null && forbiddenBuiltins.length > 0) {
			error = reads.length > 0 ? "Import-time filesystem read" : "Import-time built-in: " + forbiddenBuiltins[0];
		}
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
				masterStubPlugin(),
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
		assert.deepEqual(await executeBundle(real.outfile), { reads: [], error: null });
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
		const execution = await executeBundle(bundled.outfile);
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
				const execution = await executeBundle(bundle.outfile);
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

function streamConstructorCalls() {
	const calls = [];
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
	return calls;
}

test("every filesystem function records an import-time call", async () => {
	const calls = [
		['import { openSync } from "node:fs";\nopenSync("secret.txt", "r");\n', "openSync", "secret.txt"],
		['import { readSync } from "node:fs";\nreadSync(3, Buffer.alloc(0));\n', "readSync", "3"],
		['import { fdatasyncSync } from "node:fs";\nfdatasyncSync(3);\n', "fdatasyncSync", "3"],
		['import { chmod } from "node:fs/promises";\nchmod("secret.txt", 0o600);\n', "chmod", "secret.txt"],
	];
	calls.push(...streamConstructorCalls());
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
			const execution = await executeBundle(bundled.outfile);
			assert.deepEqual(execution.reads, [{ name, path }]);
			assert.equal(execution.error, "Import-time filesystem read");
		} finally {
			rmSync(bundled.directory, { recursive: true, force: true });
			rmSync(directory, { recursive: true, force: true });
		}
	}
});

test("process bindings that reach fs fail the worker guard", async () => {
	const calls = [
		[
			'const binding = process.binding("fs"); binding.internalModuleStat("/dev/null");',
			"internalModuleStat",
			"/dev/null",
		],
		[
			'const binding = process._linkedBinding("fs"); binding.internalModuleStat("/dev/null");',
			"internalModuleStat",
			"/dev/null",
		],
		['const fs = process.getBuiltinModule("fs"); fs.statSync("/dev/null");', "statSync", "/dev/null"],
		['const fs = process.getBuiltinModule("node:fs"); fs.statSync("/dev/null");', "statSync", "/dev/null"],
		['const fs = process.getBuiltinModule("node:fs/promises"); await fs.stat("/dev/null");', "stat", "/dev/null"],
	];
	for (const [source, name, path] of calls) {
		const directory = mkdtempSync(join(tmpdir(), "tensquads-binding-"));
		const packageDir = join(directory, "node_modules", "reads-at-import");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({ name: "reads-at-import", type: "module", main: "index.js" }),
		);
		writeFileSync(join(packageDir, "index.js"), `${source}\nexport const value = 1;\n`);
		const fixture = join(directory, "entry.js");
		writeFileSync(fixture, 'import "reads-at-import";\nexport const ok = 1;\n');
		const bundled = await bundleWithMeta([fixture]);
		try {
			assert.deepEqual(thirdPartyImportReads(bundled.metafile), []);
			const execution = await executeBundle(bundled.outfile);
			assert.deepEqual(execution.reads, [{ name, path }]);
			assert.equal(execution.error, "Import-time filesystem read");
		} finally {
			rmSync(bundled.directory, { recursive: true, force: true });
			rmSync(directory, { recursive: true, force: true });
		}
	}
});

test("a third-party import may reach only built-ins the real bundle needs", async () => {
	const allow = await productionBuiltinAllowList();
	assert.equal(allow.has("fs"), false);
	assert.equal(allow.has("fs/promises"), false);
	assert.equal(allow.has("child_process"), false);
	assert.equal(allow.has("module"), false);
	assert.equal(allow.size > 0, true);

	const allowed = [...allow].sort()[0];
	for (const [source, builtin] of builtinImportCases(allowed)) {
		assert.deepEqual(await executeImportFixture(source), {
			reads: [],
			error: builtin === null ? null : `Import-time built-in: ${builtin}`,
		});
	}
});

function builtinImportCases(allowed) {
	const cases = [
		['const loaded = process.getBuiltinModule("module"); loaded._stat("/dev/null");', "module"],
		['const loaded = process.getBuiltinModule("module"); loaded._readPackage("/tmp");', "module"],
		[
			'const childProcess = process.getBuiltinModule("child_process"); childProcess.execFileSync("/bin/echo", ["ok"]);',
			"child_process",
		],
		['require("child_process").execFileSync("/bin/echo", ["ok"]);', "child_process"],
		['await import("node:child_process");', "child_process"],
		[
			'import { createRequire } from "node:module"; createRequire(process.cwd() + "/x.js")("child_process");',
			"module",
		],
		[`import ${JSON.stringify(`node:${allowed}`)};\nexport const loaded = 1;`, null],
	];
	for (const specifier of ["fs", "node:fs", "fs/promises", "node:fs/promises"]) {
		for (const source of [
			`import "${specifier}";`,
			`await import("${specifier}");`,
			`require("${specifier}");`,
			`process.getBuiltinModule("${specifier}");`,
			`process.binding("${specifier}");`,
			`process._linkedBinding("${specifier}");`,
		]) {
			cases.push([source, specifier.replace(/^node:/, "")]);
		}
	}
	return cases;
}

async function executeImportFixture(source) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-allow-"));
	let bundled;
	try {
		const packageDir = join(directory, "node_modules", "reads-at-import");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({ name: "reads-at-import", type: "module", main: "index.js" }),
		);
		writeFileSync(join(packageDir, "index.js"), `${source}\nexport const value = 1;\n`);
		const fixture = join(directory, "entry.js");
		writeFileSync(fixture, 'import "reads-at-import";\nexport const ok = 1;\n');
		bundled = await bundleWithMeta([fixture]);
		return await executeBundle(bundled.outfile);
	} finally {
		if (bundled) rmSync(bundled.directory, { recursive: true, force: true });
		rmSync(directory, { recursive: true, force: true });
	}
}

test("caught forbidden built-in reaches still fail the worker guard", async () => {
	for (const specifier of ["child_process", "node:child_process", "module", "node:module"]) {
		for (const call of [
			`require("${specifier}")`,
			`await import("${specifier}")`,
			`process.getBuiltinModule("${specifier}")`,
			`process.binding("${specifier}")`,
			`process._linkedBinding("${specifier}")`,
		]) {
			assert.deepEqual(await executeImportFixture(`try { ${call}; } catch {}`), {
				reads: [],
				error: `Import-time built-in: ${specifier.replace(/^node:/, "")}`,
			});
		}
	}
	assert.deepEqual(
		await executeImportFixture('try { process.getBuiltinModule("module")._readPackage("/tmp"); } catch {}'),
		{ reads: [], error: "Import-time built-in: module" },
	);
});

test("caught filesystem calls retain their read evidence", async () => {
	for (const call of [
		'process.getBuiltinModule("fs").statSync("secret.txt")',
		'require("fs").statSync("secret.txt")',
		'(await import("node:fs/promises")).stat("secret.txt")',
		'process.binding("fs").statSync("secret.txt")',
		'process._linkedBinding("fs").statSync("secret.txt")',
	]) {
		const result = await executeImportFixture(`try { ${call}; } catch {}`);
		assert.equal(result.error, "Import-time filesystem read");
		assert.equal(result.reads.length, 1);
		assert.equal(result.reads[0].path, "secret.txt");
	}
});

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// The real build imports the private agent kit. A checkout without the kit skips that test.
// The check matches scripts/kit-optional.mjs. CI always links the kit, real or stub,
// so CI sets CI=true and never skips: a missing kit fails there.
const kitInstalled = existsSync(join(repoRoot, "node_modules/@tensquads/agent-kit/package.json"));
const kitSkip =
	kitInstalled || process.env.CI === "true"
		? false
		: "The agent kit is not installed. The real build test was skipped.";
const serverDirectory = join(repoRoot, "apps/web/dist/server");

let productionBuilt = false;
let productionAllowList;

function readWorkerCompat() {
	const text = readFileSync(join(repoRoot, "apps/web/wrangler.jsonc"), "utf8");
	const config = JSON.parse(
		text
			.split("\n")
			.filter((line) => !line.trim().startsWith("//"))
			.join("\n"),
	);
	return {
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
	};
}

const productionOrigin = "https://tensquads.moe-678.workers.dev";
const realOrigin = "https://tensquads-real.moe-678.workers.dev";

function buildProductionWorker() {
	if (productionBuilt) return;
	const env = { ...process.env };
	delete env.CLOUDFLARE_ENV;
	execFileSync("npm", ["run", "build", "-w", "@tensquads/web"], {
		cwd: repoRoot,
		env,
		stdio: ["ignore", "ignore", "pipe"],
	});
	productionBuilt = true;
}

function buildRealWorker(outDir) {
	execFileSync("npx", ["vite", "build", "--outDir", outDir], {
		cwd: join(repoRoot, "apps/web"),
		env: { ...process.env, CLOUDFLARE_ENV: "real" },
		stdio: ["ignore", "ignore", "pipe"],
	});
}

function jsFiles(root) {
	const files = [];
	const pending = [root];
	while (pending.length > 0) pushJsDirectory(pending.pop(), pending, files);
	return files;
}

function pushJsDirectory(dir, pending, files) {
	for (const name of readdirSync(dir)) pushJsEntry(join(dir, name), name, pending, files);
}

function pushJsEntry(path, name, pending, files) {
	if (name === ".vite") return;
	if (statSync(path).isDirectory()) {
		pending.push(path);
		return;
	}
	if (name.endsWith(".js")) files.push(path);
}

function scanProductionBuiltins(directory) {
	const names = new Set();
	const pattern = /(?:import\s*(?:[^'"()]*?\sfrom\s*)?|import\s*\(\s*|require\s*\(\s*)["']node:([^"']+)["']/g;
	for (const path of jsFiles(directory)) {
		for (const match of readFileSync(path, "utf8").matchAll(pattern)) names.add(match[1]);
	}
	return names;
}

async function productionBuiltinAllowList() {
	if (!productionAllowList) {
		buildProductionWorker();
		productionAllowList = scanProductionBuiltins(serverDirectory);
	}
	return productionAllowList;
}

function workerModules(directory) {
	const modules = {};
	for (const path of jsFiles(directory)) {
		modules[relative(directory, path)] = { type: "esm", contents: readFileSync(path, "utf8") };
	}
	return modules;
}

async function bootWorkerd(directory, compat) {
	const { Miniflare, NoOpLog } = await import("miniflare");
	const mf = new Miniflare({
		log: new NoOpLog(),
		workers: [
			{
				config: {
					name: "tensquads",
					compatibilityDate: compat.compatibilityDate,
					compatibilityFlags: compat.compatibilityFlags,
					manifest: {
						mainModule: "index.js",
						modulesRoot: directory,
						modules: workerModules(directory),
					},
				},
			},
		],
	});
	try {
		const response = await mf.dispatchFetch("http://localhost/");
		return { failed: response.status !== 200, status: response.status, body: await response.text() };
	} catch (cause) {
		return { failed: true, status: 0, body: "", error: cause instanceof Error ? cause.message : String(cause) };
	} finally {
		await mf.dispose().catch(() => {});
	}
}

function writeScratchPackage(directory, source) {
	const packageDir = join(directory, "node_modules", "scratch-proof");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		join(packageDir, "package.json"),
		JSON.stringify({ name: "scratch-proof", type: "module", main: "index.js" }),
	);
	writeFileSync(join(packageDir, "index.js"), source(packageDir));
	return packageDir;
}

async function proveFixtureInNode(source) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-node-fixture-"));
	try {
		const packageDir = writeScratchPackage(directory, source);
		const loaded = await import(pathToFileURL(join(packageDir, "index.js")).href);
		return loaded.value;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function bootThirdParty(source, compat) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-workerd-"));
	const workerDirectory = mkdtempSync(join(tmpdir(), "tensquads-workerd-bundle-"));
	try {
		writeScratchPackage(directory, source);
		const entry = join(directory, "entry.js");
		writeFileSync(
			entry,
			'import "scratch-proof";\nexport default { fetch() { return new Response("ok", { status: 200 }); } };\n',
		);
		await esbuild.build({
			entryPoints: [entry],
			bundle: true,
			format: "esm",
			platform: "neutral",
			target: "es2024",
			conditions: ["workerd", "worker", "browser"],
			outfile: join(workerDirectory, "index.js"),
			legalComments: "none",
			logLevel: "silent",
			plugins: [externalNodePlugin()],
		});
		return await bootWorkerd(workerDirectory, compat);
	} finally {
		rmSync(directory, { recursive: true, force: true });
		rmSync(workerDirectory, { recursive: true, force: true });
	}
}

function workerdFixtures(realPath) {
	const fileText = readFileSync(realPath, "utf8");
	return [
		{
			name: "fs.readFileSync",
			nodeValue: fileText,
			workerd: /no such file or directory, readAll/,
			source(packageDir) {
				return [
					'import { readFileSync } from "node:fs";',
					`const text = readFileSync(${JSON.stringify(realPath)}, "utf8");`,
					'if (!text.includes("tensquads")) throw new Error("read failed");',
					"export const value = text;",
					`export const kept = ${JSON.stringify(packageDir)};`,
				].join("\n");
			},
		},
		{
			name: "process.binding",
			nodeValue: 0,
			workerd: /The process\.binding method is not implemented/,
			source(packageDir) {
				return [
					'const binding = process.binding("fs");',
					`const stat = binding.internalModuleStat(${JSON.stringify(realPath)});`,
					'if (stat !== 0) throw new Error("stat failed");',
					"export const value = stat;",
					`export const kept = ${JSON.stringify(packageDir)};`,
				].join("\n");
			},
		},
		{
			// Default import. A namespace import leaves _readPackage undefined in Node 24.
			// Node must read the scratch package. Workerd's node:module default has no _readPackage.
			name: "module._readPackage",
			nodeValue: "scratch-proof",
			workerd: /TypeError: module\._readPackage is not a function/,
			source(packageDir) {
				return [
					'import module from "node:module";',
					`const pkg = module._readPackage(${JSON.stringify(packageDir)});`,
					'if (!pkg || pkg.name !== "scratch-proof") throw new Error("read failed");',
					"export const value = pkg.name;",
				].join("\n");
			},
		},
		{
			name: "child_process.execFileSync",
			nodeValue: "ok",
			workerd: /The child_process\.execFileSync method is not implemented/,
			source(packageDir) {
				return [
					'import { execFileSync } from "node:child_process";',
					'const text = execFileSync("/bin/echo", ["ok"], { encoding: "utf8" });',
					'if (String(text).trim() !== "ok") throw new Error("exec failed");',
					"export const value = String(text).trim();",
					`export const kept = ${JSON.stringify(packageDir)};`,
				].join("\n");
			},
		},
	];
}

function assertDeployedParties(directory, origin, other) {
	const text = jsFiles(directory)
		.map((path) => readFileSync(path, "utf8"))
		.join("\n");
	assert.equal(text.includes(origin), true);
	assert.equal(text.includes(other), false);
	// A browser azp for the dev server is http://localhost plus a port.
	// Library code still contains the host name and http://localhost with no port.
	assert.equal(/https?:\/\/localhost:\d+/.test(text), false);
	assert.equal(text.includes("TS_E2E_PORT"), false);
	assert.match(text, new RegExp(`\\["${origin.replaceAll(".", "\\.")}"\\]`));
}

test("a real build authorizes only the real worker origin", { skip: kitSkip }, () => {
	const outDir = mkdtempSync(join(tmpdir(), "tensquads-real-bundle-"));
	try {
		buildRealWorker(outDir);
		assertDeployedParties(join(outDir, "server"), realOrigin, productionOrigin);
	} finally {
		rmSync(outDir, { recursive: true, force: true });
	}
});

function assertWorkerdRejection(fixture, result) {
	const error = result.error ?? "";
	assert.equal(
		result.failed,
		true,
		`${fixture.name} did not fail in workerd. It would be harmless in production or need a named rule.`,
	);
	assert.match(error, fixture.workerd, fixture.name);
	assert.equal(error.includes("read failed"), false, fixture.name);
	assert.equal(error.includes("stat failed"), false, fixture.name);
	assert.equal(error.includes("exec failed"), false, fixture.name);
}

test("workerd boots the built worker and rejects import-time builtin routes", async () => {
	const compat = readWorkerCompat();
	buildProductionWorker();
	assertDeployedParties(serverDirectory, productionOrigin, realOrigin);
	const built = JSON.parse(readFileSync(join(serverDirectory, "wrangler.json"), "utf8"));
	assert.equal(built.compatibility_date, compat.compatibilityDate);
	assert.deepEqual(built.compatibility_flags, compat.compatibilityFlags);

	const live = readFileSync(join(repoRoot, "packages/adapters/src/cloudflare-bus/master-live.ts"), "utf8");
	assert.equal(live.includes('from "@tensquads/domain/master"'), true);
	assert.equal(live.includes(".join("), false);
	const homepage = await bootWorkerd(serverDirectory, compat);
	assert.equal(homepage.status, 200);
	assert.equal(homepage.body.includes("tensquads homepage"), true);
	const workerText = jsFiles(serverDirectory)
		.map((path) => readFileSync(path, "utf8"))
		.join("\n");
	assert.equal(workerText.includes("@tensquads/agent-kit"), false);
	assert.equal(workerText.includes("master/loop"), false);
	assert.equal(workerText.includes("master/proof"), false);
	assert.equal(workerText.includes("digestOf"), false);
	assert.equal(workerText.includes("@tensquads/domain/master"), false);
	assert.equal(workerText.includes("@cloudflare/puppeteer"), false);

	const realPath = join(repoRoot, "package.json");
	for (const fixture of workerdFixtures(realPath)) {
		assert.equal(await proveFixtureInNode(fixture.source), fixture.nodeValue, fixture.name);
		assertWorkerdRejection(fixture, await bootThirdParty(fixture.source, compat));
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

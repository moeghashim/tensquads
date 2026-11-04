import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src", import.meta.url));
const writePattern = /\.(insert|update|delete)\((busEvents|stateEntries)\)/;

function files(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...files(path));
		else if (name.endsWith(".ts")) found.push(path);
	}
	return found;
}

function relative(path: string): string {
	return path.slice(src.length + 1);
}

test("the cloudflare bus has one writer", () => {
	const writers = files(join(src, "cloudflare-bus"))
		.filter((path) => writePattern.test(readFileSync(path, "utf8")))
		.map(relative);
	assert.deepEqual(writers, ["cloudflare-bus/neon-write.ts"]);
});

test("runtime bus writers stay on the known list", () => {
	const writers = files(src)
		.filter((path) => writePattern.test(readFileSync(path, "utf8")))
		.map(relative)
		.sort();
	assert.deepEqual(writers, [
		"cloudflare-bus/neon-write.ts",
		"neon/commands/bus.ts",
		"neon/commands/rules.ts",
		"neon/create-workspace.ts",
		"neon/save.ts",
	]);
});

test("the worker entry does not write bus rows", () => {
	const worker = fileURLToPath(new URL("../../../apps/web/src/worker.ts", import.meta.url));
	assert.equal(writePattern.test(readFileSync(worker, "utf8")), false);
});

test("boat words stay out of the ports and only the machine file imports the sdk", () => {
	const roots = [
		fileURLToPath(new URL("../../kernel/src", import.meta.url)),
		fileURLToPath(new URL("../../domain/src", import.meta.url)),
	];
	const closed = /\b(boat|sandbox|snapshot|credential|proxy)\b/i;
	// This sentence is a screen comment in the policy types. It is not a boat word.
	const screenSentence = "The screen replaces this key in the snapshot.";
	for (const root of roots) {
		for (const path of files(root)) {
			const text = readFileSync(path, "utf8").split(screenSentence).join("");
			assert.equal(closed.test(text), false, path);
		}
	}
	const importers = files(src).filter((path) => readFileSync(path, "utf8").includes("@boatdev/sdk"));
	assert.deepEqual(importers.map(relative), ["boat-machine.ts"]);
});

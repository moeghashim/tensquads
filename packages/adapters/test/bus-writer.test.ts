import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { appendEvents } from "../src/neon/commands/bus.ts";

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
	assert.deepEqual(writers, ["cloudflare-bus/neon-write.ts"]);
});

test("real mode bus writes go through the durable object", async () => {
	const previous = process.env.ADAPTERS;
	const draft = {
		from: "master",
		to: "researcher",
		kind: "Task" as const,
		skill: "research",
		text: "Look at the market.",
		payload: {},
	};
	let inserted = false;
	const tx = {
		insert() {
			inserted = true;
			throw new Error("inserted");
		},
	};
	try {
		process.env.ADAPTERS = "real";
		await assert.rejects(
			() => appendEvents(tx as never, "acct", [draft], new Date()),
			/A bus write in real mode must go through the Durable Object\./,
		);
		assert.equal(inserted, false);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});

test("the traffic step does not write bus rows", () => {
	const traffic = fileURLToPath(new URL("../../../apps/web/src/server/traffic-step.ts", import.meta.url));
	const text = readFileSync(traffic, "utf8");
	assert.equal(writePattern.test(text), false);
	assert.match(text, /chooseAdapters/);
	assert.match(text, /createCloudflareBus/);
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

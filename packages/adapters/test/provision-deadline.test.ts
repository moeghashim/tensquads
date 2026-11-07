import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";
import { createBoatMachine } from "../src/boat-machine.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import { startFakeBoat } from "./boat-fake.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;
const wait = { intervalMs: 0, timeoutMs: 5_000 };
const agentModels = {
	RESEARCH_MODEL: "gpt-6-luna",
	RESEARCH_REASONING_EFFORT: "medium",
	WEBSITE_MODEL: "gpt-6-luna",
	WEBSITE_REASONING_EFFORT: "medium",
};

function localUrl(input: Parameters<typeof fetch>[0]): URL {
	const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	const url = new URL(href);
	assert.equal(url.hostname, "127.0.0.1");
	return url;
}

function boat(fake: Awaited<ReturnType<typeof startFakeBoat>>, fetchApi: typeof fetch = fetch) {
	return createBoatMachine({
		token: fake.machineToken,
		adminToken: fake.adminToken,
		basePath: fake.basePath,
		profileName: "tensquads-agents",
		agentModels,
		secretBaseUrl: "https://example.com/hooks",
		fetchApi,
		wait,
	});
}

test("a stalled request aborts at the deadline and releases its flight", { timeout: 1_000 }, async () => {
	const fake = await startFakeBoat();
	let requests = 0;
	let signalSeen = false;
	let abortedBeforeRetry = false;
	const fetchApi: typeof fetch = (input, init) => {
		localUrl(input);
		if (++requests === 1) {
			const signal = init?.signal;
			signalSeen = Boolean(signal);
			return new Promise<Response>((_resolve, reject) => {
				if (!signal) return;
				if (signal.aborted) {
					abortedBeforeRetry = true;
					reject(signal.reason ?? new Error("aborted"));
					return;
				}
				signal.addEventListener("abort", () => {
					abortedBeforeRetry = true;
					reject(signal.reason ?? new Error("aborted"));
				});
			});
		}
		return fetch(input, init);
	};
	try {
		const adapter = createBoatMachine({
			token: fake.machineToken,
			adminToken: fake.adminToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			agentModels,
			secretBaseUrl: "https://example.com/hooks",
			fetchApi,
			wait: { intervalMs: 0, timeoutMs: 20 },
		});
		const startedAt = Date.now();
		await assert.rejects(
			() => adapter.start(scope, "orders", "registry.agents.co/orders:0.1.0"),
			(error: unknown) => error instanceof MachineFault && error.code === "unavailable",
		);
		assert.equal(signalSeen, true);
		assert.equal(Date.now() - startedAt < 200, true);
		// The stalled request itself was cancelled, not only abandoned.
		assert.equal(abortedBeforeRetry, true);
		// The flight table is shared by every adapter, so a fresh adapter proves the stalled flight was released.
		await boat(fake, fetchApi).start(scope, "orders", "registry.agents.co/orders:0.1.0");
		assert.equal(requests > 1, true);
		assert.equal(fake.creates, 1);
	} finally {
		await fake.close();
	}
});

function stalledFetch(): typeof fetch {
	return (input, init) => {
		localUrl(input);
		return new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			if (!signal) return;
			if (signal.aborted) {
				reject(signal.reason ?? new Error("aborted"));
				return;
			}
			signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
		});
	};
}

test("host and rotateToken outside a flight stop at the deadline", { timeout: 2_000 }, async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = createBoatMachine({
			token: fake.machineToken,
			adminToken: fake.adminToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			agentModels,
			secretBaseUrl: "https://example.com/hooks",
			fetchApi: stalledFetch(),
			wait: { intervalMs: 0, timeoutMs: 20 },
		});
		const token = await signMachineToken("fixture", scope.accountId, "market", 2_000_000_000);
		for (const run of [() => adapter.host(scope, "market"), () => adapter.rotateToken(scope, "market", token)]) {
			// A missing deadline would hang forever, so the test sets its own limit and fails instead.
			const outcome = await Promise.race([
				run().then(
					() => "resolved",
					() => "rejected",
				),
				new Promise<string>((done) => setTimeout(() => done("hung"), 500)),
			]);
			assert.equal(outcome, "rejected");
		}
	} finally {
		await fake.close();
	}
});

test("profile setup runs inside the flight, so overlapping starts look up the profile once", {
	timeout: 3_000,
}, async () => {
	const fake = await startFakeBoat();
	let lookups = 0;
	let openGate = () => {};
	let markHeld = () => {};
	const opened = new Promise<void>((resolve) => {
		openGate = resolve;
	});
	const held = new Promise<void>((resolve) => {
		markHeld = resolve;
	});
	const fetchApi: typeof fetch = (input, init) => {
		const url = localUrl(input);
		if ((init?.method ?? "GET") === "GET" && url.pathname.endsWith("/credential-profiles")) {
			lookups += 1;
			if (lookups === 1) {
				markHeld();
				return opened.then(() => fetch(input, init));
			}
		}
		return fetch(input, init);
	};
	const adapter = boat(fake, fetchApi);
	const both = Promise.all([
		adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market"),
		adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market"),
	]);
	try {
		await held;
		for (let tick = 0; tick < 5; tick += 1) await new Promise((done) => setImmediate(done));
		assert.equal(lookups, 1);
		openGate();
		await both;
		assert.equal(fake.creates, 1);
	} finally {
		openGate();
		await fake.close();
	}
});

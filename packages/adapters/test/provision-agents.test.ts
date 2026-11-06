import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";
import { imageTag } from "../src/boat-fields.ts";
import { createBoatMachine } from "../src/boat-machine.ts";
import {
	MACHINE_TOKEN_ENV,
	MACHINE_TOKEN_ROTATION_LEAD_SECONDS,
	MACHINE_TOKEN_TTL_SECONDS,
	machineCredentialProfile,
} from "../src/cloudflare-bus/token.ts";
import { provisionAgents, readLiveMachine } from "../src/provision-agents.ts";
import { startFakeBoat } from "./boat-fake.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;
const wait = { intervalMs: 0, timeoutMs: 5_000 };
const now = Date.parse("2026-11-05T12:00:00.000Z");
const marketProfile = machineCredentialProfile(scope.accountId, "market");
const websiteProfile = machineCredentialProfile(scope.accountId, "website");

function localFetch(fallback: typeof fetch): typeof fetch {
	return (input, init) => {
		const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		assert.equal(new URL(href).hostname, "127.0.0.1");
		return fallback(input, init);
	};
}

function realEnv(fake: Awaited<ReturnType<typeof startFakeBoat>>, fetchApi: typeof fetch) {
	return {
		ADAPTERS: "real",
		BOAT_TOKEN: fake.machineToken,
		BOAT_ADMIN_TOKEN: fake.adminToken,
		BOAT_PROFILE: "tensquads-agents",
		BOAT_BASE_PATH: fake.basePath,
		BOAT_SECRET_BASE_URL: "https://example.com/hooks",
		MACHINE_TOKEN_KEY: "machine-token-fixture",
		fetchApi,
		wait,
	};
}

test("provisionAgents starts each real agent once from its snapshot", async () => {
	const fake = await startFakeBoat();
	const fetchApi = localFetch(fetch);
	try {
		let outside = 0;
		const quiet = await provisionAgents(
			{
				ADAPTERS: "test",
				fetchApi: () => {
					outside += 1;
					return Promise.reject(new Error("test mode called the machine service"));
				},
			},
			scope.accountId,
			now,
		);
		assert.equal(outside, 0);
		assert.deepEqual(
			quiet.map((row) => row.agentId),
			["market", "website"],
		);
		assert.equal(
			quiet.every((row) => row.rotated === false),
			true,
		);

		const first = await provisionAgents(realEnv(fake, fetchApi), scope.accountId, now);
		assert.equal(fake.creates, 2);
		assert.deepEqual(
			first.map((row) => [row.agentId, row.rotated, row.profile, row.snapshot]),
			[
				["market", true, marketProfile, "tensquads-market-0-1-0"],
				["website", true, websiteProfile, "tensquads-website-0-1-0"],
			],
		);
		assert.equal(JSON.stringify(first).includes("machine-token"), false);
		assert.deepEqual(
			first.map((row) => Object.keys(row).sort()),
			[
				["agentId", "exp", "profile", "rotated", "snapshot"],
				["agentId", "exp", "profile", "rotated", "snapshot"],
			],
		);
		for (const row of first) {
			assert.equal(row.exp - Math.floor(now / 1000), MACHINE_TOKEN_TTL_SECONDS);
		}
		const market = fake.machines().find((row) => row.labels.agent === "market");
		const website = fake.machines().find((row) => row.labels.agent === "website");
		assert.equal(market?.from, "tensquads-market-0-1-0");
		assert.equal(website?.from, "tensquads-website-0-1-0");
		assert.equal(market?.environment, marketProfile);
		assert.equal(website?.environment, websiteProfile);
		assert.equal(market?.noEnv, false);
		assert.equal(website?.noEnv, false);
		assert.equal(market?.env.ACCOUNT_ID, scope.accountId);
		assert.equal(market?.env.TENSQUADS_AGENT_ID, "market");
		assert.equal(market?.env.IMAGE_TAG, "registry.agents.co/market:0.1.0");
		assert.notEqual(market?.env.IMAGE_TAG, imageTag("market-0-1", "0"));
		assert.equal(website?.env.IMAGE_TAG, "registry.agents.co/website:0.1.0");
		const created = fake.secretCalls.filter((call) => call.name === "profile");
		assert.deepEqual(
			created.map((call) => [call.profile, call.copyFrom, call.kind]),
			[
				[marketProfile, "tensquads-agents", "admin"],
				[websiteProfile, "tensquads-agents", "admin"],
			],
		);
		const tokens = fake.secretCalls.filter((call) => call.name === MACHINE_TOKEN_ENV);
		assert.deepEqual(
			tokens.map((call) => call.profile),
			[marketProfile, websiteProfile],
		);
		assert.equal(
			tokens.every((call) => call.kind === "admin" && call.profile !== "tensquads-agents"),
			true,
		);
		for (const name of [marketProfile, websiteProfile]) {
			const environment = fake.environments().find((row) => row.name === name);
			assert.equal(environment?.credentialProfileId, name);
			assert.equal(environment?.safeForThirdParties, true);
			assert.equal(environment?.proxyAiCredentials, true);
			assert.equal(environment?.updates, 1);
		}
		const kept = Object.fromEntries(first.map((row) => [row.agentId, row.exp]));
		const second = await provisionAgents(realEnv(fake, fetchApi), scope.accountId, now + 86_400_000, kept);
		assert.equal(fake.creates, 2);
		assert.equal(
			second.every((row) => row.rotated === false),
			true,
		);
		assert.equal(fake.secretCalls.filter((call) => call.name === "profile").length, 2);
		assert.equal(
			fake.environments().every((row) => row.updates === 1),
			true,
		);
	} finally {
		await fake.close();
	}
});

test("provisionAgents rotates a token in its last seven days", async () => {
	const fake = await startFakeBoat();
	const fetchApi = localFetch(fetch);
	try {
		const due = Math.floor(now / 1000) + MACHINE_TOKEN_ROTATION_LEAD_SECONDS;
		const first = await provisionAgents(realEnv(fake, fetchApi), scope.accountId, now, {
			market: due,
			website: due + 60,
		});
		assert.deepEqual(
			first.map((row) => [row.agentId, row.rotated]),
			[
				["market", true],
				["website", false],
			],
		);
		const written = fake.secretCalls.filter((call) => call.name === MACHINE_TOKEN_ENV).length;
		const again = await provisionAgents(
			realEnv(fake, fetchApi),
			scope.accountId,
			now,
			Object.fromEntries(first.map((row) => [row.agentId, row.exp])),
		);
		assert.equal(
			again.every((row) => row.rotated === false),
			true,
		);
		assert.equal(fake.secretCalls.filter((call) => call.name === MACHINE_TOKEN_ENV).length, written);
		assert.equal(fake.creates, 2);
	} finally {
		await fake.close();
	}
});

test("a known snapshot attaches the agent profile and a running machine stays", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = createBoatMachine({
			token: fake.machineToken,
			adminToken: fake.adminToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			secretBaseUrl: "https://example.com/hooks",
			fetchApi: localFetch(fetch),
			wait,
		});
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		await adapter.stop(scope, "market");
		const creates = fake.creates;
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		assert.equal(fake.creates, creates);
		const row = fake.machines().find((item) => item.labels.agent === "market");
		assert.equal(row?.state, "running");
		assert.equal(row?.environment, marketProfile);
		const trial = await adapter.makeTemplate(scope, "market-researcher", "0.1.0");
		await adapter.startFromTemplate(scope, trial.id, "orders");
		const orders = fake.machines().find((item) => item.name === "vps-orders-01");
		assert.equal(orders?.environment, "tensquads-agents");
		assert.equal(orders?.noEnv, true);
	} finally {
		await fake.close();
	}
});

test("readLiveMachine uses the boat fields for the real-run agents", async () => {
	const fake = await startFakeBoat();
	const fetchApi = localFetch(fetch);
	try {
		assert.equal(await readLiveMachine({ ADAPTERS: "test", fetchApi }, scope, "market"), null);
		await provisionAgents(realEnv(fake, fetchApi), scope.accountId, now);
		const live = await readLiveMachine(realEnv(fake, fetchApi), scope, "market");
		assert.deepEqual(live, { host: "203.0.113.10", cpu: "20%", uptime: "3 days" });
		const named = fake.machines().find((row) => row.labels.agent === "market");
		if (named) {
			named.ip = null;
			named.name = "named-host";
		}
		assert.equal((await readLiveMachine(realEnv(fake, fetchApi), scope, "market"))?.host, "named-host");
		assert.equal(await readLiveMachine(realEnv(fake, fetchApi), scope, "support"), null);
		assert.equal(await readLiveMachine(realEnv(fake, fetchApi), scope, "missing"), null);
		const absent = await readLiveMachine(realEnv(fake, fetchApi), { accountId: "other", mode: "account" }, "market");
		assert.equal(absent, null);
	} finally {
		await fake.close();
	}
});

test("a real provision without registration does not start a machine", async () => {
	const fake = await startFakeBoat();
	try {
		await assert.rejects(
			() =>
				provisionAgents(
					{
						ADAPTERS: "real",
						BOAT_TOKEN: fake.machineToken,
						BOAT_PROFILE: "tensquads-agents",
						BOAT_BASE_PATH: fake.basePath,
						fetchApi: fetch,
					},
					scope.accountId,
					now,
				),
			(error: unknown) =>
				error instanceof MachineFault && error.message === "The machine service is not configured.",
		);
		assert.equal(fake.creates, 0);
	} finally {
		await fake.close();
	}
});

function boat(fake: Awaited<ReturnType<typeof startFakeBoat>>, fetchApi: typeof fetch = fetch) {
	return createBoatMachine({
		token: fake.machineToken,
		adminToken: fake.adminToken,
		basePath: fake.basePath,
		profileName: "tensquads-agents",
		secretBaseUrl: "https://example.com/hooks",
		fetchApi,
		wait,
	});
}

test("a resumed real agent keeps its environment", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = boat(fake);
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		await adapter.stop(scope, "market");
		await adapter.resume(scope, "market");
		const row = fake.machines().find((item) => item.labels.agent === "market");
		assert.equal(row?.state, "running");
		assert.equal(row?.environment, marketProfile);
	} finally {
		await fake.close();
	}
});

test("a running real agent is not resumed again", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = boat(fake);
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		assert.equal(fake.resumeCalls, 0);
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		await adapter.resume(scope, "market");
		assert.equal(fake.resumeCalls, 0);
	} finally {
		await fake.close();
	}
});

test("overlapping resumes of one stopped agent send one resume", { timeout: 3_000 }, async () => {
	const fake = await startFakeBoat();
	const setup = boat(fake);
	await setup.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
	await setup.stop(scope, "market");
	let resumes = 0;
	let openGate = () => {};
	let markHeld = () => {};
	const opened = new Promise<void>((resolve) => {
		openGate = resolve;
	});
	const held = new Promise<void>((resolve) => {
		markHeld = resolve;
	});
	const fetchApi: typeof fetch = (input, init) => {
		const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		assert.equal(new URL(href).hostname, "127.0.0.1");
		const method = init?.method ?? "GET";
		if (method === "POST" && new URL(href).pathname.endsWith("/resume")) {
			resumes += 1;
			if (resumes === 1) {
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
		assert.equal(resumes, 1);
		openGate();
		await both;
		assert.equal(resumes, 1);
		assert.equal(fake.resumeCalls, 1);
	} finally {
		openGate();
		await fake.close();
	}
});

test("overlapping environment creates both succeed", { timeout: 3_000 }, async () => {
	const fake = await startFakeBoat();
	let posts = 0;
	let releaseSecond = () => {};
	const secondPosted = new Promise<void>((resolve) => {
		releaseSecond = resolve;
	});
	const fetchApi: typeof fetch = (input, init) => {
		const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		assert.equal(new URL(href).hostname, "127.0.0.1");
		const method = init?.method ?? "GET";
		if (method === "POST" && new URL(href).pathname.endsWith("/environments")) {
			posts += 1;
			if (posts >= 2) releaseSecond();
			if (posts === 1) return secondPosted.then(() => fetch(input, init));
		}
		return fetch(input, init);
	};
	try {
		const adapter = boat(fake, fetchApi);
		await Promise.all([
			adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market"),
			adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market"),
		]);
		assert.equal(posts, 2);
		assert.equal(fake.creates, 1);
		const row = fake.machines().find((item) => item.labels.agent === "market");
		assert.equal(row?.environment, marketProfile);
	} finally {
		releaseSecond();
		await fake.close();
	}
});

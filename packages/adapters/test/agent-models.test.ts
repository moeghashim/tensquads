import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";
import { createBoatMachine } from "../src/boat-machine.ts";
import { provisionAgents } from "../src/provision-agents.ts";
import { startFakeBoat } from "./boat-fake.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;
const wait = { intervalMs: 0, timeoutMs: 5_000 };
const now = Date.parse("2026-11-05T12:00:00.000Z");

const models = {
	RESEARCH_MODEL: "gpt-6-luna",
	RESEARCH_REASONING_EFFORT: "medium",
	WEBSITE_MODEL: "gpt-6-luna",
	WEBSITE_REASONING_EFFORT: "medium",
};

const blankMessages: Record<keyof typeof models, string> = {
	RESEARCH_MODEL: "The research model is not configured.",
	RESEARCH_REASONING_EFFORT: "The research reasoning effort is not configured.",
	WEBSITE_MODEL: "The website model is not configured.",
	WEBSITE_REASONING_EFFORT: "The website reasoning effort is not configured.",
};

const marketEnv = {
	ACCOUNT_ID: scope.accountId,
	TENSQUADS_AGENT_ID: "market",
	IMAGE_TAG: "registry.agents.co/market:0.1.0",
	RESEARCH_MODEL: "gpt-6-luna",
	RESEARCH_REASONING_EFFORT: "medium",
};

const websiteEnv = {
	ACCOUNT_ID: scope.accountId,
	TENSQUADS_AGENT_ID: "website",
	IMAGE_TAG: "registry.agents.co/website:0.1.0",
	WEBSITE_MODEL: "gpt-6-luna",
	WEBSITE_REASONING_EFFORT: "medium",
};

interface Counter {
	count: number;
}

// Counts every request that leaves for the fake boat. Each test expects zero when config is blank.
function countedFetch(counter: Counter): typeof fetch {
	return (input, init) => {
		counter.count += 1;
		const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		assert.equal(new URL(href).hostname, "127.0.0.1");
		return fetch(input, init);
	};
}

function realEnv(
	fake: Awaited<ReturnType<typeof startFakeBoat>>,
	fetchApi: typeof fetch,
	overrides: Readonly<Record<string, string>> = {},
) {
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
		...models,
		...overrides,
	};
}

function boatWith(
	fake: Awaited<ReturnType<typeof startFakeBoat>>,
	agentModels: Readonly<Record<string, string>> = models,
) {
	return createBoatMachine({
		token: fake.machineToken,
		adminToken: fake.adminToken,
		basePath: fake.basePath,
		profileName: "tensquads-agents",
		secretBaseUrl: "https://example.com/hooks",
		fetchApi: countedFetch({ count: 0 }),
		wait,
		agentModels,
	});
}

function rowFor(fake: Awaited<ReturnType<typeof startFakeBoat>>, agentId: string) {
	return fake.machines().find((item) => item.labels.agent === agentId);
}

test("the market create body carries only the research pair", async () => {
	const fake = await startFakeBoat();
	try {
		await provisionAgents(realEnv(fake, countedFetch({ count: 0 })), scope.accountId, now);
		assert.deepEqual(rowFor(fake, "market")?.env, marketEnv);
	} finally {
		await fake.close();
	}
});

test("the website create body carries only the website pair", async () => {
	const fake = await startFakeBoat();
	try {
		await provisionAgents(realEnv(fake, countedFetch({ count: 0 })), scope.accountId, now);
		assert.deepEqual(rowFor(fake, "website")?.env, websiteEnv);
	} finally {
		await fake.close();
	}
});

test("an empty or blank model setting stops before any boat request", async () => {
	for (const key of Object.keys(models) as (keyof typeof models)[]) {
		for (const value of ["", "   "]) {
			const fake = await startFakeBoat();
			const counter = { count: 0 };
			try {
				await assert.rejects(
					() => provisionAgents(realEnv(fake, countedFetch(counter), { [key]: value }), scope.accountId, now),
					(error: unknown) => error instanceof MachineFault && error.message === blankMessages[key],
					`${key} = "${value}"`,
				);
				assert.equal(counter.count, 0, `${key} = "${value}" sent a request`);
				assert.equal(fake.creates, 0, `${key} = "${value}" created a machine`);
			} finally {
				await fake.close();
			}
		}
	}
});

test("a blank setting also stops startFromTemplate before any boat request", async () => {
	const fake = await startFakeBoat();
	const counter = { count: 0 };
	try {
		const adapter = createBoatMachine({
			token: fake.machineToken,
			adminToken: fake.adminToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			secretBaseUrl: "https://example.com/hooks",
			fetchApi: countedFetch(counter),
			wait,
			agentModels: { ...models, WEBSITE_REASONING_EFFORT: " " },
		});
		await assert.rejects(
			() => adapter.startFromTemplate(scope, "tensquads-website-0-1-0", "website"),
			(error: unknown) => error instanceof MachineFault && error.message === blankMessages.WEBSITE_REASONING_EFFORT,
		);
		assert.equal(counter.count, 0);
		assert.equal(fake.creates, 0);
	} finally {
		await fake.close();
	}
});

test("a resumed market agent gets its research pair again and nothing else new", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = boatWith(fake);
		await adapter.startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		await adapter.stop(scope, "market");
		await adapter.resume(scope, "market");
		assert.deepEqual(rowFor(fake, "market")?.env, marketEnv);
		assert.equal(rowFor(fake, "market")?.state, "running");
	} finally {
		await fake.close();
	}
});

test("a resumed website agent gets its website pair again and nothing else new", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = boatWith(fake);
		await adapter.startFromTemplate(scope, "tensquads-website-0-1-0", "website");
		await adapter.stop(scope, "website");
		await adapter.startFromTemplate(scope, "tensquads-website-0-1-0", "website");
		assert.deepEqual(rowFor(fake, "website")?.env, websiteEnv);
		assert.equal(rowFor(fake, "website")?.state, "running");
	} finally {
		await fake.close();
	}
});

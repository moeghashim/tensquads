import assert from "node:assert/strict";
import test from "node:test";

import { keyFor } from "../src/boat-fields.ts";
import { createBoatMachine } from "../src/boat-machine.ts";
import { startFakeBoat } from "./boat-fake.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;

function boat(fake: Awaited<ReturnType<typeof startFakeBoat>>, model: string) {
	return createBoatMachine({
		token: fake.machineToken,
		adminToken: fake.adminToken,
		basePath: fake.basePath,
		profileName: "tensquads-agents",
		secretBaseUrl: "https://example.com/hooks",
		wait: { intervalMs: 0, timeoutMs: 5_000 },
		agentModels: {
			RESEARCH_MODEL: model,
			RESEARCH_REASONING_EFFORT: "medium",
			WEBSITE_MODEL: model,
			WEBSITE_REASONING_EFFORT: "medium",
		},
	});
}

test("a removed agent starts again when its create body changes", { timeout: 5_000 }, async () => {
	const fake = await startFakeBoat();
	try {
		await boat(fake, "gpt-6-luna").startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		const first = boat(fake, "gpt-6-luna");
		await first.remove(scope, "market");
		await boat(fake, "gpt-6-luna-next").startFromTemplate(scope, "tensquads-market-0-1-0", "market");
		assert.equal(fake.creates, 2);
		// The removed machine is still listed, so read the newest market machine.
		const rows = fake.machines().filter((item) => item.labels.agent === "market");
		assert.equal(rows.at(-1)?.env.RESEARCH_MODEL, "gpt-6-luna-next");
	} finally {
		await fake.close();
	}
});

test("the same create body keeps one key, and a changed body gets a new key", async () => {
	const body = { name: "vps-market-01", env: { RESEARCH_MODEL: "gpt-6-luna" } };
	const same = await keyFor("tensquads-start-acct-1-market-tag", body);
	assert.equal(await keyFor("tensquads-start-acct-1-market-tag", { ...body }), same);
	assert.equal(same.startsWith("tensquads-start-acct-1-market-tag-"), true);
	const changed = await keyFor("tensquads-start-acct-1-market-tag", { ...body, env: { RESEARCH_MODEL: "other" } });
	assert.notEqual(changed, same);
});

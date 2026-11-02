import assert from "node:assert/strict";
import test from "node:test";
import { saveWorkspace } from "@tensquads/adapters";
import { TASKS_DONE_LABEL } from "@tensquads/domain";
import { openPglite } from "../../../../packages/adapters/test/pglite.ts";
import { workspaceFromDesign } from "../../../../packages/seed/src/index.ts";
import { readOverview } from "./overview-read.ts";

const demo = { accountId: "demo", mode: "account" as const };
const leen = { accountId: "leen", mode: "account" as const };

test("the overview read computes the demo screen in twelve queries", async () => {
	let count = 0;
	const opened = await openPglite({
		logQuery() {
			count += 1;
		},
	});
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		count = 0;
		const page = await readOverview(opened.db, demo);
		assert.equal(count, 12);
		assert.equal(page.greeting, "Good morning, Moe");
		assert.equal(page.online, "4 of 5 squads online");
		assert.equal(page.tiles[0]?.value, "$8,420");
		assert.equal(page.tiles[4]?.label, TASKS_DONE_LABEL);
		assert.equal(page.tiles[4]?.value, "331");
		assert.equal(page.tiles[5]?.value, "34h");
		assert.equal(page.bars.length, 14);
		assert.equal(page.bars[0]?.h, 65);
		assert.equal(page.bars[0]?.label, "14");
		assert.equal(page.count, 4);
		assert.equal(page.empty, false);
		assert.equal(page.proposals.length, 1);
		assert.equal(page.approvals.length, 3);
		assert.equal(page.agents.length, 5);
		assert.equal(page.agents.filter((agent) => agent.mission.length === 0).length, 1);
	} finally {
		await opened.close();
	}
});

test("an account with no store shows dashes, zero tasks, and an empty inbox", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		const page = await readOverview(opened.db, leen);
		assert.deepEqual(
			page.tiles.map((tile) => tile.value),
			["—", "—", "—", "—", "0", "—"],
		);
		assert.equal(page.tiles[0]?.delta, "\u00a0");
		assert.equal(page.tiles[4]?.delta, "This week");
		assert.equal(page.bars.length, 0);
		assert.equal(page.empty, true);
		assert.equal(page.emptyText, "Nothing waiting. Your squads are working inside their limits.");
		assert.equal(page.count, 0);
		assert.match(page.greeting, /^Good morning, /);
	} finally {
		await opened.close();
	}
});

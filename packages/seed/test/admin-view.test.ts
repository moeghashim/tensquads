import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, saveWorkspace } from "@tensquads/adapters";
import { accountAdminView, INITIAL_IMAGE, imageCatalogView } from "@tensquads/domain";
import { openPglite } from "../../adapters/test/pglite.ts";
import { workspaceFromDesign } from "../src/index.ts";

const platform = { accountId: "platform", mode: "platform" } as const;

test("the admin views use the seed lists and store no total", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		const repos = createRepositories(opened.db);
		const accounts = await repos.platform.listAccounts(platform);
		const images = await repos.catalog.listImages(platform);
		const totals = await repos.platform.totals(platform);
		assert.equal(totals.tasksDone, 331);
		assert.equal(totals.squads, 17);
		const accountsView = accountAdminView(accounts, "all", "");
		assert.equal(accountsView.kpis[0]?.value, "9");
		assert.equal(accountsView.kpis[0]?.delta, "+1 in the last 2 weeks");
		assert.equal(accountsView.kpis[1]?.value, "6");
		assert.equal(accountsView.kpis[1]?.delta, "2 on trial · 1 paused");
		assert.equal(accountsView.kpis[2]?.value, "66");
		assert.equal(accountsView.kpis[2]?.delta, "53 online right now");
		assert.equal(accountsView.kpis[3]?.value, "4,765");
		assert.equal(accountsView.kpis[4]?.value, "$1,294");
		assert.equal(accountsView.kpis[4]?.delta, "6 paying companies");
		assert.equal(accountsView.kpis[5]?.value, "$14,568");
		assert.equal(accountsView.kpis[5]?.delta, "Avg $2,081 per paying company");
		assert.equal(accountsView.agentsOnline, 53);
		assert.equal(accountsView.shown, "9 of 9");
		assert.deepEqual(
			accountsView.bars.map((bar) => Number(bar.title.match(/: (\d+)/)?.[1])),
			[0, 0, 0, 1, 0, 1, 0, 1],
		);
		assert.equal(accountsView.plans[0]?.label, "Starter");
		assert.equal(accountsView.plans[0]?.count, 3);
		assert.equal(accountsView.plans[0]?.agents, 7);
		assert.equal(accountsView.plans[0]?.pct, 33);
		assert.equal(accountsView.plans[1]?.count, 4);
		assert.equal(accountsView.plans[1]?.agents, 27);
		assert.equal(accountsView.plans[1]?.pct, 44);
		assert.equal(accountsView.plans[2]?.count, 2);
		assert.equal(accountsView.plans[2]?.agents, 32);
		assert.equal(accountsView.plans[2]?.pct, 22);
		assert.equal(accountsView.avgAgents, "7.3");
		assert.equal(
			accountsView.kpis.some((kpi) => kpi.value === "17" || (kpi.label === "Squads" && kpi.value !== "66")),
			false,
		);
		const filtered = accountAdminView(accounts, "Trial", "northwind");
		assert.equal(filtered.kpis[2]?.value, "66");
		assert.equal(filtered.rows.length, 0);
		const imagesView = imageCatalogView(images, "all", INITIAL_IMAGE);
		assert.equal(imagesView.kpis[0]?.delta, "3 stable · 2 beta or draft");
		assert.equal(imagesView.kpis[1]?.value, "127");
		assert.equal(imagesView.kpis[1]?.delta, "16 behind the latest version");
		assert.equal(imagesView.kpis[2]?.delta, "2 high severity");
		assert.equal(imagesView.kpis[3]?.delta, "3 in progress");
		assert.equal(imagesView.kpis[4]?.value, "4");
		assert.equal(imagesView.kpis[4]?.delta, "of 7 images");
		assert.equal(imagesView.attention, 2);
		assert.equal(imagesView.count, "7 of 7");
		assert.equal(imagesView.detail.id, "support");
		assert.equal(imagesView.detail.onLatest, "22 of 34 (65%)");
		const people = imageCatalogView(images, "all", "hr");
		assert.equal(people.detail.onLatest, "Not deployed yet");
		const marketing = imageCatalogView(images, "Needs attention", "marketing");
		assert.equal(marketing.detail.noBugs, true);
		assert.equal(marketing.kpis[0]?.value, "7");
		assert.equal(
			marketing.rows.some((row) => row.id === "marketing"),
			false,
		);
	} finally {
		await opened.close();
	}
});

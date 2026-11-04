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
		const companies = kpiAt(accountsView.kpis, 0);
		const paying = kpiAt(accountsView.kpis, 1);
		const squads = kpiAt(accountsView.kpis, 2);
		const tasks = kpiAt(accountsView.kpis, 3);
		const mrr = kpiAt(accountsView.kpis, 4);
		const ltv = kpiAt(accountsView.kpis, 5);
		assert.equal(companies.value, "9");
		assert.equal(companies.delta, "+1 in the last 2 weeks");
		assert.equal(paying.value, "6");
		assert.equal(paying.delta, "2 on trial · 1 paused");
		assert.equal(squads.value, "66");
		assert.equal(squads.delta, "53 online right now");
		assert.equal(tasks.value, "4,765");
		assert.equal(mrr.value, "$1,294");
		assert.equal(mrr.delta, "6 paying companies");
		assert.equal(ltv.value, "$14,568");
		assert.equal(ltv.delta, "Avg $2,081 per paying company");
		assert.equal(accountsView.agentsOnline, 53);
		assert.equal(accountsView.shown, "9 of 9");
		assert.deepEqual(
			accountsView.bars.map((bar) => weekCount(bar.title)),
			[0, 0, 0, 1, 0, 1, 0, 1],
		);
		const starter = planAt(accountsView.plans, 0);
		const growth = planAt(accountsView.plans, 1);
		const scale = planAt(accountsView.plans, 2);
		assert.equal(starter.label, "Starter");
		assert.equal(starter.count, 3);
		assert.equal(starter.agents, 7);
		assert.equal(starter.pct, 33);
		assert.equal(growth.count, 4);
		assert.equal(growth.agents, 27);
		assert.equal(growth.pct, 44);
		assert.equal(scale.count, 2);
		assert.equal(scale.agents, 32);
		assert.equal(scale.pct, 22);
		assert.equal(accountsView.avgAgents, "7.3");
		assert.equal(storesSquadTotal(accountsView.kpis), false);
		const filtered = accountAdminView(accounts, "Trial", "northwind");
		assert.equal(kpiAt(filtered.kpis, 2).value, "66");
		assert.equal(filtered.rows.length, 0);
		const imagesView = imageCatalogView(images, "all", INITIAL_IMAGE);
		assert.equal(kpiAt(imagesView.kpis, 0).delta, "3 stable · 2 beta or draft");
		assert.equal(kpiAt(imagesView.kpis, 1).value, "127");
		assert.equal(kpiAt(imagesView.kpis, 1).delta, "16 behind the latest version");
		assert.equal(kpiAt(imagesView.kpis, 2).delta, "2 high severity");
		assert.equal(kpiAt(imagesView.kpis, 3).delta, "3 in progress");
		assert.equal(kpiAt(imagesView.kpis, 4).value, "4");
		assert.equal(kpiAt(imagesView.kpis, 4).delta, "of 7 images");
		assert.equal(imagesView.attention, 2);
		assert.equal(imagesView.count, "7 of 7");
		assert.equal(imagesView.detail.id, "support");
		assert.equal(imagesView.detail.onLatest, "22 of 34 (65%)");
		const people = imageCatalogView(images, "all", "hr");
		assert.equal(people.detail.onLatest, "Not deployed yet");
		const marketing = imageCatalogView(images, "Needs attention", "marketing");
		assert.equal(marketing.detail.noBugs, true);
		assert.equal(kpiAt(marketing.kpis, 0).value, "7");
		assert.equal(hasRow(marketing.rows, "marketing"), false);
	} finally {
		await opened.close();
	}
});

function kpiAt<T>(rows: readonly T[], index: number): T {
	const row = rows[index];
	if (row === undefined) throw new Error(`Missing row ${index}.`);
	return row;
}

function planAt<T>(rows: readonly T[], index: number): T {
	return kpiAt(rows, index);
}

function weekCount(title: string): number {
	const matched = /: (\d+)/.exec(title);
	if (!matched) return 0;
	return counted(matched[1]);
}

function counted(value: string | undefined): number {
	if (value === undefined) return 0;
	return Number(value);
}

function storesSquadTotal(kpis: readonly { value: string; label: string }[]): boolean {
	return kpis.some((kpi) => squadTotal(kpi));
}

function squadTotal(kpi: { value: string; label: string }): boolean {
	if (kpi.value === "17") return true;
	return kpi.label === "Squads" && kpi.value !== "66";
}

function hasRow(rows: readonly { id: string }[], id: string): boolean {
	return rows.some((row) => row.id === id);
}

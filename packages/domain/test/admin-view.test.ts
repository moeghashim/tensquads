import assert from "node:assert/strict";
import test from "node:test";
import type { Account, AgentImage } from "../src/index.ts";
import {
	accountAdminView,
	companyInitials,
	imageCatalogView,
	MISSION_MISSING,
	NO_OPEN_BUGS,
	NOTHING_REQUESTED,
	onLatestLine,
	updatedThisWeek,
	weekCounts,
} from "../src/index.ts";

const harbor: Account = {
	id: "harbor",
	name: "Harbor & Co",
	owner: "Ada Lovelace",
	email: "ada@harbor.test",
	plan: "Starter",
	tint: "#e7efff",
	squads: ["Cafe"],
	agents: 1,
	online: 0,
	tasks: 3,
	lastActive: "Just now",
	status: "Paused",
	createdWeek: -1,
	started: "1 Jan 2026",
	mrr: 0,
	ltv: 0,
	mission: "",
};

test("search, filters, and week bars follow the design formulas", () => {
	const view = accountAdminView([harbor], "all", "  ADA@Harbor  ");
	assert.equal(view.rows.length, 1);
	assert.equal(view.rows[0]?.mission, MISSION_MISSING);
	assert.equal(view.rows[0]?.initials, "HC");
	assert.equal(view.rows[0]?.ltvDisplay, "—");
	assert.equal(view.rows[0]?.onlineColor, "#8f8f8f");
	assert.equal(view.kpis[0]?.value, "1");
	assert.equal(view.kpis[3]?.value, "3");
	assert.equal(view.kpis[3]?.delta, "+9% vs last week");
	assert.deepEqual(weekCounts([harbor]), [0, 0, 0, 0, 0, 0, 0, 0]);
	assert.equal(view.bars[0]?.title, "Week of Sep 7: 0 companies");
	assert.equal(companyInitials("Maple & Co Books"), "MC");
	const paused = accountAdminView([harbor], "Active", "");
	assert.equal(paused.empty, true);
	assert.equal(paused.rows.length, 0);
	assert.equal(paused.kpis[0]?.value, "1");
	assert.equal(accountAdminView([harbor], "Paused", "missing").empty, true);
});

test("an image with no requests says nothing was requested", () => {
	const image: AgentImage = {
		id: "quiet",
		name: "Quiet",
		role: "Unused",
		tint: "#fff",
		tag: "quiet:1",
		version: "1.0.0",
		nextVersion: "1.0.1",
		updated: "9 days ago",
		updatedFull: "9 days ago",
		deployed: 0,
		onLatest: 0,
		status: "Draft",
		bugs: [],
		features: [],
	};
	const view = imageCatalogView([image], "features", "quiet");
	assert.equal(view.rows.length, 0);
	assert.equal(view.count, "0 of 1");
	assert.equal(view.kpis[0]?.value, "1");
	assert.equal(view.detail.noFeatures, true);
	assert.equal(view.detail.noBugs, true);
	assert.equal(view.detail.onLatest, "Not deployed yet");
	assert.equal(NOTHING_REQUESTED, "Nothing requested yet.");
	assert.equal(NO_OPEN_BUGS, "No open bugs on this version.");
	assert.equal(updatedThisWeek("3 days ago"), true);
	assert.equal(updatedThisWeek("9 days ago"), false);
	assert.equal(updatedThisWeek("2h ago"), true);
	assert.equal(onLatestLine(34, 22), "22 of 34 (65%)");
	const hidden = imageCatalogView([image], "all", "missing");
	assert.equal(hidden.detail.id, "quiet");
});

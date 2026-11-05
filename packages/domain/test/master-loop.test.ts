import assert from "node:assert/strict";
import test from "node:test";

import { digestOf, type ResearchReport } from "@tensquads/agent-kit";

import type { BusEvent } from "../src/bus/types.ts";
import { createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { PageReader } from "../src/master/types.ts";

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function result(skill: string, payload: Readonly<Record<string, unknown>>): BusEvent {
	return {
		id: `in-${skill}`,
		time: "12:00",
		from: skill === "report.write" ? "market" : "website",
		to: "master",
		kind: "Result",
		skill,
		text: skill,
		payload,
		writes: [],
		trace: "tr_in",
	};
}

function ports(story: Awaited<ReturnType<typeof proofStory>>, brief = story.brief, audit = story.audit) {
	return {
		readPage: reader(story.pages),
		audit: () => audit,
		model: { writeBrief: () => brief },
		accountSlug: "proof",
	};
}

test("a passing report asks for the brief, then the page, then publish", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	const first = master.start();
	assert.equal(first.text, "Research this business.");
	assert.equal(first.to, "market");
	const asked = await master.accept(
		result("report.write", { report: story.report, sources: story.report.sources, evidence: [story.report.gap] }),
	);
	assert.equal(asked.length, 1);
	assert.equal(asked[0]?.skill, "brief.write");
	assert.equal(asked[0]?.text, "Build the site with this brief?");
	const yes = await master.approveBrief();
	assert.equal(yes[0]?.text, "The user said yes.");
	assert.equal(yes[1]?.text.includes(story.report.gap), true);
	assert.equal(yes[1]?.text.includes(story.report.gapEvidence.sourceUrl), true);
	const build = yes[0]?.payload.approval as { skill: string; mandate: { subject: string } };
	assert.equal(build.skill, "site.build");
	assert.equal(build.mandate.subject, await digestOf(story.brief));
	const preview = await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	assert.equal(preview[0]?.text, "Publish the site?");
	const publish = await master.approvePublish();
	const gate = publish[0]?.payload.approval as { skill: string; mandate: { subject: string } };
	assert.equal(gate.skill, "site.publish");
	assert.equal(gate.mandate.subject, await digestOf(story.pageHtml));
	const done = await master.accept(
		result("site.publish", { previewUrl: story.previewUrl, publishedUrl: story.publishedUrl }),
	);
	assert.equal(done.length, 0);
});

test("a failed research check goes back once, then escalates", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	master.start();
	const short: ResearchReport = { ...story.report, competitors: story.report.competitors.slice(0, 2) };
	const first = await master.accept(result("report.write", { report: short }));
	assert.equal(first[0]?.to, "market");
	assert.equal(first[0]?.kind, "Task");
	assert.equal(first[0]?.skill, "task.route");
	const second = await master.accept(result("report.write", { report: short }));
	assert.equal(second[0]?.kind, "Escalation");
	assert.equal(second[0]?.text, "The check failed twice.");
	assert.equal(second[0]?.skill, "check.run");
});

test("a failed brief escalates and does not send the research back", async () => {
	const story = await proofStory();
	const long = `${"word ".repeat(150)}${story.report.gap}`;
	const master = createMaster(story.request, ports(story, long));
	master.start();
	const events = await master.accept(result("report.write", { report: story.report }));
	assert.equal(events.length, 1);
	assert.equal(events[0]?.kind, "Escalation");
	assert.equal(events[0]?.text, "The brief check failed.");
	assert.equal(events[0]?.to, "user");
	assert.equal((await master.approveBrief()).length, 0);
});

test("the publish approval hashes the checked preview bytes", async () => {
	const story = await proofStory();
	let reads = 0;
	const bad = "<h1>Injected menu with invented items</h1>";
	const master = createMaster(story.request, {
		readPage: async (url) => {
			if (url === story.previewUrl) {
				reads += 1;
				return { status: 200, body: reads === 1 ? story.pageHtml : bad };
			}
			return story.pages[url] ?? { status: 404, body: "" };
		},
		audit: () => story.audit,
		model: { writeBrief: () => story.brief },
	});
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	const accepted = await master.approvePublish();
	const gate = accepted[0]?.payload.approval as { mandate: { subject: string } };
	assert.equal(gate.mandate.subject, await digestOf(story.pageHtml));
	assert.equal(accepted[0]?.payload.pageHtml, story.pageHtml);
	assert.equal(reads, 1);
});

test("the publish approval also sends a task to the website agent", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	const events = await master.approvePublish();
	assert.equal(events[0]?.kind, "Approval");
	assert.equal(events[1]?.kind, "Task");
	assert.equal(events[1]?.to, "website");
	assert.equal(events[1]?.skill, "task.route");
	const carried = events[1]?.payload.approval as { skill: string; mandate: { subject: string } };
	assert.equal(carried.skill, "site.publish");
	assert.equal(carried.mandate.subject, await digestOf(story.pageHtml));
	assert.equal(events[1]?.payload.pageHtml, story.pageHtml);
});

test("the master records a monitor on the account that created it", async () => {
	const story = await proofStory();
	const seen: string[] = [];
	const master = createMaster(story.request, {
		...ports(story),
		recordMonitor: (monitorId: string) => {
			seen.push(monitorId);
		},
	});
	await master.createMonitor("monitor-a");
	assert.deepEqual(seen, ["monitor-a"]);
});

test("a failed page check goes back to the website once, then escalates", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story, story.brief, { ...story.audit, p0: 1 }));
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	const first = await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	assert.equal(first[0]?.to, "website");
	assert.equal(first[0]?.kind, "Task");
	const second = await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	assert.equal(second[0]?.kind, "Escalation");
	assert.equal(second[0]?.text, "The check failed twice.");
});

test("a user approval of the brief and of publish sends the website task", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	const briefYes = await master.accept({
		id: "user-brief",
		time: "12:01",
		from: "user",
		to: "master",
		kind: "Approval",
		skill: "brief.write",
		text: "Yes",
		payload: {},
		writes: [],
		trace: "tr_user_brief",
	});
	assert.equal(briefYes[0]?.kind, "Approval");
	assert.equal(briefYes[1]?.kind, "Task");
	assert.equal(briefYes[1]?.skill, "task.route");
	await master.accept(result("site.preview", { previewUrl: story.previewUrl }));
	const publishYes = await master.accept({
		id: "user-publish",
		time: "12:02",
		from: "user",
		to: "master",
		kind: "Approval",
		skill: "approval.ask",
		text: "Yes",
		payload: {},
		writes: [],
		trace: "tr_user_publish",
	});
	assert.equal(publishYes[0]?.kind, "Approval");
	assert.equal(publishYes[1]?.kind, "Task");
	assert.equal(publishYes[1]?.text, "Publish the page.");
});

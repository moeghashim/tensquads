import assert from "node:assert/strict";
import test from "node:test";

import { digestOf, parseWebsiteTask, type ResearchReport } from "@tensquads/agent-kit";

import type { BusEvent } from "../src/bus/types.ts";
import { createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { PageReader } from "../src/master/types.ts";

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function previewResult(story: Awaited<ReturnType<typeof proofStory>>): BusEvent {
	return result("site.preview", { previewUrl: story.previewUrl, choice: story.choice });
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

test("a passing report asks for the brief, then the page, then publish, then the watch", async () => {
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
	const preview = await master.accept(previewResult(story));
	assert.equal(preview[0]?.text, "Publish the site?");
	const publish = await master.approvePublish();
	const gate = publish[0]?.payload.approval as { skill: string; mandate: { subject: string } };
	assert.equal(gate.skill, "site.publish");
	assert.equal(gate.mandate.subject, await digestOf(story.pageHtml));
	const done = await master.accept(
		result("site.publish", { previewUrl: story.previewUrl, publishedUrl: story.publishedUrl }),
	);
	assert.equal(done.length, 1);
	assert.equal(done[0]?.skill, "competition.watch");
	assert.equal(done[0]?.text, "Watch the competitors?");
	assert.equal(done[0]?.from, "master");
	assert.equal(done[0]?.to, "user");
	assert.equal(master.snapshot().phase, "watch");
	assert.equal(yes[1]?.payload.slug, "proof");
	assert.equal("html" in (yes[1]?.payload ?? {}), false);
	assert.equal("mandate" in (yes[1]?.payload ?? {}), false);
	assert.equal("previewUrl" in (yes[1]?.payload ?? {}), false);
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
		accountSlug: "proof",
	});
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	await master.accept(previewResult(story));
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
	await master.accept(previewResult(story));
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
	const master = createMaster(story.request, ports(story, story.brief, { ...story.audit, horizontalScroll: true }));
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	const first = await master.accept(previewResult(story));
	assert.equal(first[0]?.to, "website");
	assert.equal(first[0]?.kind, "Task");
	const second = await master.accept(previewResult(story));
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
	await master.accept(previewResult(story));
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
	const parsed = parseWebsiteTask(publishYes[1]?.payload);
	assert.equal(parsed.kind, "publish");
	if (parsed.kind !== "publish") return;
	assert.deepEqual(parsed.mandate, parsed.approval.mandate);
	assert.equal(parsed.slug, "proof");
	assert.equal(parsed.html, story.pageHtml);
	assert.equal(parsed.previewUrl, story.previewUrl);
	assert.equal(parsed.businessName, story.request.businessName);
	assert.equal(parsed.businessType, story.request.businessType);
});

function marketResult(skill: string, payload: Readonly<Record<string, unknown>>): BusEvent {
	return {
		id: `in-${skill}`,
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill,
		text: skill,
		payload,
		writes: [],
		trace: "tr_in",
	};
}

function userYes(skill: string): BusEvent {
	return {
		id: `user-${skill}`,
		time: "12:03",
		from: "user",
		to: "master",
		kind: "Approval",
		skill,
		text: "Yes",
		payload: {},
		writes: [],
		trace: `tr_user_${skill}`,
	};
}

test("the live sequence keeps the thirteen events in order", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	const transcript: BusEvent[] = [];
	const started = master.start();
	transcript.push(started);
	assert.deepEqual(started.writes, ["business"]);
	assert.deepEqual(started.set, { business: story.request });
	for (const skill of ["web.search", "maps.competitors", "scrapling.read_page", "market.analyse"]) {
		const event = marketResult(skill, { skill });
		transcript.push(event);
		assert.deepEqual(await master.accept(event), []);
	}
	const report = marketResult("report.write", {
		report: story.report,
		sources: story.report.sources,
		evidence: [story.report.gap],
	});
	transcript.push(report);
	transcript.push(...(await master.accept(report)));
	transcript.push(...(await master.approveBrief()));
	const preview = previewResult(story);
	transcript.push(preview);
	transcript.push(...(await master.accept(preview)));
	transcript.push(...(await master.approvePublish()));
	const published = result("site.publish", { previewUrl: story.previewUrl, publishedUrl: story.publishedUrl });
	transcript.push(published);
	transcript.push(...(await master.accept(published)));
	const kept = transcript.filter((event) => event.text !== "Publish the page." && event.skill !== "competition.watch");
	assert.deepEqual(
		kept.map((event) => `${event.kind}:${event.from}:${event.to}:${event.skill}`),
		[
			"Task:master:market:task.route",
			"Result:market:master:web.search",
			"Result:market:master:maps.competitors",
			"Result:market:master:scrapling.read_page",
			"Result:market:master:market.analyse",
			"Result:market:master:report.write",
			"Approval:master:user:brief.write",
			"Approval:master:website:approval.ask",
			"Task:master:website:task.route",
			"Result:website:master:site.preview",
			"Approval:master:user:approval.ask",
			"Approval:master:website:approval.ask",
			"Result:website:master:site.publish",
		],
	);
});

test("the publish task parses as a website publish task", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	await master.accept(previewResult(story));
	const events = await master.approvePublish();
	const parsed = parseWebsiteTask(events[1]?.payload);
	assert.equal(parsed.kind, "publish");
	if (parsed.kind !== "publish") return;
	assert.deepEqual(parsed.approval.mandate, parsed.mandate);
	assert.deepEqual(events[1]?.payload.mandate, parsed.mandate);
});

test("a watch result before the user says yes does not run the skill", async () => {
	const story = await proofStory();
	const seen: string[] = [];
	const master = createMaster(story.request, {
		...ports(story),
		recordMonitor: (monitorId: string) => {
			seen.push(monitorId);
		},
	});
	master.start();
	await master.accept(result("report.write", { report: story.report }));
	await master.approveBrief();
	await master.accept(previewResult(story));
	await master.approvePublish();
	const offered = await master.accept(
		result("site.publish", { previewUrl: story.previewUrl, publishedUrl: story.publishedUrl }),
	);
	assert.equal(offered[0]?.payload.mandate, undefined);
	assert.deepEqual(await master.accept(marketResult("competition.watch", { monitorId: "too-soon" })), []);
	assert.deepEqual(seen, []);
	assert.equal(master.snapshot().phase, "watch");
	const sent = await master.accept(userYes("competition.watch"));
	assert.equal(sent[0]?.kind, "Approval");
	assert.equal(sent[0]?.to, "market");
	assert.equal(sent[1]?.kind, "Task");
	assert.equal(sent[1]?.text, "Watch the competitors.");
	const approval = sent[0]?.payload.approval as { mandate: { subject: string } } | undefined;
	const taskApproval = sent[1]?.payload.approval as { mandate: unknown } | undefined;
	assert.ok(approval);
	const subject = await digestOf("Proof Kitchen Levantine restaurant competitors menu prices");
	assert.equal(approval.mandate.subject, subject);
	assert.equal(taskApproval?.mandate, approval.mandate);
	assert.equal(master.snapshot().phase, "watching");
	assert.deepEqual(await master.accept(marketResult("competition.watch", { monitorId: "mon-1" })), []);
	assert.deepEqual(seen, ["mon-1"]);
	assert.equal(master.snapshot().phase, "done");
});

test("an empty monitor id is sent back once and then escalated", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, ports(story));
	master.restore({ phase: "watching", researchFails: 0, pageFails: 0, seq: 4 });
	const first = await master.accept(marketResult("competition.watch", {}));
	assert.equal(first[0]?.kind, "Task");
	assert.equal(first[0]?.to, "market");
	assert.equal(master.snapshot().phase, "watching");
	const second = await master.accept(marketResult("competition.watch", { monitorId: "  " }));
	assert.equal(second[0]?.kind, "Escalation");
	assert.equal(master.snapshot().phase, "escalated");
});

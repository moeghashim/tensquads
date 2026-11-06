import assert from "node:assert/strict";
import test from "node:test";

import { digestOf, parseResearchTask, parseWebsiteTask } from "@tensquads/agent-kit";

import type { BusEvent } from "../src/bus/types.ts";
import { createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { PageReader } from "../src/master/types.ts";

const NOW = "2026-11-05T12:00:00.000Z";
const OWNER = "user_owner";
const ACCOUNT = "acct-proof";

interface GrantQuery {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly ownerId: string;
	readonly now: string;
}

interface StoredGrant {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly saidYes: string;
	readonly saidAt: string;
	readonly expiresAt: string;
}

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function reportEvent(story: Awaited<ReturnType<typeof proofStory>>): BusEvent {
	return {
		id: "in-report",
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "report.write",
		payload: { report: story.report, sources: story.report.sources, evidence: [story.report.gap] },
		writes: [],
		trace: "tr_in",
	};
}

function userYes(skill: string, from = "user"): BusEvent {
	return {
		id: `user-${skill}`,
		time: "12:03",
		from,
		to: "master",
		kind: "Approval",
		skill,
		text: "Yes",
		payload: {},
		writes: [],
		trace: `tr_user_${skill}`,
	};
}

function matching(query: GrantQuery): StoredGrant {
	return {
		accountId: query.accountId,
		taskId: query.taskId,
		skill: query.skill,
		subject: query.subject,
		slug: query.slug,
		saidYes: query.ownerId,
		saidAt: query.now,
		expiresAt: "2026-11-06T12:00:00.000Z",
	};
}

function masterFor(
	story: Awaited<ReturnType<typeof proofStory>>,
	loadGrant: (query: GrantQuery) => StoredGrant | null,
) {
	return createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: { writeBrief: () => story.brief },
		accountSlug: "proof",
		accountId: ACCOUNT,
		ownerId: OWNER,
		now: NOW,
		loadGrant,
	});
}

async function atBrief(loadGrant: (query: GrantQuery) => StoredGrant | null) {
	const story = await proofStory();
	const master = masterFor(story, loadGrant);
	master.start();
	await master.accept(reportEvent(story));
	return { story, master };
}

test("the real owner approval advances and a bad mandate does not", async () => {
	const seen: GrantQuery[] = [];
	const { master } = await atBrief((query) => {
		seen.push(query);
		return matching(query);
	});
	const yes = await master.accept(userYes("brief.write"));
	assert.equal(seen[0]?.accountId, ACCOUNT);
	assert.equal(seen[0]?.skill, "website.build");
	assert.equal(seen[0]?.ownerId, OWNER);
	assert.equal(yes[1]?.kind, "Task");
	assert.equal(master.snapshot().phase, "building");

	const cases: readonly ((query: GrantQuery) => StoredGrant)[] = [
		(query) => ({ ...matching(query), accountId: "other-account" }),
		(query) => ({ ...matching(query), taskId: "other-task" }),
		(query) => ({ ...matching(query), saidYes: "master" }),
		(query) => ({ ...matching(query), saidYes: "user_other" }),
		(query) => ({ ...matching(query), expiresAt: "2026-11-05T11:00:00.000Z" }),
		(query) => ({ ...matching(query), subject: "a".repeat(64) }),
	];
	for (const load of cases) {
		const held = await atBrief(load);
		const refused = await held.master.accept(userYes("brief.write"));
		assert.equal(refused.length, 0);
		assert.equal(held.master.snapshot().phase, "brief");
	}
});

test("a publish mandate for another slug or a changed page does not advance", async () => {
	const story = await proofStory();
	const slug = await atBrief((query) => ({
		...matching(query),
		slug: query.skill === "website.publish" ? "other-slug" : query.slug,
	}));
	await slug.master.accept(userYes("brief.write"));
	await slug.master.accept({
		id: "in-preview",
		time: "12:04",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "site.preview",
		payload: { previewUrl: story.previewUrl, choice: story.choice },
		writes: [],
		trace: "tr_preview",
	});
	const refused = await slug.master.accept(userYes("approval.ask"));
	assert.equal(refused.length, 0);
	assert.equal(slug.master.snapshot().phase, "publish");

	let subject = "";
	const owned = await atBrief((query) => {
		if (query.skill === "website.publish") subject = query.subject;
		return matching(query);
	});
	await owned.master.accept(userYes("brief.write"));
	await owned.master.accept({
		id: "in-preview-ok",
		time: "12:04",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "site.preview",
		payload: { previewUrl: story.previewUrl, choice: story.choice },
		writes: [],
		trace: "tr_preview_ok",
	});
	const accepted = await owned.master.accept(userYes("approval.ask"));
	assert.equal(subject, await digestOf(story.pageHtml));
	assert.equal(accepted[1]?.text, "Publish the page.");
	assert.equal(owned.master.snapshot().phase, "publishing");
});

test("an approval from an agent is ignored", async () => {
	const { master } = await atBrief((query) => matching(query));
	const refused = await master.accept(userYes("brief.write", "website"));
	assert.equal(refused.length, 0);
	assert.equal(master.snapshot().phase, "brief");
});

test("an approval in the wrong phase is ignored", async () => {
	const { master } = await atBrief((query) => matching(query));
	const early = await master.accept(userYes("approval.ask"));
	assert.equal(early.length, 0);
	assert.equal(master.snapshot().phase, "brief");
	await master.accept(userYes("brief.write"));
	const late = await master.accept(userYes("brief.write"));
	assert.equal(late.length, 0);
	assert.equal(master.snapshot().phase, "building");
	const story = await proofStory();
	await master.accept({
		id: "in-preview-phase",
		time: "12:04",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "site.preview",
		payload: { previewUrl: story.previewUrl, choice: story.choice },
		writes: [],
		trace: "tr_preview_phase",
	});
	const published = await master.accept(userYes("approval.ask"));
	assert.equal(published.length > 0, true);
	const again = await master.accept(userYes("approval.ask"));
	assert.equal(again.length, 0);
	assert.equal(master.snapshot().phase, "publishing");
});

test("a failed page check retries the full website task", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => ({ ...story.audit, horizontalScroll: true }),
		model: { writeBrief: () => story.brief },
		accountSlug: "proof",
		now: NOW,
		loadGrant: (query: GrantQuery) => matching(query),
	});
	master.start();
	await master.accept(reportEvent(story));
	await master.accept(userYes("brief.write"));
	const retry = await master.accept({
		id: "in-preview",
		time: "12:04",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "site.preview",
		payload: { previewUrl: story.previewUrl, choice: story.choice },
		writes: [],
		trace: "tr_preview",
	});
	const pageRetry = retry[0];
	assert.ok(pageRetry);
	assert.equal(pageRetry.kind, "Task");
	const parsed = parseWebsiteTask(pageRetry.payload);
	assert.equal(parsed.kind, "build");
	assert.equal(parsed.slug, "proof");
	const pageEvidence = pageRetry.payload.evidence;
	assert.equal(Array.isArray(pageEvidence) && pageEvidence.length > 0, true);
});

test("a failed research check retries the full research task", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: { writeBrief: () => story.brief },
		accountSlug: "proof",
	});
	master.start();
	const short = { ...story.report, competitors: story.report.competitors.slice(0, 2) };
	const retry = await master.accept({
		id: "in-short",
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "report.write",
		payload: { report: short },
		writes: [],
		trace: "tr_short",
	});
	const researchRetry = retry[0];
	assert.ok(researchRetry);
	assert.equal(researchRetry.to, "market");
	const parsed = parseResearchTask(researchRetry.payload);
	assert.equal(parsed.businessName, story.request.businessName);
	assert.equal(parsed.items.length, story.request.items.length);
	const researchEvidence = researchRetry.payload.evidence;
	assert.equal(
		Array.isArray(researchEvidence) && researchEvidence.includes("The report needs three competitors."),
		true,
	);
});

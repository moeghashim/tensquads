import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { BusEvent } from "../src/bus/types.ts";
import { renderItemSection, shownBrief } from "../src/master/checks.ts";
import { type BriefInput, createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { BusinessRequest, PageReader } from "../src/master/types.ts";

const NO_ITEMS = "The business has no items to show.";
const NO_FINDING = "The research has no finding to show.";
const NO_NAME = "The business has no name to show.";
const REFUSED = "The brief did not pass its check.";

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function reportEvent(report: unknown): BusEvent {
	return {
		id: "ground-report",
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "report.write",
		payload: { report },
		writes: [],
		trace: "tr_ground",
	};
}

function sha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

// A fake model that returns the queued replies in order, then the last one.
function model(replies: readonly string[]) {
	const calls: BriefInput[] = [];
	let next = 0;
	return {
		calls,
		writeBrief(input: BriefInput): string {
			calls.push(input);
			const reply = replies[Math.min(next, replies.length - 1)] ?? "";
			next += 1;
			return reply;
		},
	};
}

test("the approval text is the prose, a blank line, Menu:, then the stored menu", async () => {
	const story = await proofStory();
	const fake = model([story.prose]);
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: fake,
	});
	const asked = await master.accept(reportEvent(story.report));
	const approval = asked[0];
	assert.ok(approval);
	assert.equal(approval.kind, "Approval");
	const shown = (approval.payload.brief as { text: string }).text;
	assert.equal(shown, `${story.prose}\n\nMenu:\n${renderItemSection(story.request.items)}`);
	assert.equal(shown, shownBrief(story.prose, story.request.items));
	assert.equal(approval.payload.subject, sha256(shown));
});

test("an empty business name stops with its message and never calls the model", async () => {
	const story = await proofStory();
	const cases: readonly BusinessRequest[] = [
		{ ...story.request, businessName: "" },
		{ ...story.request, businessName: "   " },
	];
	for (const request of cases) {
		const fake = model([story.prose]);
		const master = createMaster(request, {
			readPage: reader(story.pages),
			audit: () => story.audit,
			model: fake,
		});
		const events = await master.accept(reportEvent(story.report));
		assert.equal(
			events.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(events[0]?.text, NO_NAME);
		assert.equal(master.snapshot().phase, "escalated");
		assert.equal(fake.calls.length, 0);
	}
});

test("an empty item list stops with its message and never calls the model", async () => {
	const story = await proofStory();
	const fake = model([story.prose]);
	const master = createMaster(
		{ ...story.request, items: [] },
		{
			readPage: reader(story.pages),
			audit: () => story.audit,
			model: fake,
		},
	);
	const events = await master.accept(reportEvent(story.report));
	assert.equal(
		events.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(events[0]?.text, NO_ITEMS);
	assert.equal(fake.calls.length, 0);
});

test("an empty research finding stops with its message and never calls the model", async () => {
	const story = await proofStory();
	const fake = model([story.prose]);
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: fake,
	});
	const events = await master.accept(reportEvent({ ...story.report, gap: "   " }));
	assert.equal(events.length, 1);
	assert.equal(events[0]?.kind, "Escalation");
	assert.equal(events[0]?.text, NO_FINDING);
	assert.equal(fake.calls.length, 0);
});

test("a refused brief is retried with the reason, and two refusals stop with no approval", async () => {
	const story = await proofStory();
	const bad = `${story.report.gap} Lobster costs 999.`;
	const failing = model([bad]);
	const stopped = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: failing,
	});
	const events = await stopped.accept(reportEvent(story.report));
	assert.equal(
		events.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(events[0]?.kind, "Escalation");
	assert.equal(events[0]?.text, REFUSED);
	assert.equal(failing.calls.length, 2);
	assert.equal(failing.calls[1]?.reason?.includes("number"), true);
	const passing = model([bad, story.prose]);
	const retried = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: passing,
	});
	const approved = await retried.accept(reportEvent(story.report));
	assert.equal(approved[0]?.kind, "Approval");
	assert.equal(passing.calls.length, 2);
});

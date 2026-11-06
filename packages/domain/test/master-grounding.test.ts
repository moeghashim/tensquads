import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { BusEvent } from "../src/bus/types.ts";
import { renderItemSection } from "../src/master/checks.ts";
import { createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { BusinessRequest, PageReader } from "../src/master/types.ts";

const NO_ITEMS = "The business has no items to show.";
const NO_FINDING = "The research has no finding to show.";

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

function briefOf(event: BusEvent | undefined): string {
	const brief = event?.payload.brief;
	assert.equal(brief !== null && typeof brief === "object", true);
	const text = (brief as { text?: unknown }).text;
	assert.equal(typeof text, "string");
	return text as string;
}

// The brief must equal this template, byte for byte. Each line is built from the stored business and report.
function expectedBrief(
	request: BusinessRequest,
	report: { gap: string; gapEvidence: { sourceUrl: string }; sources: readonly string[] },
): string {
	return [
		`Business: ${request.businessName}`,
		`Type: ${request.businessType}`,
		"",
		"What the research found:",
		`${report.gap} ${report.gapEvidence.sourceUrl}`,
		"",
		"Sources:",
		...report.sources,
		"",
		"Menu:",
		renderItemSection(request.items),
	].join("\n");
}

function sha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

test("the brief text is the code template, byte for byte, and the approval subject is its sha256", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const asked = await master.accept(reportEvent(story.report));
	const approval = asked[0];
	assert.equal(approval?.kind, "Approval");
	const brief = briefOf(approval);
	assert.equal(brief, expectedBrief(story.request, story.report));
	assert.equal(approval?.payload.subject, sha256(brief));
});

test("an empty business or an empty item list never reaches an approval", async () => {
	const story = await proofStory();
	const cases: readonly BusinessRequest[] = [
		{ ...story.request, businessName: "" },
		{ ...story.request, businessName: "   " },
		{ ...story.request, items: [] },
	];
	for (const request of cases) {
		const master = createMaster(request, {
			readPage: reader(story.pages),
			audit: () => story.audit,
		});
		const events = await master.accept(reportEvent(story.report));
		assert.equal(
			events.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(events[0]?.text, NO_ITEMS);
		assert.equal(master.snapshot().phase, "escalated");
	}
});

test("an empty research finding stops with a chat message and never reaches an approval", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const events = await master.accept(reportEvent({ ...story.report, gap: "   " }));
	assert.equal(
		events.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(events.length, 1);
	assert.equal(events[0]?.kind, "Escalation");
	assert.equal(events[0]?.text, NO_FINDING);
	assert.equal(master.snapshot().phase, "escalated");
});

test("the rendered section shows each stored item and its stored price", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const brief = briefOf((await master.accept(reportEvent(story.report)))[0]);
	for (const item of story.request.items) {
		assert.equal(brief.includes(`${item.name}: ${item.price}`), true);
	}
	const priced: BusinessRequest = {
		...story.request,
		items: [{ name: "Plate", price: "12.00", section: "Mains" }],
	};
	const second = createMaster(priced, {
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const shown = briefOf((await second.accept(reportEvent(story.report)))[0]);
	assert.equal(shown.includes("Plate: 12.00"), true);
	assert.equal(shown.includes("Plate: $12"), false);
});

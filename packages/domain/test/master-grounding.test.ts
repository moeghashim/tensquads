import assert from "node:assert/strict";
import test from "node:test";

import type { BusEvent } from "../src/bus/types.ts";
import { checkBrief } from "../src/master/checks.ts";
import { createMaster } from "../src/master/loop.ts";
import { proofStory } from "../src/master/proof.ts";
import type { BusinessRequest, PageReader } from "../src/master/types.ts";

const PROSE = "Proof Kitchen serves Levantine food. Competitors list a salad price. The menu hides salad prices.";
const NO_ITEMS = "The business has no items to show.";

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function report(story: Awaited<ReturnType<typeof proofStory>>): BusEvent {
	return {
		id: "ground-report",
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "report.write",
		payload: { report: story.report },
		writes: [],
		trace: "tr_ground",
	};
}

function briefText(event: BusEvent | undefined): string {
	const brief = event?.payload.brief;
	assert.equal(brief !== null && typeof brief === "object", true);
	const text = (brief as { text?: unknown }).text;
	assert.equal(typeof text, "string");
	return text as string;
}

test("the prose check refuses a price, an offer, and an owner item", async () => {
	const story = await proofStory();
	const grounding = {
		businessName: story.request.businessName,
		cuisine: story.request.cuisine,
		items: story.request.items,
	};
	const gap = story.report.gap;
	const price = checkBrief(`${gap} A plate is 12.00.`, story.report, grounding);
	assert.equal(price.pass, false);
	assert.equal(price.evidence.includes("The brief names a price."), true);
	const percent = checkBrief(`${gap} Ask for 20% off.`, story.report, grounding);
	assert.equal(percent.pass, false);
	assert.equal(percent.evidence.includes("The brief adds an offer."), true);
	const bogo = checkBrief(`${gap} The board says BOGO.`, story.report, grounding);
	assert.equal(bogo.pass, false);
	assert.equal(bogo.evidence.includes("The brief adds an offer."), true);
	const tawook = checkBrief(`${gap} Chicken tawook at 999.`, story.report, grounding);
	assert.equal(tawook.pass, false);
	assert.equal(tawook.evidence.includes("The brief names an item."), true);
	const fattoush = checkBrief(`${gap} Chicken Fattoush.`, story.report, grounding);
	assert.equal(fattoush.pass, false);
	assert.equal(fattoush.evidence.includes("The brief names an item."), true);
	const lobster = checkBrief(`${gap} Sell lobster for $999 and offer free delivery.`, story.report, grounding);
	assert.equal(lobster.pass, false);
	assert.equal(checkBrief(PROSE, story.report, grounding).pass, true);
});

test("an empty business or an empty item list never reaches an approval", async () => {
	const story = await proofStory();
	const cases: readonly BusinessRequest[] = [
		{ ...story.request, businessName: "" },
		{ ...story.request, businessName: "   " },
		{ ...story.request, items: [] },
	];
	for (const request of cases) {
		let calls = 0;
		const master = createMaster(request, {
			readPage: reader(story.pages),
			audit: () => story.audit,
			model: {
				writeBrief: () => {
					calls += 1;
					return PROSE;
				},
			},
		});
		const events = await master.accept(report(story));
		assert.equal(
			events.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(events[0]?.text, NO_ITEMS);
		assert.equal(master.snapshot().phase, "escalated");
		assert.equal(calls, 0);
	}
});

test("the rendered section shows each stored item and its stored price", async () => {
	const story = await proofStory();
	const master = createMaster(story.request, {
		readPage: reader(story.pages),
		audit: () => story.audit,
		model: { writeBrief: () => PROSE },
	});
	const asked = await master.accept(report(story));
	const brief = briefText(asked[0]);
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
		model: { writeBrief: () => PROSE },
	});
	const shown = briefText((await second.accept(report(story)))[0]);
	assert.equal(shown.includes("Plate: 12.00"), true);
	assert.equal(shown.includes("Plate: $12"), false);
});

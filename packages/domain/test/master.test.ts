import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@tensquads/agent-kit";

import { checkBrief, checkPage, checkPublished, checkResearch, wordCount } from "../src/master/checks.ts";
import { proofStory } from "../src/master/proof.ts";
import type { PageReader } from "../src/master/types.ts";

function reader(pages: Record<string, { status: number; body: string }>): PageReader {
	return async (url) => pages[url] ?? { status: 404, body: "" };
}

function mandateOf(payload: Readonly<Record<string, unknown>>) {
	const approval = payload.approval;
	assert.equal(approval !== null && typeof approval === "object", true);
	const mandate = (approval as { mandate?: { subject?: string; at?: string; skill?: string } }).mandate;
	const skill = (approval as { skill?: string }).skill;
	assert.equal(typeof mandate?.subject, "string");
	return { skill, subject: mandate?.subject ?? "", at: mandate?.at ?? "" };
}

test("the thirteen events stay in order and cite the gap", async () => {
	const story = await proofStory();
	assert.equal(story.events.length, 13);
	const skills = story.events.map((event) => `${event.kind}:${event.from}:${event.to}:${event.skill}`);
	assert.deepEqual(skills, [
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
	]);
	assert.equal(story.events[0]?.text, "Research this business.");
	assert.equal(story.events[6]?.text, "Build the site with this brief?");
	assert.equal(story.events[7]?.text, "The user said yes.");
	assert.equal(story.events[8]?.text.includes(story.report.gap), true);
	assert.equal(story.events[8]?.text.includes(story.report.gapEvidence.sourceUrl), true);
	assert.equal(story.events[10]?.text, "Publish the site?");
	assert.equal(story.events[11]?.text, "The user said yes.");
	assert.equal(wordCount(story.brief) < 150, true);
	assert.equal(story.brief.includes(story.report.gap), true);
	const build = mandateOf(story.events[7]?.payload ?? {});
	const task = mandateOf(story.events[8]?.payload ?? {});
	const publish = mandateOf(story.events[11]?.payload ?? {});
	assert.equal(build.skill, "site.build");
	assert.equal(task.skill, "site.build");
	assert.equal(publish.skill, "site.publish");
	assert.equal(build.subject, await digestOf(story.brief));
	assert.equal(task.subject, build.subject);
	assert.equal(publish.subject, await digestOf(story.pageHtml));
	assert.equal(new Date(build.at).toISOString(), build.at);
	const research = await checkResearch(story.report, reader(story.pages));
	const brief = checkBrief(story.brief, story.report);
	const page = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const published = await checkPublished(story.pageHtml, story.publishedUrl, reader(story.pages));
	assert.equal(research.pass, true);
	assert.equal(brief.pass, true);
	assert.equal(page.pass, true);
	assert.equal(published.pass, true);
});

test("the research check rejects a short report and a missing citation", async () => {
	const story = await proofStory();
	const read = reader(story.pages);
	const short = await checkResearch({ ...story.report, competitors: story.report.competitors.slice(0, 2) }, read);
	assert.equal(short.pass, false);
	assert.equal(short.evidence.includes("The report needs three competitors."), true);
	const uncited = await checkResearch(
		{ ...story.report, gapEvidence: { sourceUrl: "https://example.com/missing", quote: story.report.gap } },
		read,
	);
	assert.equal(uncited.pass, false);
	assert.equal(uncited.evidence.includes("The report was rejected."), true);
	const offline = await checkResearch(story.report, async () => ({ status: 404, body: "" }));
	assert.equal(offline.pass, false);
	assert.equal(offline.evidence.includes("A competitor URL did not return 200."), true);
});

test("the brief check rejects 150 words and a missing gap", async () => {
	const story = await proofStory();
	const gapWords = story.report.gap.split(/\s+/).length;
	const long = `${Array.from({ length: 150 - gapWords }, () => "word").join(" ")} ${story.report.gap}`;
	assert.equal(wordCount(long), 150);
	assert.equal(checkBrief(long, story.report).pass, false);
	const named = long.split(" ").slice(1).join(" ");
	assert.equal(wordCount(named), 149);
	assert.equal(checkBrief(named, story.report).pass, true);
	assert.equal(checkBrief("A short brief with no finding.", story.report).pass, false);
});

test("the page check rejects an invented item, a broken link, and a P0 finding", async () => {
	const story = await proofStory();
	const invented = story.pageHtml.replace("Fattoush", "Dragon taco");
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: invented } };
	const badItem = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(badItem.pass, false);
	assert.equal(badItem.evidence.includes("The page invents an item."), true);
	assert.equal(badItem.evidence.includes("An item from the list is missing."), true);
	const broken = story.pageHtml.replace("https://example.com/alpha", "https://example.com/missing");
	const brokenPages = { ...story.pages, [story.previewUrl]: { status: 200, body: broken } };
	const badLink = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		readPage: reader(brokenPages),
		audit: () => story.audit,
	});
	assert.equal(badLink.evidence.includes("A link is broken."), true);
	const flagged = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		readPage: reader(story.pages),
		audit: () => ({ ...story.audit, p0: 1, horizontalScroll: true }),
	});
	assert.equal(flagged.evidence.includes("The page has a P0 or P1 finding."), true);
	assert.equal(flagged.evidence.includes("The page scrolls sideways at 390 px."), true);
	const changed = await checkPublished(`${story.pageHtml}<!-- extra -->`, story.publishedUrl, reader(story.pages));
	assert.equal(changed.pass, false);
});

test("a grocer page does not need a cuisine", async () => {
	const story = await proofStory();
	const html = story.pageHtml.replace('<p class="cuisine">Levantine</p>', "");
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: html } };
	const page = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: "grocer",
		items: story.request.items,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(page.pass, true);
	const restaurant = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: "restaurant",
		cuisine: "Levantine",
		items: story.request.items,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(restaurant.pass, false);
});

function pageInput(story: Awaited<ReturnType<typeof proofStory>>, html: string) {
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: html } };
	return {
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		readPage: reader(pages),
		audit: () => story.audit,
	};
}

test("the research check rejects a repeated competitor and a price off its source", async () => {
	const story = await proofStory();
	const read = reader(story.pages);
	const one = story.report.competitors[0];
	assert.ok(one);
	const repeated = await checkResearch({ ...story.report, competitors: [one, one, one] }, read);
	assert.equal(repeated.pass, false);
	assert.equal(repeated.evidence.includes("The report repeats a competitor."), true);
	const cited = story.report.competitors.map((competitor) => ({
		...competitor,
		sourceUrl: story.report.sources[2] ?? competitor.sourceUrl,
	}));
	const wrongPage = await checkResearch({ ...story.report, competitors: cited }, read);
	assert.equal(wrongPage.pass, false);
	assert.equal(wrongPage.evidence.includes("A price or offer is not on the page."), true);
	const foreign = story.report.competitors.map((competitor, index) =>
		index === 0 ? { ...competitor, sourceUrl: "https://other.example/price" } : competitor,
	);
	const pages = {
		...story.pages,
		"https://other.example/price": { status: 200, body: "Alpha plate $12" },
	};
	const otherSite = await checkResearch({ ...story.report, competitors: foreign }, reader(pages));
	assert.equal(otherSite.pass, false);
	assert.equal(otherSite.evidence.includes("The source is not on the competitor site."), true);
});

test("the page check reads the visible menu and resolves relative links", async () => {
	const story = await proofStory();
	const extra = await checkPage(pageInput(story, `${story.pageHtml}<div>Dragon taco — $99</div>`));
	assert.equal(extra.pass, false);
	assert.equal(extra.evidence.includes("The page invents an item."), true);
	const hidden = `<div hidden>${story.pageHtml}</div><h1>Proof Kitchen</h1><p>Levantine</p><p>Chicken tawook $14</p><p>Fattoush</p>`;
	const concealed = await checkPage(pageInput(story, hidden));
	assert.equal(concealed.pass, false);
	assert.equal(concealed.evidence.includes("An item from the list is missing."), true);
	const relative = await checkPage(pageInput(story, `${story.pageHtml}<a href="/does-not-exist">Order</a>`));
	assert.equal(relative.pass, false);
	assert.equal(relative.evidence.includes("A link is broken."), true);
});

test("the published check requires the account site", async () => {
	const story = await proofStory();
	const attacker = await checkPublished(story.pageHtml, "http://attacker.example", async () => ({
		status: 200,
		body: story.pageHtml,
	}));
	assert.equal(attacker.pass, false);
	assert.equal(attacker.evidence.includes("The published URL is not the account site."), true);
});

test("the digest is 64 lowercase hex characters", async () => {
	const empty = await digestOf("");
	assert.equal(empty, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	const digest = await digestOf("Proof Kitchen");
	assert.equal(/^[0-9a-f]{64}$/.test(digest), true);
	assert.notEqual(digest, empty);
});

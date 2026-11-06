import assert from "node:assert/strict";
import test from "node:test";

import { digestOf, parseWebsiteTask, renderPage } from "@tensquads/agent-kit";

import { checkPage, checkPublished, checkResearch } from "../src/master/checks.ts";
import { pageLinks } from "../src/master/hrefs.ts";
import { proofStory } from "../src/master/proof.ts";
import { pageDocument } from "../src/master/render-page.ts";
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

test("the proof page keeps the kit heading rules and the cream note", async () => {
	const story = await proofStory();
	assert.equal(
		story.pageHtml.startsWith(
			"<!-- impeccable-disable cream-palette: the restaurant paper is the warm palette -->\n<!doctype html>",
		),
		true,
	);
	assert.equal(story.pageHtml.includes("h1{font-size:2rem}\nh2{font-size:1.35rem}"), true);
	assert.equal(pageDocument(story.pageHtml), story.pageHtml);
	assert.equal(pageDocument("<p>fragment</p>").startsWith("<!DOCTYPE html>"), true);
});

test("the thirteen events stay in order and cite the gap", async () => {
	const story = await proofStory();
	assert.equal(story.events.length, 13);
	assert.deepEqual(story.choice, { template: "page", palette: "task" });
	assert.equal(story.pageHtml, renderPage(websiteTask(story), story.choice));
	assert.equal(story.pageHtml.includes("<!doctype html>"), true);
	assert.equal(story.pageHtml.includes("Proof Kitchen"), true);
	assert.equal(story.pageHtml.includes("Chicken tawook"), true);
	assert.equal(story.pageHtml.includes("[PRICE]"), true);
	assert.equal(story.pageHtml.includes('class="cuisine"'), true);
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
	const page = await checkPage({
		...pageFields(story),
		previewUrl: story.previewUrl,
		readPage: reader(story.pages),
		audit: () => story.audit,
	});
	const published = await checkPublished(story.pageHtml, story.publishedUrl, reader(story.pages), "proof");
	assert.equal(research.pass, true);
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

test("the page check rejects bytes that are not the kit render, a broken link, and sideways scroll", async () => {
	const story = await proofStory();
	const invented = story.pageHtml.replace("Fattoush", "Dragon taco");
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: invented } };
	const badItem = await checkPage({
		...pageFields(story),
		previewUrl: story.previewUrl,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(badItem.pass, false);
	assert.equal(badItem.evidence.includes("The preview does not match the rendered page."), true);
	const dead = "https://example.com/missing";
	const brokenReport = {
		...story.report,
		sources: [...story.report.sources, dead],
		gapEvidence: { sourceUrl: dead, quote: story.report.gap },
	};
	const brokenHtml = renderPage(websiteTask(story, brokenReport), story.choice);
	const brokenPages = { ...story.pages, [story.previewUrl]: { status: 200, body: brokenHtml } };
	const badLink = await checkPage({
		...pageFields(story),
		report: brokenReport,
		previewUrl: story.previewUrl,
		readPage: reader(brokenPages),
		audit: () => story.audit,
	});
	assert.equal(badLink.evidence.includes("A link is broken."), true);
	assert.equal(badLink.evidence.includes("The preview does not match the rendered page."), false);
	const flagged = await checkPage({
		...pageFields(story),
		previewUrl: story.previewUrl,
		readPage: reader(story.pages),
		audit: () => ({ ...story.audit, horizontalScroll: true }),
	});
	assert.equal(flagged.evidence.includes("The page has a P0 or P1 finding."), false);
	assert.equal(flagged.evidence.includes("The page scrolls sideways at 390 px."), true);
	const changed = await checkPublished(
		`${story.pageHtml}<!-- extra -->`,
		story.publishedUrl,
		reader(story.pages),
		"proof",
	);
	assert.equal(changed.pass, false);
});

test("a grocer page does not need a cuisine", async () => {
	const story = await proofStory();
	const html = renderPage(websiteTask(story, story.report, "grocer"), story.choice);
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: html } };
	const page = await checkPage({
		...pageFields(story),
		businessType: "grocer",
		cuisine: undefined,
		previewUrl: story.previewUrl,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(page.pass, true);
	assert.equal(html.includes('class="cuisine"'), false);
	const restaurant = await checkPage({
		...pageFields(story),
		previewUrl: story.previewUrl,
		readPage: reader(pages),
		audit: () => story.audit,
	});
	assert.equal(restaurant.pass, false);
	assert.equal(restaurant.evidence.includes("The preview does not match the rendered page."), true);
});

type Story = Awaited<ReturnType<typeof proofStory>>;

function websiteTask(story: Story, report = story.report, businessType = story.request.businessType) {
	return parseWebsiteTask({
		businessName: story.request.businessName,
		businessType,
		brief: { text: story.prose, gap: report.gap },
		report,
		gapEvidence: report.gapEvidence,
		items: story.request.items,
		slug: "proof",
		...(businessType === "restaurant" && story.request.cuisine ? { cuisine: story.request.cuisine } : {}),
	});
}

function pageFields(story: Story) {
	return {
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		brief: story.prose,
		report: story.report,
		slug: "proof",
		choice: story.choice,
	};
}

function pageInput(story: Story, html: string, choice: unknown = story.choice) {
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: html } };
	return {
		...pageFields(story),
		choice,
		previewUrl: story.previewUrl,
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

test("the page check requires the kit bytes and resolves relative links", async () => {
	const story = await proofStory();
	const extra = await checkPage(pageInput(story, `${story.pageHtml}<div>Dragon taco — $99</div>`));
	assert.equal(extra.pass, false);
	assert.equal(extra.evidence.includes("The preview does not match the rendered page."), true);
	const hidden = `<div style="opacity:0">${story.pageHtml}</div>`;
	const concealed = await checkPage(pageInput(story, hidden));
	assert.equal(concealed.pass, false);
	assert.equal(concealed.evidence.includes("The preview does not match the rendered page."), true);
	const relative = await checkPage(pageInput(story, `${story.pageHtml}<a href="/does-not-exist">Order</a>`));
	assert.equal(relative.pass, false);
	assert.equal(relative.evidence.includes("A link is broken."), true);
	const saladsFirst = [story.request.items[1], story.request.items[0]].filter((item) => item !== undefined);
	const reordered = renderPage(
		parseWebsiteTask({
			businessName: story.request.businessName,
			businessType: story.request.businessType,
			brief: { text: story.prose, gap: story.report.gap },
			report: story.report,
			gapEvidence: story.report.gapEvidence,
			items: saladsFirst,
			slug: "proof",
			cuisine: story.request.cuisine,
		}),
		story.choice,
	);
	assert.equal(reordered.indexOf(">Salads<") < reordered.indexOf(">Mains<"), true);
});

test("the published check requires the account site", async () => {
	const story = await proofStory();
	const attacker = await checkPublished(
		story.pageHtml,
		"http://attacker.example",
		async () => ({
			status: 200,
			body: story.pageHtml,
		}),
		"proof",
	);
	assert.equal(attacker.pass, false);
	assert.equal(attacker.evidence.includes("The published URL is not the account site."), true);
});

test("the page check compares raw response bytes", async () => {
	const story = await proofStory();
	const raw = Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from(story.pageHtml)]);
	const stripped = await new Response(raw).text();
	const read = async () => ({ status: 200, body: stripped, bytes: raw });
	const preview = await checkPage({
		...pageFields(story),
		previewUrl: story.previewUrl,
		readPage: async (url) => (url === story.previewUrl ? read() : (story.pages[url] ?? { status: 404, body: "" })),
		audit: () => story.audit,
	});
	assert.equal(preview.pass, false);
	assert.equal(preview.evidence.includes("The preview does not match the rendered page."), true);
	const published = await checkPublished(story.pageHtml, story.publishedUrl, read, "proof");
	assert.equal(published.pass, false);
	assert.equal(published.evidence.includes("The published page does not match the preview."), true);
});

test("the page check decodes an href entity before it fetches the link", async () => {
	const story = await proofStory();
	const source = "https://example.com/alpha?a=1&b=2";
	const report = {
		...story.report,
		sources: [...story.report.sources, source],
		gapEvidence: { ...story.report.gapEvidence, sourceUrl: source },
	};
	const html = renderPage(websiteTask(story, report), story.choice);
	const seen: string[] = [];
	const checked = await checkPage({
		...pageFields(story),
		report,
		choice: story.choice,
		previewUrl: story.previewUrl,
		readPage: async (url) => {
			seen.push(url);
			if (url === story.previewUrl) return { status: 200, body: html };
			if (url === source) return { status: 200, body: report.gapEvidence.quote };
			return story.pages[url] ?? { status: 404, body: "" };
		},
		audit: () => story.audit,
	});
	assert.equal(checked.pass, true);
	assert.equal(seen.includes(source), true);
	assert.equal(seen.includes("https://example.com/alpha?a=1&amp;b=2"), false);
});

test("the page check reads unquoted and uppercase links", async () => {
	const story = await proofStory();
	const unquotedHtml = `${story.pageHtml}<a href=/does-not-exist>Order</a>`;
	const upperHtml = `${story.pageHtml}<a HREF="/does-not-exist">Order</a>`;
	assert.equal(pageLinks(unquotedHtml, story.previewUrl).includes("https://preview.example/does-not-exist"), true);
	assert.equal(pageLinks(upperHtml, story.previewUrl).includes("https://preview.example/does-not-exist"), true);
	const unquoted = await checkPage(pageInput(story, unquotedHtml));
	assert.equal(unquoted.pass, false);
	assert.equal(unquoted.evidence.includes("A link is broken."), true);
	const upper = await checkPage(pageInput(story, upperHtml));
	assert.equal(upper.pass, false);
	assert.equal(upper.evidence.includes("A link is broken."), true);
});

test("the research check requires both competitor URLs to return 200", async () => {
	const story = await proofStory();
	const competitors = story.report.competitors.map((competitor, index) => ({
		...competitor,
		url: `https://example.com/missing-${index}`,
	}));
	const result = await checkResearch(
		{ ...story.report, competitors },
		async (url) => story.pages[url] ?? { status: 404, body: "" },
	);
	assert.equal(result.pass, false);
	assert.equal(result.evidence.includes("A competitor URL did not return 200."), true);
});

test("the published URL must be this account site", async () => {
	const story = await proofStory();
	const read = async () => ({ status: 200, body: story.pageHtml });
	const other = await checkPublished(story.pageHtml, "https://another-account.10squads.com", read, "proof");
	assert.equal(other.pass, false);
	assert.equal(other.evidence.includes("The published URL is not the account site."), true);
	const nested = await checkPublished(story.pageHtml, "https://a.b.10squads.com", read, "proof");
	assert.equal(nested.pass, false);
	const same = await checkPublished(story.pageHtml, "https://proof.10squads.com", read, "proof");
	assert.equal(same.pass, true);
});

test("the digest is 64 lowercase hex characters", async () => {
	const empty = await digestOf("");
	assert.equal(empty, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	const digest = await digestOf("Proof Kitchen");
	assert.equal(/^[0-9a-f]{64}$/.test(digest), true);
	assert.notEqual(digest, empty);
});

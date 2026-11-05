import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, saveWorkspace } from "@tensquads/adapters";
import { assembleTiles, BLANK, digestOf, proofStory } from "@tensquads/domain";

import { openPglite } from "../../adapters/test/pglite.ts";
import { proofOfConceptWorkspace } from "../src/proof.ts";
import { workspaceFromDesign } from "../src/workspace.ts";

const proof = { accountId: "proof", mode: "account" } as const;
const platform = { accountId: "platform", mode: "platform" } as const;

test("the design seed does not include the proof account", () => {
	const snapshot = workspaceFromDesign();
	assert.equal(snapshot.accounts.length, 9);
	assert.equal(
		snapshot.accounts.some((entry) => entry.account.id === "proof"),
		false,
	);
	assert.equal(snapshot.images.length, 7);
	assert.equal(
		snapshot.images.some((image) => image.id === "market" || image.id === "website"),
		false,
	);
});

test("the proof snapshot keeps the thirteen events and the blank overview", async () => {
	const story = await proofStory();
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, await proofOfConceptWorkspace());
		const repos = createRepositories(opened.db);
		const totals = await repos.platform.totals(platform);
		assert.equal(totals.accounts, 1);
		assert.equal(totals.agents, 2);
		assert.equal(totals.squads, 2);
		assert.equal(totals.mrr, 0);
		assert.equal(totals.allTime, 0);
		assert.equal(totals.tasksDone, 0);
		assert.equal(totals.images, 2);
		assert.equal(totals.openBugs, 0);
		assert.equal(totals.featuresRequested, 0);
		const agents = await repos.squads.listAgents(proof);
		assert.deepEqual(
			agents.map((agent) => agent.name),
			["Machu", "Angkor"],
		);
		assert.deepEqual(
			agents.map((agent) => agent.role),
			["Market researcher", "Website builder"],
		);
		assert.equal(agents[0]?.secrets.includes("MACHINE_TOKEN_KEY"), false);
		assert.equal(agents[1]?.secrets.includes("MACHINE_TOKEN_KEY"), false);
		assert.equal(
			agents[0]?.skills.some((skill) => skill.id === "competition.watch" && skill.gate === "Ask first"),
			true,
		);
		assert.equal(
			agents[1]?.skills.some((skill) => skill.id === "site.publish" && skill.gate === "Ask first"),
			true,
		);
		const squads = await repos.squads.listSquads(proof);
		assert.equal(squads.length, 2);
		const events = await repos.bus.listEvents(proof);
		assert.deepEqual(
			events.map((event) => event.id),
			story.events.map((event) => event.id),
		);
		assert.equal(events[8]?.text.includes(story.report.gap), true);
		assert.equal(events[8]?.text.includes(story.report.gapEvidence.sourceUrl), true);
		const publish = events[11]?.payload.approval as { mandate: { subject: string } };
		assert.equal(publish.mandate.subject, await digestOf(story.pageHtml));
		const images = await repos.catalog.listImages(proof);
		assert.equal(images.length, 2);
		assert.deepEqual(
			images.map((image) => [image.id, image.version, image.status, image.tag]),
			[
				["market", "0.1.0", "Beta", "registry.agents.co/market:0.1.0"],
				["website", "0.1.0", "Beta", "registry.agents.co/website:0.1.0"],
			],
		);
		const shown = assembleTiles({
			stored: await repos.platform.overviewTiles(proof),
			tasksDone: 0,
			revenue: [],
			saved: [],
		});
		assert.equal(shown[0]?.label, "Revenue");
		assert.equal(shown[0]?.value, BLANK);
		assert.equal(shown[1]?.label, "Orders");
		assert.equal(shown[1]?.value, BLANK);
		const thread = await repos.conversation.thread(proof);
		assert.equal(
			thread?.messages.some((message) => message.text.includes(story.previewUrl)),
			true,
		);
		assert.equal((await repos.policy.inbox(proof)).count, 0);
		assert.equal((await repos.squads.master(proof))?.name, "Petra");
	} finally {
		await opened.close();
	}
});

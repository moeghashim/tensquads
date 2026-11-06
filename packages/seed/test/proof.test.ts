import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, saveWorkspace } from "@tensquads/adapters";
import { digestOf } from "@tensquads/agent-kit";
import { assembleTiles, BLANK } from "@tensquads/domain";
import { proofStory } from "@tensquads/domain/master";

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
		const traffic = await opened.client.query<{
			from_agent: string;
			to_agent: string;
			skill: string;
			seq: number | string;
		}>("SELECT from_agent, to_agent, skill, seq FROM bus_events WHERE account_id = 'proof' ORDER BY id");
		assert.deepEqual(
			traffic.rows.map((row) => [row.from_agent, row.to_agent, row.skill]),
			story.events.map((event) => [event.from, event.to, event.skill]),
		);
		const seqs = traffic.rows.map((row) => Number(row.seq));
		for (let index = 1; index < seqs.length; index += 1) {
			const previous = seqs[index - 1] ?? 0;
			const current = seqs[index] ?? 0;
			assert.equal(current > previous, true);
		}
		assert.deepEqual(
			seqs,
			story.events.map((_, index) => index),
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
			saved: agents.map((agent) => agent.saved),
		});
		assert.equal(shown[0]?.label, "Revenue");
		assert.equal(shown[0]?.value, BLANK);
		assert.equal(shown[1]?.label, "Orders");
		assert.equal(shown[1]?.value, BLANK);
		assert.equal(shown[2]?.value, "$0");
		assert.equal(shown[3]?.value, "0%");
		assert.equal(shown[4]?.value, "0");
		assert.equal(shown[5]?.value, "0h");
		assert.deepEqual(
			shown.filter((tile) => tile.value === BLANK).map((tile) => tile.label),
			["Revenue", "Orders"],
		);
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

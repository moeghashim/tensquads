import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { detailHeading, rewriteBuiltInventory } from "../../e2e/squadmate-copy.ts";

const bundle = await build({
	stdin: {
		contents: `
			import React, { useState } from "react";
			import { createRoot } from "react-dom/client";
			import { WorkspaceContext } from "./apps/web/src/workspace/context.ts";
			import { RouteFaces } from "./apps/web/src/workspace/Squadmate.tsx";
			import { ChatPage } from "./apps/web/src/screens/chat/ChatPage.tsx";
			import { AgentDetailPage } from "./apps/web/src/screens/agent-detail/AgentDetailPage.tsx";
			import { agentDetailView } from "./apps/web/src/screens/agent-detail/model.ts";
			import { squadmateMarkup } from "@tensquads/squadmates";
			import design from "./packages/seed/src/design.json";
			const names = { support: "Kyoto", orders: "Pisa" };
			const events = [
				{ id: "out", from: "support", to: "master", kind: "Result", text: "Reply", time: "10:44" },
				{ id: "in", from: "master", to: "support", kind: "Task", text: "Request", time: "10:43" },
				{ id: "peer", from: "orders", to: "support", kind: "Relay", text: "Relay", time: "10:42" },
			];
			window.expectedFace = (id, on) => {
				const template = document.createElement("template");
				template.innerHTML = squadmateMarkup(id, on ? "idle" : "dropped", 16)
					.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"');
				return template.content.firstChild.outerHTML;
			};
			function Screens() {
				const [on, setOn] = useState(true);
				const frame = { masterName: "Petra", agents: [
					{ id: "support", name: "Kyoto", on },
					{ id: "orders", name: "Pisa", on: !on },
				] };
				const value = { frame, draft: "", setDraft() {}, thinking: false,
					messages: [], submit() {}, startedTask: null, setSelEvent() {} };
				const support = design.seed.agents.find(agent => agent.id === "support");
				const view = agentDetailView({ ...support, on, name: "Kyoto", events: events.slice(0, 2),
					masterName: "Petra", names, companyMission: "Mission",
					storedCpu: support.cpu, storedUptime: support.uptime });
				return <WorkspaceContext value={value}>
					<ChatPage threadId="chat" events={events} />
					<AgentDetailPage view={view} onToggle={() => setOn(!on)} onAgents={() => {}}
						onAsk={() => {}} onSkill={() => {}} onAutonomy={() => {}} onInspect={() => {}} />
					<div id="master-override"><RouteFaces from="master" to="master" masterName="Petra"
						names={names} onFor={() => false} /></div>
				</WorkspaceContext>;
			}
			createRoot(document.getElementById("root")).render(<Screens />);
		`,
		resolveDir: process.cwd(),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	jsx: "automatic",
	plugins: [
		{
			name: "navigation-boundary",
			setup(build) {
				build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({ path: "router", namespace: "boundary" }));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
					contents: "export const useNavigate = () => () => {};",
				}));
			},
		},
	],
});

test("route faces follow current agent state in both directions and keep Petra awake", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setContent('<div id="root"></div>');
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		await expect(page.getByText("Ask Orders for status through Petra", { exact: true })).toBeVisible();
		for (const on of [true, false, true]) {
			await expect(page.getByRole("button", { name: "Squad running", exact: true })).toHaveAttribute(
				"aria-pressed",
				String(on),
			);
			for (const selector of ["[data-loop='chatBus']", "[data-loop='sel.bus']"]) {
				const rows = page.locator(`${selector} button`);
				const routes = selector.includes("chatBus")
					? [
							["support", "master"],
							["master", "support"],
							["orders", "support"],
						]
					: [
							["support", "master"],
							["master", "support"],
						];
				for (const [row, ids] of routes.entries()) {
					for (const [index, id] of ids.entries()) {
						const awake = id === "master" || (id === "support" ? on : !on);
						const expected = await page.evaluate(({ id, awake }) => window.expectedFace(id, awake), {
							id,
							awake,
						});
						assert.equal(
							await rows
								.nth(row)
								.locator("svg")
								.nth(index)
								.evaluate((svg) => svg.outerHTML),
							expected,
						);
					}
				}
			}
			const master = await page.evaluate(() => window.expectedFace("master", true));
			assert.deepEqual(
				await page.locator("#master-override svg").evaluateAll((svgs) => svgs.map((svg) => svg.outerHTML)),
				[master, master],
			);
			await page.getByRole("button", { name: "Squad running", exact: true }).click();
		}
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
});

test("detail inventory rewrites the master phrase in prose without changing other lowercase words", () => {
	const text = "Ask Orders for status through the master";
	const inventory = {
		texts: [text, "Master", "master", "mastery"],
		handlers: [{ tag: "button", event: "onClick", handler: "pick", text }],
		links: [{ href: "/agents/support", text }],
		loops: [],
	};
	const actual = rewriteBuiltInventory(inventory, detailHeading);
	assert.deepEqual(actual.texts, ["Ask Orders for status through Petra", "Petra", "master", "mastery"]);
	assert.equal(actual.handlers[0].text, "Ask Orders for status through Petra");
	assert.equal(actual.links[0].text, "Ask Orders for status through Petra");
	assert.equal(inventory.texts[0], text);
});

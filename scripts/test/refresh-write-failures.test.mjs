import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const bundle = await build({
	stdin: {
		contents: `
			import React, { useState } from "react";
			import { createRoot } from "react-dom/client";
			import design from "./packages/seed/src/design.json";
			import { AgentDetailPage } from "./apps/web/src/screens/agent-detail/AgentDetailPage.tsx";
			import { agentDetailView } from "./apps/web/src/screens/agent-detail/model.ts";
			import { useAgentWrites } from "./apps/web/src/screens/agent-detail/write.ts";
			import { OverviewPage } from "./apps/web/src/screens/overview/page.tsx";
			import { ChatPage } from "./apps/web/src/screens/chat/ChatPage.tsx";
			import { TrafficPage } from "./apps/web/src/screens/traffic/page.tsx";
			import { createSessionRefresh } from "./apps/web/src/session/refresh-controller.ts";
			import { agentSession } from "./apps/web/src/workspace/agent-on.ts";
			import { WorkspaceProvider } from "./apps/web/src/workspace/provider.tsx";
			import { registerTrafficAdvance } from "./apps/web/src/workspace/live.ts";

			window.calls = [];
			window.invalidates = 0;
			window.refreshCounts = { token: 0, reload: 0, signIn: 0 };
			window.router = {
				state: { matches: [] },
				navigate() {},
				invalidate() {
					window.invalidates += 1;
					window.doReload?.();
					return Promise.resolve();
				},
			};
			window.agentMatch = { status: "success" };
			window.refreshControl = createSessionRefresh({
				token: async () => {
					window.refreshCounts.token += 1;
					return "fresh";
				},
				reload: () => {
					window.refreshCounts.reload += 1;
					window.doReload?.();
				},
				signIn: () => {
					window.refreshCounts.signIn += 1;
				},
			});
			window.callWrite = async (data, signal) => {
				const control = window.refreshControl;
				const id = control.begin();
				try {
					return await window.send(data, signal);
				} catch (error) {
					await control.finish(error, "POST", id);
					throw error;
				} finally {
					control.end(id);
				}
			};
			window.send = async (data) => {
				window.calls.push(data);
				throw new Error("The session needs a refresh.");
			};
			window.registerTrafficAdvance = registerTrafficAdvance;

			const support = design.seed.agents.find((agent) => agent.id === "support");
			window.storedAgent = {
				...agentDetailView({
					...support,
					name: "Support",
					on: true,
					events: [{ id: "e1", time: "10:01", kind: "Result", from: "support", to: "master", text: "Stored support reply" }],
					masterName: "Petra",
					companyMission: "Keep customers answered",
					names: { support: "Support" },
					storedCpu: support.cpu,
					storedUptime: support.uptime,
				}),
				accountId: "acct-1",
			};
			window.storedFrame = {
				accountId: "acct-1",
				accountName: "Northwind",
				owner: "Moe",
				masterName: "Petra",
				squadCount: 1,
				superAdmin: false,
				agents: [{ id: "orders", name: "Orders", tint: "#fff", on: true }],
				approvalCount: 2,
				messages: [{ id: "stored", from: "master", text: "Stored answer from Petra" }],
				writeAt: 0,
			};
			window.storedOverview = {
				accountId: "acct-1",
				writeAt: 0,
				greeting: "Good morning, Moe",
				mission: "Answer the inbox",
				online: "1 squad on",
				tiles: [],
				bars: [],
				count: 2,
				empty: false,
				emptyText: "",
				masterName: "Petra",
				agents: [{
					id: "orders", name: "Orders", role: "Orders", tint: "#fff", on: true,
					last: "Packed an order", tasks: 1, success: "100%", saved: "1h",
					mission: "Ship the queue", contribution: 10,
				}],
				approvals: [{
					id: "ap1", agentId: "orders", agentName: "Orders", tint: "#fff",
					amount: "$42", title: "Refund $42", detail: "Customer asked for a refund",
				}],
				proposals: [{
					id: "mp1", agentId: "orders", agentName: "Orders", tint: "#fff",
					title: "Proposed mission", mission: "Ship the queue", chips: [],
					proposed: true, revising: false,
				}],
			};
			window.storedTraffic = {
				accountId: "acct-1",
				masterName: "Petra",
				agents: [{ id: "orders", name: "Orders", host: "vps-orders", tint: "#fff", on: true }],
				store: [],
				events: [
					{ id: "e1", time: "10:01", from: "orders", to: "master", kind: "Task", skill: "shopify.order", text: "Opened the stored carton", payload: {}, writes: [], trace: "t1" },
					{ id: "e2", time: "10:02", from: "orders", to: "master", kind: "Result", skill: "shopify.order", text: "Packed the stored order", payload: {}, writes: [], trace: "t2" },
				],
			};

			function AgentControls({ view, readAt, session }) {
				const writes = useAgentWrites(view, readAt, session, false);
				if (!writes) return <div id="agent-missing">missing</div>;
				return <AgentDetailPage
					view={writes.view}
					onAgents={() => {}}
					onToggle={() => writes.toggleAgent(!writes.view.on)}
					onAsk={() => {}}
					onSkill={() => {}}
					onAutonomy={() => {}}
					onInspect={() => {}}
				/>;
			}

			function Mount({ kind }) {
				const [overview, setOverview] = useState(window.storedOverview);
				const [frame, setFrame] = useState(window.storedFrame);
				const [traffic, setTraffic] = useState(window.storedTraffic);
				const [agent, setAgent] = useState(window.storedAgent);
				window.doReload = () => {
					setOverview({ ...window.storedOverview, writeAt: 0 });
					setFrame({ ...window.storedFrame });
					setTraffic({ ...window.storedTraffic, events: window.storedTraffic.events.slice() });
					setAgent({ ...window.storedAgent });
				};
				if (kind === "overview") {
					return <WorkspaceProvider frame={frame} readAt={{}}><OverviewPage data={overview} /></WorkspaceProvider>;
				}
				if (kind === "chat") {
					return <WorkspaceProvider frame={frame} readAt={{}}><ChatPage threadId="chat" events={[]} /></WorkspaceProvider>;
				}
				if (kind === "traffic") {
					return <WorkspaceProvider frame={frame} readAt={{}}><TrafficPage data={traffic} /></WorkspaceProvider>;
				}
				return <AgentControls view={agent} readAt={0} session={agentSession()} />;
			}

			window.mount = (kind) => {
				window.root = createRoot(document.getElementById("root"));
				window.root.render(<Mount kind={kind} />);
			};
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
			name: "refresh-write-boundary",
			setup(build) {
				build.onResolve({ filter: /^@clerk\/tanstack-react-start$/ }, () => ({
					path: "clerk",
					namespace: "boundary",
				}));
				build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({
					path: "router",
					namespace: "boundary",
				}));
				build.onResolve({ filter: /^#\/server\/(overview|workspace|agent-detail|rules)\.ts$/ }, (args) => ({
					path: args.path,
					namespace: "boundary",
				}));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
					contents: boundary(path),
					loader: "js",
				}));
			},
		},
	],
});

function boundary(path) {
	if (path === "clerk") {
		return `export function useAuth() { return { isLoaded: true, userId: "user-1" }; }`;
	}
	if (path === "router") {
		return `
			export function useRouter() { return window.router; }
			export function useNavigate() {
				return (to) => { window.navigations = [...(window.navigations || []), to]; };
			}
			export function useRouterState(options) {
				const state = window.router.state;
				return options && options.select ? options.select(state) : state;
			}
			export function useMatch() { return window.agentMatch; }
			export function isRedirect(error) {
				return typeof Response !== "undefined" && error instanceof Response && error.status >= 300 && error.status < 400;
			}
		`;
	}
	if (path.endsWith("overview.ts")) {
		return `
			export const decideOverview = ({ data, signal }) => window.callWrite(data, signal);
			export const decideMissionOverview = ({ data, signal }) => window.callWrite(data, signal);
			export const loadOverview = async () => window.storedOverview;
		`;
	}
	if (path.endsWith("workspace.ts")) {
		return `
			export const beginWorkspaceSend = ({ data, signal }) => window.callWrite(data, signal);
			export const finishWorkspaceSend = ({ data, signal }) => window.callWrite(data, signal);
			export const loadWorkspaceFrame = async () => window.storedFrame;
		`;
	}
	if (path.endsWith("agent-detail.ts")) {
		return `
			export const setAgentRunning = ({ data, signal }) => window.callWrite(data, signal);
			export const loadAgentDetail = async () => window.storedAgent;
			export const setAgentAutonomy = () => { throw new Error("unexpected autonomy"); };
			export const setSkillEnabled = () => { throw new Error("unexpected skill"); };
			export const askAgentRevise = () => { throw new Error("unexpected revise"); };
		`;
	}
	return `
		export const setRuleEnabled = () => { throw new Error("unexpected rule"); };
		export const setRuleLimit = () => { throw new Error("unexpected limit"); };
		export const addWorkspaceRule = () => { throw new Error("unexpected add"); };
		export const loadRulesPage = async () => ({});
	`;
}

async function withPage(run) {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setContent('<div id="root"></div>');
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		await run(page);
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
}

async function counts(page) {
	return page.evaluate(() => ({
		refresh: window.refreshCounts,
		calls: window.calls.length,
		invalidates: window.invalidates,
	}));
}

test("overview keeps the stored approval when the decision needs a refresh", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount("overview"));
		const inbox = page.getByRole("region", { name: "Needs you" });
		await expect(inbox.getByText("Refund $42", { exact: true })).toBeVisible();
		await expect(inbox.getByText("2", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Approve", exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.refreshCounts.reload)).toBe(1);
		await expect(inbox.getByText("Refund $42", { exact: true })).toBeVisible();
		await expect(inbox.getByText("Proposed mission", { exact: true })).toBeVisible();
		await expect(inbox.getByText("2", { exact: true })).toBeVisible();
		await expect(page.getByText("Refund $42 (approved)", { exact: true })).toHaveCount(0);
		const seen = await counts(page);
		assert.deepEqual(seen.refresh, { token: 1, reload: 1, signIn: 0 });
		assert.equal(seen.calls, 1);
		assert.equal(seen.invalidates, 1);
	});
});

test("the agent dashboard keeps the stored running control when the write needs a refresh", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount("agent"));
		const toggle = page.getByRole("button", { name: "Squad running", exact: true });
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByText("Running", { exact: true })).toBeVisible();
		await toggle.click();
		await expect.poll(() => page.evaluate(() => window.refreshCounts.reload)).toBe(1);
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByText("Running", { exact: true })).toBeVisible();
		await expect(page.getByText("Paused", { exact: true })).toHaveCount(0);
		await expect(page.locator("#agent-missing")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Support squad" })).toBeVisible();
		const seen = await counts(page);
		assert.deepEqual(seen.refresh, { token: 1, reload: 1, signIn: 0 });
		assert.equal(seen.calls, 1);
	});
});

test("traffic keeps the stored event when the advance needs a refresh", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.mount("traffic");
			window.registerTrafficAdvance(({ data, signal }) => window.callWrite(data, signal));
		});
		await expect(page.getByRole("heading", { name: "Squad traffic" })).toBeVisible();
		await expect(page.getByText("Packed the stored order", { exact: true })).toHaveCount(2);
		await page.getByRole("button", { name: "Send next event", exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.refreshCounts.reload)).toBe(1);
		await expect(page.getByText("Packed the stored order", { exact: true })).toHaveCount(2);
		await expect(page.getByText("Opened the stored carton", { exact: true })).toBeVisible();
		await expect(page.getByText("Phantom shipment", { exact: true })).toHaveCount(0);
		const seen = await counts(page);
		assert.deepEqual(seen.refresh, { token: 1, reload: 1, signIn: 0 });
		assert.equal(seen.calls, 1);
		assert.equal(seen.invalidates, 1);
	});
});

test("chat restores the unsent draft when begin needs a refresh", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount("chat"));
		await expect(page.getByText("Stored answer from Petra", { exact: true })).toBeVisible();
		const draft = page.locator("#chat-input");
		await draft.fill("Keep the unsent question");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.refreshCounts.reload)).toBe(1);
		await expect(draft).toHaveValue("Keep the unsent question");
		await expect(page.getByText("Stored answer from Petra", { exact: true })).toBeVisible();
		await expect(page.getByText("Keep the unsent question", { exact: true })).toHaveCount(0);
		const seen = await counts(page);
		assert.deepEqual(seen.refresh, { token: 1, reload: 1, signIn: 0 });
		assert.equal(seen.calls, 1);
	});
});

test("chat keeps the draft cleared after a committed begin loses its response", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.send = async (data) => {
				window.calls.push(data);
				window.storedFrame.messages = [
					...window.storedFrame.messages,
					{ id: "sent", from: "user", text: data.text },
				];
				throw new Error("The response was lost after commit.");
			};
			window.mount("chat");
		});
		const draft = page.locator("#chat-input");
		await draft.fill("Already stored question");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await expect(page.getByText("Already stored question", { exact: true })).toBeVisible();
		await expect(draft).toHaveValue("");
		assert.equal((await counts(page)).calls, 1);
	});
});

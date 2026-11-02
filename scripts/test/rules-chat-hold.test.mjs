import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const question = "Did the rules write stay?";
const reply = "The rules write stayed.";
const bundle = await build({
	stdin: {
		contents: `
			import React from "react";
			import { createRoot } from "react-dom/client";
			import { createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
			import { WorkspaceProvider } from "./apps/web/src/workspace/provider.tsx";
			import { Dock } from "./apps/web/src/workspace/dock.tsx";
			import { RulesScreen } from "./apps/web/src/screens/rules/screen.tsx";
			import { loadRulesSnapshot } from "./apps/web/src/screens/rules/loader.ts";
			const rootRoute = createRootRoute({ component: Outlet });
			const workspaceRoute = createRoute({
				getParentRoute: () => rootRoute,
				id: "_workspace",
				loader: async () => window.frame,
				component: () => (
					<WorkspaceProvider frame={workspaceRoute.useLoaderData()}>
						<Dock />
						<Outlet />
					</WorkspaceProvider>
				),
			});
			const rulesRoute = createRoute({
				getParentRoute: () => workspaceRoute,
				path: "/rules",
				loader: async () => {
					const page = await loadRulesSnapshot();
					window.rulesLoads += 1;
					return page;
				},
				component: () => <RulesScreen page={rulesRoute.useLoaderData()} />,
			});
			const router = createRouter({
				routeTree: rootRoute.addChildren([workspaceRoute.addChildren([rulesRoute])]),
				history: createMemoryHistory({ initialEntries: ["/rules"] }),
			});
			createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
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
			name: "held-send-boundaries",
			setup(build) {
				build.onResolve({ filter: /^#\/server\/(rules|workspace)\.ts$/ }, ({ path }) => ({
					path,
					namespace: "boundary",
				}));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
					contents: path.endsWith("workspace.ts")
						? `
							export const beginWorkspaceSend = ({ data }) => window.beginSend(data);
							export const finishWorkspaceSend = ({ data }) => window.finishSend(data);
						`
						: `
							export const loadRulesPage = () => window.readRules();
							export const setRuleEnabled = ({ data }) => window.send(data);
							export const setRuleLimit = ({ data }) => window.send(data);
							export const addWorkspaceRule = ({ data }) => window.send(data);
						`,
				}));
			},
		},
	],
});

function frame(messages = []) {
	return {
		accountName: "Northwind",
		owner: "Moe",
		masterName: "Master",
		agents: [{ id: "orders", name: "Orders", tint: "#181818", on: true }],
		approvalCount: 0,
		messages,
	};
}

async function mount(page) {
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.setContent('<div id="root"></div>');
	await page.evaluate(
		({ question, reply, frame }) => {
			window.rulesLoads = 0;
			window.finishCalls = 0;
			window.question = question;
			window.reply = reply;
			window.frame = frame;
			window.limits = [
				{
					id: "lim-ads",
					key: "policy.daily_ad_cap",
					label: "Total ad spend per day",
					min: 0,
					max: 1000,
					step: 10,
					value: 200,
				},
			];
			window.rules = [
				{
					id: "r1",
					when: "a new order arrives",
					agent: "orders",
					action: "Seed",
					approval: "Ask first",
					on: true,
				},
			];
			window.readRules = async () => ({
				rules: window.rules.map((row) => ({ ...row })),
				limits: window.limits.map((row) => ({ ...row })),
			});
			window.heldRules = [];
			window.heldBegin = [];
			window.send = (data) =>
				new Promise((resolve) => {
					window.heldRules.push({ data, resolve });
				});
			window.beginSend = (text) =>
				new Promise((resolve) => {
					window.heldBegin.push({ text, resolve });
				});
			window.finishSend = () => {
				window.finishCalls += 1;
				return { kind: "replied", messages: window.frame.messages };
			};
		},
		{ question, reply, frame: frame() },
	);
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	await page.getByRole("heading", { name: "Rules and limits" }).waitFor();
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.locator("#dock-input").fill(question);
	await page.getByRole("button", { name: "Send", exact: true }).click();
	await page.locator("#lim-ads").fill("240");
	await page.waitForFunction(() => window.heldBegin.length === 1 && window.heldRules.length === 1);
	await expect(page.locator("#lim-ads")).toHaveValue("240");
	await expect(page.getByText(reply, { exact: true })).toHaveCount(0);
	return errors;
}

async function releaseRules(page) {
	await page.evaluate(() => {
		const held = window.heldRules[0];
		window.limits = window.limits.map((row) =>
			row.key === held.data.key ? { ...row, value: held.data.value } : row,
		);
		held.resolve({ key: held.data.key, value: held.data.value });
	});
}

async function releaseChat(page) {
	await page.evaluate(() => {
		const held = window.heldBegin[0];
		window.frame = {
			...window.frame,
			messages: [
				{ id: "user-1", from: "user", text: held.text },
				{ id: "master-1", from: "master", text: window.reply },
			],
		};
		held.resolve({ kind: "answered", messages: window.frame.messages });
	});
}

async function expectBoth(page) {
	await expect(page.locator("#lim-ads")).toHaveValue("240");
	await expect(page.locator("[data-loop='dockChat']").getByText(reply, { exact: true })).toBeVisible();
	await expect(page.locator("[data-loop='dockChat']").getByText(question, { exact: true })).toBeVisible();
}

for (const order of ["rules-first", "chat-first"]) {
	test(`a held chat send and a held rules write both keep their results (${order})`, async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			const errors = await mount(page);
			const loads = await page.evaluate(() => window.rulesLoads);
			if (order === "rules-first") {
				await releaseRules(page);
				await expect(page.locator("#lim-ads")).toHaveValue("240");
				await expect(page.getByText(reply, { exact: true })).toHaveCount(0);
				assert.equal(await page.evaluate(() => window.rulesLoads), loads);
				await releaseChat(page);
			} else {
				await releaseChat(page);
				await page.waitForFunction((loads) => window.rulesLoads > loads, loads);
				await expect(page.locator("#lim-ads")).toHaveValue("240");
				await expect(page.locator("[data-loop='dockChat']").getByText(reply, { exact: true })).toBeVisible();
				await releaseRules(page);
			}
			await page.waitForFunction((loads) => window.rulesLoads > loads, loads);
			await expectBoth(page);
			assert.equal(await page.evaluate(() => window.finishCalls), 0);
			assert.deepEqual(errors, []);
		} finally {
			await browser.close();
		}
	});
}

import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { PENDING_TASK_WINDOW_MS } from "../../packages/adapters/src/pending-window.ts";

const bundle = await build({
	stdin: {
		contents: `
			import React, { useState } from "react";
			import { createRoot } from "react-dom/client";
			import { WorkspaceContext } from "./apps/web/src/workspace/context.ts";
			import { gateStyle, switchParts } from "./apps/web/src/workspace/styles.ts";
			import { RulesScreen } from "./apps/web/src/screens/rules/screen.tsx";
			import * as queue from "./apps/web/src/screens/rules/write-queue.ts";
			window.queue = queue;
			window.calls = [];
			window.send = async (data) => { window.calls.push(data); };
			window.refresh = async () => {};
			window.flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
			function Harness() {
				const [ruleForm, setRuleForm] = useState({
					when: "A new order arrives", agent: "orders", action: "", approval: "Ask first"
				});
				return <WorkspaceContext.Provider value={{
					ruleForm, setRuleForm, refresh: () => window.refresh(),
					frame: { masterName: "Master", agents: [{id: "orders", name: "Orders"}] },
					helpers: { gateStyle, switchParts }
				}}><RulesScreen page={{ rules: [], limits: [] }} /></WorkspaceContext.Provider>;
			}
			window.mount = () => {
				window.root = createRoot(document.getElementById("root"));
				window.root.render(<Harness />);
			};
		`,
		resolveDir: process.cwd(),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	jsx: "automatic",
	plugins: [{
		name: "rules-server-boundary",
		setup(build) {
			build.onResolve({ filter: /^#\/server\/rules.ts$/ }, ({ path }) => ({ path, namespace: "boundary" }));
			build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
				contents: `
					export const setRuleEnabled = ({data, signal}) => window.send(data, signal);
					export const setRuleLimit = ({data, signal}) => window.send(data, signal);
					export const addWorkspaceRule = ({data, signal}) => window.send(data, signal);
				`,
			}));
		},
	}],
});

async function withPage(run) {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.clock.install();
		await page.setContent('<div id="root"></div>');
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		await run(page);
	} finally {
		await browser.close();
	}
}

const cases = [
	{ kind: "limit", initial: 50, first: 70, last: 80, newer: 90 },
	{ kind: "rule", initial: false, first: true, last: false, newer: false },
];

async function configure(page, values) {
	await page.evaluate((values) => {
		window.values = values;
		const { kind } = values;
		window.write = (value, loaded) => window.queue[kind === "rule" ? "queueRule" : "queueLimit"](
			"test-key", value, loaded, () => window.refresh(),
		);
		window.shown = (loaded) => window.queue[kind === "rule" ? "shownOn" : "shownLimit"]("test-key", loaded);
	}, values);
}

for (const values of cases) {
	test(`${values.kind}: a confirmed idle flight yields to later loader reads`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			assert.equal(await page.evaluate(async () => {
				const { initial, first } = window.values;
				window.refresh = () => new Promise((resolve) => { window.releaseRefresh = resolve; });
				window.write(first, initial);
				await window.flush();
				return window.shown(initial);
			}), values.first);
			assert.equal(await page.evaluate(async () => {
				window.shown(window.values.first);
				window.releaseRefresh();
				await window.flush();
				return window.shown(window.values.initial);
			}), values.first);
			assert.equal(await page.evaluate(() => window.shown(window.values.first)), values.first);
			assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
		});
	});

	for (const finish of ["settle", "timeout"]) {
		test(`${values.kind}: the last value queued during refresh goes out after ${finish}`, async () => {
			await withPage(async (page) => {
				await configure(page, values);
				await page.evaluate(async () => {
					const { initial, first, last } = window.values;
					window.refresh = () => new Promise((resolve) => { window.releaseRefresh = resolve; });
					window.write(first, initial);
					await window.flush();
					window.write(first, initial);
					window.write(last, initial);
					window.mount();
				});
				await page.getByRole("heading", { name: "Rules and limits" }).waitFor();
				await page.evaluate(() => window.root.unmount());
				assert.equal(await page.evaluate(() => window.shown(window.values.first)), values.last);
				assert.equal(await page.evaluate(() => window.calls.length), 1);
				if (finish === "timeout") await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
				else await page.evaluate(async () => { window.releaseRefresh(); await window.flush(); });
				assert.deepEqual(await page.evaluate(() => window.calls), values.kind === "rule"
					? [{ id: "test-key", on: values.first }, { id: "test-key", on: values.last }]
					: [{ key: "test-key", value: values.first }, { key: "test-key", value: values.last }]);
				await page.evaluate(async () => { window.releaseRefresh(); await window.flush(); });
				assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
				assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
			});
		});
	}

	test(`${values.kind}: a failed write rolls back to the last successful value`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			assert.equal(await page.evaluate(async () => {
				const { initial, first, last } = window.values;
				window.write(first, initial);
				await window.flush();
				window.send = async () => { throw new Error("Write failed"); };
				window.write(last, first);
				await window.flush();
				return window.shown(initial);
			}), values.first);
		});
	});
}

for (const newer of ["", "A newer action"]) {
	test(`add rule: a hung refresh clears the pending row and ${newer ? "keeps newer typing" : "restores the draft"}`, async () => {
		await withPage(async (page) => {
			await page.evaluate(() => {
				window.refresh = () => new Promise(() => {});
				window.mount();
			});
			const action = page.getByLabel("Then", { exact: true });
			await action.fill("Handle the order");
			await page.getByRole("button", { name: "Add rule", exact: true }).click();
			await expect(action).toHaveValue("");
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(1);
			if (newer) await action.fill(newer);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(0);
			await expect(action).toHaveValue(newer || "Handle the order");
			assert.equal(await page.evaluate(() => window.calls.length), 1);
		});
	});
}

for (const values of cases) {
	test(`${values.kind}: a rejected POST preserves the last queued write`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			await page.evaluate(async () => {
				const { initial, first, last } = window.values;
				window.send = (data) => {
					window.calls.push(data);
					return new Promise((_resolve, reject) => { window.rejectSend = reject; });
				};
				window.write(first, initial);
				await window.flush();
				window.write(last, initial);
				window.send = async (data) => { window.calls.push(data); };
				window.rejectSend(new Error("Write failed"));
				await window.flush();
			});
			assert.equal(await page.evaluate(() => window.calls.length), 2);
			assert.equal(await page.evaluate(() => window.calls[1].on ?? window.calls[1].value), values.last);
			assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
		});
	});
}

test("add rule: a successful refresh keeps the action cleared", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount());
		const action = page.getByLabel("Then", { exact: true });
		await action.fill("Handle the order");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.evaluate(() => window.flush());
		await expect(action).toHaveValue("");
		assert.deepEqual(await page.evaluate(() => window.calls), [{
			when: "A new order arrives", agent: "orders", action: "Handle the order", approval: "Ask first",
		}]);
	});
});

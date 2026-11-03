import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { PENDING_TASK_WINDOW_MS } from "../../packages/adapters/src/pending-window.ts";

const bundle = await build({
	stdin: {
		contents: `
			import React, { useMemo, useState } from "react";
			import { createRoot } from "react-dom/client";
			import { WorkspaceContext } from "./apps/web/src/workspace/context.ts";
			import { gateStyle, switchParts } from "./apps/web/src/workspace/styles.ts";
			import { RulesScreen } from "./apps/web/src/screens/rules/screen.tsx";
			import { rulesWriteCounter } from "./apps/web/src/screens/rules/write-queue.ts";
			import { nextWriteFence } from "./apps/web/src/write-fence.ts";
			window.nextWriteFence = nextWriteFence;
			import { loadRulesSnapshot } from "./apps/web/src/screens/rules/loader.ts";
			import * as queue from "./apps/web/src/screens/rules/write-queue.ts";
			window.queue = queue;
			window.loadRulesSnapshot = loadRulesSnapshot;
			window.calls = [];
			window.ruleRow = (data, id = "r100") => ({
				id: data.id || id,
				when: data.when ? data.when.charAt(0).toLowerCase() + data.when.slice(1) : "a new order arrives",
				agent: data.agent || "orders",
				action: (data.action || "Handle the order").trim(),
				approval: data.approval || "Ask first",
				on: typeof data.on === "boolean" ? data.on : true,
			});
			window.send = async (data) => {
				window.calls.push(data);
				if (typeof data.on === "boolean") return window.ruleRow(data);
				if (typeof data.value === "number") return { key: data.key, value: data.value };
				if (typeof data.action === "string") return window.ruleRow(data);
				return null;
			};
			window.refresh = async () => {};
			window.flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
			function Harness() {
				const [showRules, setShowRules] = useState(true);
				const [rules, setRules] = useState([]);
				const [limits, setLimits] = useState([]);
				const [readCounter, setReadCounter] = useState(0);
				const page = useMemo(() => ({ accountId: "rules-account", rules, limits, readCounter }), [rules, limits, readCounter]);
				window.beginRulesRead = () => {
					const counter = rulesWriteCounter();
					let resolve, reject;
					const reading = new Promise((ok, fail) => { resolve = ok; reject = fail; });
					window.readSource = () => reading;
					const done = loadRulesSnapshot();
					void done.catch(() => undefined);
					const reader = {
						done,
						finish: () => resolve({ accountId: "rules-account", rules, limits }),
						fail: () => reject(new Error("Read failed")),
						loadRules: (rows) => { setReadCounter(counter); setRules(rows); resolve({ accountId: "rules-account", rules: rows, limits }); },
						loadLimits: (rows) => { setReadCounter(counter); setLimits(rows); resolve({ accountId: "rules-account", rules, limits: rows }); },
					};
					Object.assign(window, reader);
					return reader;
				};
				useMemo(() => window.beginRulesRead(), []);
				const [ruleForm, setRuleForm] = useState({
					when: "A new order arrives", agent: "orders", action: "", approval: "Ask first"
				});
				return <WorkspaceContext.Provider value={{
					ruleForm, setRuleForm, refresh: () => { window.beginRulesRead(); return window.refresh(); },
					frame: { accountId: "rules-account", masterName: "Master", agents: [{id: "orders", name: "Orders"}, {id: "support", name: "Support"}] },
					helpers: { gateStyle, switchParts }
				}}>
					<button onClick={() => setShowRules(false)}>Leave rules</button>
					<button onClick={() => setShowRules(true)}>Return to rules</button>
					{showRules && <RulesScreen page={page} />}
				</WorkspaceContext.Provider>;
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
	plugins: [
		{
			name: "rules-server-boundary",
			setup(build) {
				build.onResolve({ filter: /^#\/server\/rules.ts$/ }, ({ path }) => ({ path, namespace: "boundary" }));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
					contents: `
					function withoutFence(data) {
						if (!data || typeof data !== "object") return data;
						if (data.accountId !== "rules-account") throw new Error("Wrong account");
						const { accountId, tab, seq, retires, ...rest } = data;
						return rest;
					}
					function asWritten(data, row) {
						if (!row || typeof row !== "object" || row.status || Object.hasOwn(row, "error")) return row;
						if (typeof data.on === "boolean" || typeof data.value === "number") return { status: "written", row };
						return row;
					}
					async function settle(data, signal) {
						const row = await window.send(data, signal);
						if (row && typeof row === "object" && Object.hasOwn(row, "error")) {
							throw new Error(String(row.error).replace(/^Error: /, ""));
						}
						return asWritten(data, row);
					}
					export const loadRulesPage = () => window.readSource();
					export const setRuleEnabled = async ({data, signal}) => settle(withoutFence(data), signal);
					export const setRuleLimit = async ({data, signal}) => settle(withoutFence(data), signal);
					export const addWorkspaceRule = async ({data, signal}) => window.send(withoutFence(data), signal);
				`,
				}));
			},
		},
	],
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
		window.write = (value) =>
			window.queue[kind === "rule" ? "queueRule" : "queueLimit"]("test-key", value, () => window.refresh());
		window.shown = (loaded) => window.queue[kind === "rule" ? "shownOn" : "shownLimit"]("test-key", loaded);
	}, values);
}

function sentRow(kind, value) {
	return kind === "rule" ? { id: "test-key", on: value } : { key: "test-key", value };
}

for (const values of cases) {
	test(`${values.kind}: a finished write does not cover a later read`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			assert.equal(
				await page.evaluate(async () => {
					window.refreshCalls = 0;
					window.refresh = async () => {
						window.refreshCalls += 1;
					};
					window.write(window.values.first);
					await window.flush();
					return window.shown(window.values.initial);
				}),
				values.initial,
			);
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
			assert.equal(await page.evaluate(() => window.shown(window.values.first)), values.first);
			assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
			assert.equal(await page.evaluate(() => window.calls.length), 1);
		});
	});

	test(`${values.kind}: the last value queued during a write goes out once`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			await page.evaluate(async () => {
				const { first } = window.values;
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
				};
				const row = (data) =>
					typeof data.on === "boolean" ? window.ruleRow(data) : { key: data.key, value: data.value };
				window.send = (data) => {
					window.calls.push(data);
					if (window.calls.length > 1) {
						return Promise.resolve(row(data));
					}
					return new Promise((resolve) => {
						window.releaseSend = () => resolve(row(data));
					});
				};
				window.write(first);
				await window.flush();
				window.write(window.values.last);
				window.mount();
			});
			await page.getByRole("heading", { name: "Rules and limits" }).waitFor();
			await page.evaluate(() => window.root.unmount());
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.last);
			assert.equal(await page.evaluate(() => window.calls.length), 1);
			await page.evaluate(async () => {
				window.releaseSend();
				await window.flush();
			});
			assert.deepEqual(await page.evaluate(() => window.calls), [
				sentRow(values.kind, values.first),
				sentRow(values.kind, values.last),
			]);
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
			assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
			assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
		});
	});

	test(`${values.kind}: a timed-out write leaves the queue and one read follows`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			await page.evaluate(async () => {
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
				};
				window.send = (data) =>
					new Promise((resolve) => {
						window.calls.push(data);
						window.releaseSend = () =>
							resolve(
								typeof data.on === "boolean" ? window.ruleRow(data) : { key: data.key, value: data.value },
							);
					});
				window.write(window.values.first);
				await window.flush();
				window.write(window.values.last);
				await window.flush();
			});
			assert.equal(await page.evaluate(() => window.calls.length), 1);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await page.evaluate(() => window.flush());
			assert.deepEqual(await page.evaluate(() => window.calls), [
				sentRow(values.kind, values.first),
				sentRow(values.kind, values.last),
			]);
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
			await page.evaluate(async () => {
				window.releaseSend();
				await window.flush();
			});
			assert.equal(await page.evaluate(() => window.calls.length), 2);
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.initial);
			assert.equal(await page.evaluate(() => window.refreshCalls), 1);
		});
	});

	test(`${values.kind}: a failed write does not send the failed value again`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			await page.evaluate(async () => {
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
				};
				window.send = (data) => {
					window.calls.push(data);
					return new Promise((_resolve, reject) => {
						window.rejectSend = reject;
					});
				};
				window.write(window.values.first);
				await window.flush();
				window.write(window.values.last);
				window.send = async (data) => {
					window.calls.push(data);
					return typeof data.on === "boolean" ? window.ruleRow(data) : { key: data.key, value: data.value };
				};
				window.rejectSend(new Error("Write failed"));
				await window.flush();
			});
			assert.deepEqual(await page.evaluate(() => window.calls), [
				sentRow(values.kind, values.first),
				sentRow(values.kind, values.last),
			]);
			assert.equal(await page.evaluate(() => window.refreshCalls), 1);
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.initial);
			assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
		});
	});

	test(`${values.kind}: a serialized validation error is a failed write and keeps the retire list`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			const result = await page.evaluate(async () => {
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
				};
				window.send = async () => ({ error: "Error: The write fence is not valid." });
				window.dispatchEvent(new Event("pagehide"));
				const before = window.nextWriteFence().retires;
				const counterBefore = window.queue.rulesWriteCounter();
				window.write(window.values.first);
				await window.flush();
				return {
					before,
					pending: window.nextWriteFence().retires,
					counter: window.queue.rulesWriteCounter(),
					counterBefore,
					needed: window.queue.readNeeded(),
					refreshCalls: window.refreshCalls,
					shown: window.shown(window.values.initial),
				};
			});
			assert.ok(result.before.length > 0);
			assert.deepEqual(result.pending, result.before);
			assert.equal(result.counter, result.counterBefore + 1);
			assert.equal(result.needed, true);
			assert.equal(result.refreshCalls, 1);
			assert.equal(result.shown, values.initial);
		});
	});
}

test("limit: the response value replaces the snapshot", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.refreshCalls = 0;
			window.refresh = async () => {
				window.refreshCalls += 1;
			};
			window.send = async (data) => {
				window.calls.push(data);
				return { key: data.key, value: 55 };
			};
			window.mount();
		});
		await page.getByRole("heading", { name: "Rules and limits" }).waitFor();
		await page.evaluate(() => {
			window.loadLimits([
				{
					id: "lim-refund",
					key: "policy.refund_auto_limit",
					label: "Refund without asking, up to",
					min: 0,
					max: 200,
					step: 5,
					value: 50,
				},
			]);
		});
		await page.getByRole("slider").fill("70");
		await page.evaluate(() => window.flush());
		await expect(page.getByText("$55", { exact: true })).toBeVisible();
		assert.equal(await page.evaluate(() => window.refreshCalls), 0);
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await expect(page.getByText("$55", { exact: true })).toBeVisible();
		assert.deepEqual(await page.evaluate(() => window.calls), [{ key: "policy.refund_auto_limit", value: 70 }]);
	});
});

test("limit: a failed write reads once and a failed read stops", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.refreshCalls = 0;
			window.refresh = async () => {
				window.refreshCalls += 1;
				throw new Error("Read failed");
			};
			window.send = async () => {
				throw new Error("Write failed");
			};
			window.mount();
		});
		await page.getByRole("heading", { name: "Rules and limits" }).waitFor();
		await page.evaluate(() => {
			window.loadLimits([
				{
					id: "lim-refund",
					key: "policy.refund_auto_limit",
					label: "Refund without asking, up to",
					min: 0,
					max: 200,
					step: 5,
					value: 50,
				},
			]);
		});
		await page.getByRole("slider").fill("70");
		await page.evaluate(() => window.flush());
		await expect(page.getByText("$50", { exact: true })).toBeVisible();
		assert.equal(await page.evaluate(() => window.refreshCalls), 1);
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await page.evaluate(() => window.flush());
		assert.equal(await page.evaluate(() => window.refreshCalls), 1);
		await expect(page.getByText("$50", { exact: true })).toBeVisible();
	});
});

for (const newer of ["", "A newer action"]) {
	test(`add rule: a successful add keeps the row without a confirmation read (${newer})`, async () => {
		await withPage(async (page) => {
			await page.evaluate(() => {
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
				};
				window.mount();
			});
			const action = page.getByLabel("Then", { exact: true });
			await action.fill("Handle the order");
			const add = page.getByRole("button", { name: "Add rule", exact: true });
			await add.click();
			await page.evaluate(() => window.flush());
			await expect(action).toHaveValue("");
			if (newer) await action.fill(newer);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(1);
			await expect(action).toHaveValue(newer);
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
			if (!newer) await add.click();
			assert.equal(await page.evaluate(() => window.calls.length), 1);
		});
	});
}

for (const newer of ["", "A newer action"]) {
	test(`add rule: POST rejection restores only an unchanged draft (${newer})`, async () => {
		await withPage(async (page) => {
			await page.evaluate(() => {
				window.send = () =>
					new Promise((_resolve, reject) => {
						window.rejectSend = reject;
					});
				window.mount();
			});
			const action = page.getByLabel("Then", { exact: true });
			await action.fill("Handle the order");
			await page.getByRole("button", { name: "Add rule", exact: true }).click();
			await page.waitForFunction(() => window.rejectSend);
			await expect(action).toHaveValue("");
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(1);
			if (newer) await action.fill(newer);
			await page.evaluate(async () => {
				window.rejectSend(new Error("POST failed"));
				await window.flush();
			});
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(0);
			await expect(action).toHaveValue(newer || "Handle the order");
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
					return new Promise((_resolve, reject) => {
						window.rejectSend = reject;
					});
				};
				window.write(first, initial);
				await window.flush();
				window.write(last, initial);
				window.send = async (data) => {
					window.calls.push(data);
				};
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
		assert.deepEqual(await page.evaluate(() => window.calls), [
			{
				when: "A new order arrives",
				agent: "orders",
				action: "Handle the order",
				approval: "Ask first",
			},
		]);
	});
});

async function holdAdds(page) {
	await page.evaluate(() => {
		window.adds = [];
		window.send = (data, signal) =>
			new Promise((resolve, reject) => {
				window.adds.push({ data, signal, resolve, reject });
			});
		window.mount();
	});
}

async function typeSecondDraft(page) {
	await page.getByLabel("When").selectOption("A refund request comes in");
	await page.getByLabel("Agent").selectOption("support");
	await page.getByLabel("Approval").selectOption("Auto");
	await page.getByLabel("Then", { exact: true }).fill("Draft B");
}

test("add rule: an old failure after navigation preserves the current provider draft", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.getByLabel("Then", { exact: true }).fill("Draft A");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.waitForFunction(() => window.adds.length === 1);
		await page.getByRole("button", { name: "Leave rules", exact: true }).click();
		await expect(page.getByLabel("Then", { exact: true })).toHaveCount(0);
		await page.getByRole("button", { name: "Return to rules", exact: true }).click();
		await typeSecondDraft(page);
		assert.equal(await page.evaluate(() => window.adds[0].signal.aborted), false);
		await page.evaluate(async () => {
			window.adds[0].reject(new Error("HTTP 500"));
			await window.flush();
		});
		await expect(page.getByLabel("Then", { exact: true })).toHaveValue("Draft B");
		await expect(page.getByLabel("When")).toHaveValue("A refund request comes in");
		await expect(page.getByLabel("Agent")).toHaveValue("support");
		await expect(page.getByLabel("Approval")).toHaveValue("Auto");
	});
});

for (const outcome of ["failure", "success"]) {
	test(`add rule: an older ${outcome} cannot clear a newer submission`, async () => {
		await withPage(async (page) => {
			await holdAdds(page);
			const action = page.getByLabel("Then", { exact: true });
			const add = page.getByRole("button", { name: "Add rule", exact: true });
			await action.fill("Draft A");
			await add.click();
			await page.waitForFunction(() => window.adds.length === 1);
			await typeSecondDraft(page);
			await add.click();
			await page.waitForFunction(() => window.adds.length === 2);
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(2);
			await expect(page.getByText("Draft A", { exact: false })).toHaveCount(1);
			await expect(action).toHaveValue("");
			await page.evaluate(async (outcome) => {
				const first = window.adds[0];
				if (outcome === "failure") first.reject(new Error("HTTP 500"));
				else first.resolve(window.ruleRow({ ...first.data, id: "r100", on: true }));
				await window.flush();
			}, outcome);
			await expect(action).toHaveValue("");
			await expect(page.locator("section[aria-label='Rules']").getByText("Draft B", { exact: false })).toHaveCount(
				1,
			);
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(outcome === "failure" ? 1 : 2);
			await expect(page.getByLabel("When")).toHaveValue("A refund request comes in");
			await expect(page.getByLabel("Agent")).toHaveValue("support");
			await expect(page.getByLabel("Approval")).toHaveValue("Auto");
			await page.evaluate(async () => {
				window.adds[1].reject(new Error("HTTP 500"));
				await window.flush();
			});
			await expect(action).toHaveValue("Draft B");
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(outcome === "failure" ? 0 : 1);
		});
	});
}

test("add rule: editing and clearing an action prevents old draft restoration", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		const action = page.getByLabel("Then", { exact: true });
		await action.fill("Draft A");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.waitForFunction(() => window.adds.length === 1);
		await action.fill("Draft B");
		await action.fill("");
		await expect(action).toHaveValue("");
		await page.evaluate(() => window.flush());
		await page.evaluate(async () => {
			window.adds[0].reject(new Error("HTTP 500"));
			await window.flush();
		});
		await expect(action).toHaveValue("");
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(0);
	});
});

test("add rule: each success puts its own row in the snapshot", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		const action = page.getByLabel("Then", { exact: true });
		const add = page.getByRole("button", { name: "Add rule", exact: true });
		const switches = page.getByRole("button", { name: "Rule enabled" });
		await action.fill("Same action");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 1);
		await action.fill("Same action");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 2);
		await expect(switches).toHaveCount(2);
		assert.deepEqual(await page.evaluate(() => window.adds.map((submission) => submission.data)), [
			{ when: "A new order arrives", agent: "orders", action: "Same action", approval: "Ask first" },
			{ when: "A new order arrives", agent: "orders", action: "Same action", approval: "Ask first" },
		]);
		await page.evaluate(async () => {
			window.refresh = () => new Promise(() => {});
			window.adds[0].resolve(window.ruleRow({ ...window.adds[0].data, id: "r100", on: true }));
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
		await expect(action).toHaveValue("");
		assert.equal(await page.evaluate(() => window.adds[1].signal.aborted), false);
		await page.evaluate(async () => {
			window.adds[1].resolve(window.ruleRow({ ...window.adds[1].data, id: "r101", on: true }));
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await expect(switches).toHaveCount(2);
		await page.evaluate(async () => {
			window.beginRulesRead();
			window.loadRules([window.ruleRow({ ...window.adds[0].data, id: "r100", on: true })]);
			await window.flush();
		});
		await expect(switches).toHaveCount(1);
		await expect(action).toHaveValue("");
	});
});

test("add rule: a click on a pending row shows at once and waits behind the add", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.getByLabel("Then", { exact: true }).fill("Handle the order");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.waitForFunction(() => window.adds.length === 1);
		const toggle = page.getByRole("button", { name: "Rule enabled" });
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await page.evaluate(async () => {
			window.calls = [];
			window.send = async (data) => {
				window.calls.push(data);
				return window.ruleRow(data);
			};
			window.adds[0].resolve(window.ruleRow({ ...window.adds[0].data, id: "r100", on: true }));
			await window.flush();
		});
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		assert.deepEqual(await page.evaluate(() => window.calls), [{ id: "r100", on: false }]);
	});
});

test("add rule: a failed add drops the pending row and its queued clicks", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.evaluate(async () => {
			window.loadRules([
				{
					id: "r1",
					when: "a new order arrives",
					agent: "orders",
					action: "Seed",
					approval: "Ask first",
					on: true,
				},
			]);
			await window.flush();
		});
		await page.getByLabel("Then", { exact: true }).fill("Handle the order");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.waitForFunction(() => window.adds.length === 1);
		const toggles = page.getByRole("button", { name: "Rule enabled" });
		await expect(toggles).toHaveCount(2);
		await toggles.nth(1).click();
		await expect(toggles.nth(1)).toHaveAttribute("aria-pressed", "false");
		await page.evaluate(async () => {
			window.calls = [];
			window.adds[0].reject(new Error("HTTP 500"));
			await window.flush();
		});
		await expect(toggles).toHaveCount(1);
		await expect(toggles).toHaveAttribute("aria-pressed", "true");
		assert.deepEqual(await page.evaluate(() => window.calls), []);
		await expect(page.getByLabel("Then", { exact: true })).toHaveValue("Handle the order");
	});
});

test("add rule: two held adds both stay on the list", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.evaluate(async () => {
			window.loadRules(
				[1, 2, 3, 4, 5].map((index) => ({
					id: `r${index}`,
					when: "a new order arrives",
					agent: "orders",
					action: `Seed ${index}`,
					approval: "Ask first",
					on: true,
				})),
			);
			await window.flush();
		});
		const action = page.getByLabel("Then", { exact: true });
		const add = page.getByRole("button", { name: "Add rule", exact: true });
		await action.fill("Draft A");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 1);
		await action.fill("Draft B");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 2);
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(7);
		await expect(page.getByText("Draft A", { exact: false })).toHaveCount(1);
		await expect(page.getByText("Draft B", { exact: false })).toHaveCount(1);
	});
});

test("add rule: each failure restores only its own draft when the form is empty", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		const action = page.getByLabel("Then", { exact: true });
		const add = page.getByRole("button", { name: "Add rule", exact: true });
		await action.fill("Draft A");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 1);
		await action.fill("Draft B");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 2);
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(2);
		await page.evaluate(async () => {
			window.adds[1].reject(new Error("HTTP 500"));
			await window.flush();
		});
		await expect(action).toHaveValue("Draft B");
		await expect(page.getByText("Draft A", { exact: false })).toHaveCount(1);
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(1);
		await action.fill("Keep this");
		await page.evaluate(async () => {
			window.adds[0].reject(new Error("HTTP 500"));
			await window.flush();
		});
		await expect(action).toHaveValue("Keep this");
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(0);
	});
});

test("add rule: a saved row stays while a later read hangs", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.refreshCalls = 0;
			window.send = async (data) => {
				window.calls.push(data);
				return window.ruleRow(data);
			};
			window.refresh = () => {
				window.refreshCalls += 1;
				return new Promise(() => {});
			};
			window.mount();
		});
		await page.getByLabel("Then", { exact: true }).fill("Handle the order");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		const toggles = page.getByRole("button", { name: "Rule enabled" });
		await expect(toggles).toHaveCount(1);
		await page.waitForFunction(() => window.calls.length === 1);
		await page.evaluate(() => window.flush());
		assert.equal(await page.evaluate(() => window.refreshCalls), 0);
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await page.evaluate(() => window.flush());
		await expect(toggles).toHaveCount(1);
		await toggles.click();
		await page.evaluate(() => window.flush());
		assert.deepEqual(await page.evaluate(() => window.calls), [
			{
				when: "A new order arrives",
				agent: "orders",
				action: "Handle the order",
				approval: "Ask first",
			},
			{ id: "r100", on: false },
		]);
		await expect(toggles).toHaveAttribute("aria-pressed", "false");
		await expect(page.getByText("Handle the order", { exact: false })).toHaveCount(1);
	});
});

for (const clickBeforeSave of [false, true]) {
	test(`add rule: saved row recovers a failed toggle (queued: ${clickBeforeSave})`, async () => {
		await withPage(async (page) => {
			await holdAdds(page);
			await page.evaluate(() => {
				window.refresh = () => new Promise(() => {});
			});
			await page.getByLabel("Then", { exact: true }).fill("Handle the order");
			await page.getByRole("button", { name: "Add rule", exact: true }).click();
			await page.waitForFunction(() => window.adds.length === 1);
			const toggle = page.getByRole("button", { name: "Rule enabled" });
			if (clickBeforeSave) {
				await toggle.click();
				await expect(toggle).toHaveAttribute("aria-pressed", "false");
			}
			await page.evaluate(async () => {
				window.send = (data) => {
					window.calls.push(data);
					return new Promise((_resolve, reject) => {
						window.rejectToggle = reject;
					});
				};
				window.adds[0].resolve(window.ruleRow({ ...window.adds[0].data, id: "r100", on: true }));
				await window.flush();
			});
			if (!clickBeforeSave) await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await page.waitForFunction(() => window.rejectToggle);
			await page.evaluate(async () => {
				window.rejectToggle(new Error("Toggle failed"));
				await window.flush();
			});
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await expect(toggle).toHaveAttribute("aria-pressed", "true");
			await page.evaluate(() => {
				window.send = async (data) => {
					window.calls.push(data);
					return window.ruleRow(data);
				};
			});
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await page.evaluate(() => window.flush());
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "true");
			assert.deepEqual(await page.evaluate(() => window.calls), [
				{ id: "r100", on: false },
				{ id: "r100", on: false },
				{ id: "r100", on: true },
			]);
		});
	});
}

for (const refreshResult of ["success", "reject", "timeout"]) {
	test(`add rule: failure reads server state with bounded refresh (${refreshResult})`, async () => {
		await withPage(async (page) => {
			await holdAdds(page);
			await page.evaluate((outcome) => {
				window.refreshCalls = 0;
				window.refresh = async () => {
					window.refreshCalls += 1;
					if (outcome === "reject") {
						window.fail();
						return;
					}
					if (outcome === "timeout") return new Promise(() => {});
					window.loadRules([
						{
							id: "r1",
							when: "a new order arrives",
							agent: "orders",
							action: "Server row",
							approval: "Ask first",
							on: true,
						},
					]);
				};
			}, refreshResult);
			const action = page.getByLabel("Then", { exact: true });
			const add = page.getByRole("button", { name: "Add rule", exact: true });
			await action.fill("Draft A");
			await add.click();
			await page.waitForFunction(() => window.adds.length === 1);
			await action.fill("Draft B");
			await add.click();
			await page.waitForFunction(() => window.adds.length === 2);
			await page.getByRole("button", { name: "Rule enabled" }).first().click();
			await page.evaluate(async () => {
				window.adds[0].reject(new Error("HTTP 500"));
				await window.flush();
			});
			await page.waitForFunction(() => window.refreshCalls === 1);
			if (refreshResult === "timeout") {
				// Complete B before its own write deadline. Its saved row must survive the hung read.
				await page.evaluate(async () => {
					window.adds[1].resolve(window.ruleRow({ ...window.adds[1].data, id: "r100", on: true }));
					await window.flush();
				});
				assert.equal(await page.evaluate(() => window.refreshCalls), 1);
				await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			}
			await expect(page.locator("section[aria-label='Rules']").getByText("Draft B", { exact: false })).toHaveCount(
				1,
			);
			await expect(action).toHaveValue("");
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(
				refreshResult === "success" ? 2 : 1,
			);
			if (refreshResult === "success") await expect(page.getByText("Server row", { exact: false })).toHaveCount(1);
			assert.deepEqual(await page.evaluate(() => window.calls), []);
		});
	});
}

test("snapshot: a held failure read preserves newer write responses", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.evaluate(async () => {
			window.seedRules = [1, 2, 3, 4, 5].map((id) =>
				window.ruleRow({ id: `r${id}`, action: `Seed ${id}`, on: true }),
			);
			window.adLimit = {
				id: "lim-ads",
				key: "policy.daily_ad_cap",
				label: "Total ad spend per day",
				min: 0,
				max: 1000,
				step: 10,
				value: 200,
			};
			window.loadRules(window.seedRules);
			window.loadLimits([window.adLimit]);
			window.send = (data, signal) => {
				if (typeof data.value === "number") return Promise.resolve({ key: data.key, value: data.value + 10 });
				if (typeof data.on === "boolean") return Promise.resolve(window.ruleRow(data));
				return new Promise((resolve, reject) => window.adds.push({ data, signal, resolve, reject }));
			};
			window.refreshCalls = 0;
			window.refresh = () => {
				window.refreshCalls += 1;
				return new Promise(() => {});
			};
			await window.flush();
		});
		const slider = page.getByRole("slider");
		await slider.fill("230");
		await expect(slider).toHaveValue("240");
		const action = page.getByLabel("Then", { exact: true });
		const add = page.getByRole("button", { name: "Add rule", exact: true });
		await action.fill("Draft A");
		await add.click();
		await action.fill("Draft B");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 2);
		await page.evaluate(async () => {
			window.adds[0].reject(new Error("Add failed"));
			await window.flush();
		});
		await page.waitForFunction(() => window.refreshCalls === 1);
		await page.evaluate(async () => {
			window.adds[1].resolve(window.ruleRow({ ...window.adds[1].data, id: "r100" }));
			await window.flush();
		});
		const switches = page.getByRole("button", { name: "Rule enabled" });
		await expect(switches).toHaveCount(6);
		await expect(slider).toHaveValue("240");
		await page.evaluate(async () => {
			window.loadRules([...window.seedRules]);
			window.loadLimits([{ ...window.adLimit, value: 240 }]);
			await window.flush();
		});
		await expect(switches).toHaveCount(6);
		await expect(page.getByText("then Draft B", { exact: true })).toHaveCount(1);
		await expect(slider).toHaveValue("240");
		assert.equal(await page.evaluate(() => window.refreshCalls), 1);

		await action.fill("Draft C");
		await add.click();
		await page.waitForFunction(() => window.adds.length === 3);
		await page.evaluate(async () => {
			window.adds[2].reject(new Error("Add failed"));
			await window.flush();
		});
		await page.waitForFunction(() => window.refreshCalls === 2);
		await switches.first().click();
		await expect(switches.first()).toHaveAttribute("aria-pressed", "false");
		await slider.fill("250");
		await expect(slider).toHaveValue("260");
		await page.evaluate(async () => {
			window.loadRules([...window.seedRules]);
			window.loadLimits([{ ...window.adLimit, value: 240 }]);
			await window.flush();
		});
		await expect(switches).toHaveCount(5);
		await expect(switches.first()).toHaveAttribute("aria-pressed", "false");
		await expect(slider).toHaveValue("260");
		await page.evaluate(async () => {
			window.loadRules([...window.seedRules]);
			window.loadLimits([{ ...window.adLimit, value: 200 }]);
			await window.flush();
		});
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
		await expect(switches.first()).toHaveAttribute("aria-pressed", "false");
		await expect(slider).toHaveValue("260");
	});
});

test("snapshot: reversed add responses keep numeric rule order before pending rows", async () => {
	await withPage(async (page) => {
		await holdAdds(page);
		await page.evaluate(async () => {
			window.loadRules([
				window.ruleRow({ id: "r1", action: "First seed" }),
				window.ruleRow({ id: "r2", action: "Second seed" }),
			]);
			window.refreshCalls = 0;
			window.refresh = async () => {
				window.refreshCalls += 1;
			};
			await window.flush();
		});
		const action = page.getByLabel("Then", { exact: true });
		const add = page.getByRole("button", { name: "Add rule", exact: true });
		for (const draft of ["Earlier saved", "Later saved", "Still pending"]) {
			await action.fill(draft);
			await add.click();
		}
		await page.waitForFunction(() => window.adds.length === 3);
		await page.evaluate(async () => {
			window.adds[1].resolve(window.ruleRow({ ...window.adds[1].data, id: "r101" }));
			await window.flush();
		});
		await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(5);
		await page.evaluate(async () => {
			window.adds[0].resolve(window.ruleRow({ ...window.adds[0].data, id: "r100" }));
			await window.flush();
		});
		const rows = page.locator('section[aria-label="Rules"] [data-loop="rules"] > div');
		await expect(rows).toHaveCount(5);
		for (const [index, text] of [
			"First seed",
			"Second seed",
			"Earlier saved",
			"Later saved",
			"Still pending",
		].entries()) {
			await expect(rows.nth(index)).toContainText(text);
		}
		assert.equal(await page.evaluate(() => window.refreshCalls), 0);
	});
});

test("snapshot: a refresh that started earlier does not replace a newer write", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount());
		await page.evaluate(async () => {
			window.loadRules([window.ruleRow({ id: "r1", action: "Seed", on: true })]);
			window.loadLimits([
				{
					id: "lim-ads",
					key: "policy.daily_ad_cap",
					label: "Total ad spend per day",
					min: 0,
					max: 1000,
					step: 10,
					value: 200,
				},
			]);
			window.held = new Promise((resolve) => {
				window.releaseRefresh = resolve;
			});
			window.refresh = () => window.held;
			window.failNext = false;
			window.send = (data) => {
				window.calls.push(data);
				if (window.failNext) {
					window.failNext = false;
					return Promise.reject(new Error("fail"));
				}
				if (typeof data.value === "number") return Promise.resolve({ key: data.key, value: data.value });
				return Promise.resolve(window.ruleRow(data));
			};
			await window.flush();
		});
		const slider = page.getByRole("slider");
		await page.evaluate(() => {
			window.failNext = true;
		});
		await slider.fill("210");
		await page.evaluate(() => window.flush());
		await slider.fill("260");
		await expect(slider).toHaveValue("260");
		const rule = page.getByRole("button", { name: "Rule enabled" });
		await rule.click();
		await expect(rule).toHaveAttribute("aria-pressed", "false");
		await page.evaluate(async () => {
			window.releaseRefresh();
			await window.flush();
			window.loadRules([window.ruleRow({ id: "r1", action: "Seed", on: true })]);
			window.loadLimits([
				{
					id: "lim-ads",
					key: "policy.daily_ad_cap",
					label: "Total ad spend per day",
					min: 0,
					max: 1000,
					step: 10,
					value: 200,
				},
			]);
			await window.flush();
		});
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
		await expect(slider).toHaveValue("260");
		await expect(rule).toHaveAttribute("aria-pressed", "false");
	});
});

test("a failed recovery read makes the next write and the next loader read once", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => window.mount());
		await page.evaluate(async () => {
			window.loadLimits([
				{
					id: "lim-ads",
					key: "policy.daily_ad_cap",
					label: "Total ad spend per day",
					min: 0,
					max: 1000,
					step: 10,
					value: 200,
				},
			]);
			window.refreshCalls = 0;
			window.refresh = async () => {
				window.refreshCalls += 1;
				window.fail();
			};
			window.failNext = false;
			window.send = (data) => {
				window.calls.push(data);
				if (window.failNext) {
					window.failNext = false;
					return Promise.reject(new Error("fail"));
				}
				if (typeof data.value === "number") return Promise.resolve({ key: data.key, value: data.value });
				return Promise.resolve(window.ruleRow(data));
			};
			await window.flush();
		});
		const slider = page.getByRole("slider");
		await page.evaluate(() => {
			window.failNext = true;
		});
		await slider.fill("210");
		await page.waitForFunction(() => window.refreshCalls === 1);
		await page.evaluate(() => window.flush());
		assert.equal(await page.evaluate(() => window.refreshCalls), 1);
		await slider.fill("260");
		await page.waitForFunction(() => window.refreshCalls === 2);
		await page.evaluate(() => window.flush());
		assert.equal(await page.evaluate(() => window.refreshCalls), 2);
		await page.getByRole("button", { name: "Leave rules" }).click();
		await page.getByRole("button", { name: "Return to rules" }).click();
		await page.waitForFunction(() => window.refreshCalls === 3);
		await page.evaluate(() => window.flush());
		assert.equal(await page.evaluate(() => window.refreshCalls), 3);
	});
});

const snapshotAxes = [
	{ kind: "rule" },
	{ kind: "limit", id: "lim-refund", initial: 50, saved: 70, later: 90 },
	{ kind: "limit", id: "lim-ads", initial: 200, saved: 240, later: 260 },
	{ kind: "limit", id: "lim-reorder", initial: 500, saved: 600, later: 700 },
];

async function seedSnapshot(page) {
	await page.evaluate(() => window.mount());
	await page.evaluate(async () => {
		window.seedRules = [window.ruleRow({ id: "r1", action: "Seed", on: true })];
		window.seedLimits = [
			{ id: "lim-refund", key: "policy.refund_auto_limit", label: "Refund", min: 0, max: 200, step: 5, value: 50 },
			{ id: "lim-ads", key: "policy.daily_ad_cap", label: "Ads", min: 0, max: 1000, step: 10, value: 200 },
			{ id: "lim-reorder", key: "policy.reorder_limit", label: "Reorder", min: 0, max: 2000, step: 50, value: 500 },
		];
		window.loadRules(window.seedRules);
		window.loadLimits(window.seedLimits);
		window.refreshCalls = 0;
		window.refresh = async () => {
			window.refreshCalls += 1;
		};
		await window.flush();
	});
	await expect(page.getByRole("slider")).toHaveCount(3);
}

async function saveSnapshotAxis(page, axis) {
	if (axis.kind === "rule") {
		await page.getByRole("button", { name: "Rule enabled" }).first().click();
		await expect(page.getByRole("button", { name: "Rule enabled" }).first()).toHaveAttribute("aria-pressed", "false");
	} else {
		await page.locator(`#${axis.id}`).fill(String(axis.saved));
		await expect(page.locator(`#${axis.id}`)).toHaveValue(String(axis.saved));
	}
	await page.evaluate(() => window.flush());
}

for (const axis of snapshotAxes) {
	const name = axis.id ?? "rules";
	test(`snapshot: a held dock read preserves a saved ${name}`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.dockRead = window.beginRulesRead();
			});
			await saveSnapshotAxis(page, axis);
			if (axis.kind === "rule") {
				await page.getByLabel("Then", { exact: true }).fill("Saved new rule");
				await page.getByRole("button", { name: "Add rule", exact: true }).click();
				await page.evaluate(() => window.flush());
				await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(2);
			}
			await page.evaluate(async () => {
				window.dockRead.loadRules([...window.seedRules]);
				window.dockRead.loadLimits(window.seedLimits.map((row) => ({ ...row })));
				await window.flush();
			});
			if (axis.kind === "rule") {
				await expect(page.getByRole("button", { name: "Rule enabled" }).first()).toHaveAttribute(
					"aria-pressed",
					"false",
				);
				await expect(page.getByText("then Saved new rule", { exact: true })).toHaveCount(1);
			} else {
				await expect(page.locator(`#${axis.id}`)).toHaveValue(String(axis.saved));
			}
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
		});
	});

	test(`snapshot: a fresh recovery read accepts later server ${name}`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.send = (data) => {
					if (typeof data.action === "string") return Promise.reject(new Error("Add failed"));
					if (typeof data.value === "number") return Promise.resolve({ key: data.key, value: data.value });
					return Promise.resolve(window.ruleRow(data));
				};
				window.refresh = () => {
					window.refreshCalls += 1;
					if (window.refreshCalls === 1) {
						window.fail();
						return Promise.resolve();
					}
					window.recoveryRead = { loadRules: window.loadRules, loadLimits: window.loadLimits };
					return new Promise(() => {});
				};
			});
			await page.getByLabel("Then", { exact: true }).fill("Rejected draft");
			await page.getByRole("button", { name: "Add rule", exact: true }).click();
			await page.waitForFunction(() => window.refreshCalls === 1);
			await page.evaluate(() => window.flush());
			await saveSnapshotAxis(page, axis);
			await page.waitForFunction(() => window.refreshCalls === 2);
			await page.evaluate(async (axis) => {
				window.recoveryRead.loadRules([...window.seedRules, window.ruleRow({ id: "r9", action: "Server rule" })]);
				window.recoveryRead.loadLimits(
					window.seedLimits.map((row) => (row.id === axis.id ? { ...row, value: axis.later } : { ...row })),
				);
				await window.flush();
			}, axis);
			if (axis.kind === "rule") {
				await expect(page.getByRole("button", { name: "Rule enabled" }).first()).toHaveAttribute(
					"aria-pressed",
					"true",
				);
				await expect(page.getByText("then Server rule", { exact: true })).toHaveCount(1);
			} else {
				await expect(page.locator(`#${axis.id}`)).toHaveValue(String(axis.later));
			}
			assert.equal(await page.evaluate(() => window.refreshCalls), 2);
		});
	});
}

for (const axis of [...snapshotAxes, { kind: "add" }]) {
	test(`snapshot: an unmounted ${axis.id ?? axis.kind} response survives an older initial page`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.heldWrites = [];
				window.send = (data) => new Promise((resolve) => window.heldWrites.push({ data, resolve }));
			});
			if (axis.kind === "add") {
				await page.getByLabel("Then", { exact: true }).fill("Saved while away");
				await page.getByRole("button", { name: "Add rule", exact: true }).click();
			} else if (axis.kind === "rule") {
				await page.getByRole("button", { name: "Rule enabled" }).click();
			} else {
				await page.locator(`#${axis.id}`).fill(String(axis.saved));
			}
			await page.waitForFunction(() => window.heldWrites.length === 1);
			await page.getByRole("button", { name: "Leave rules" }).click();
			await expect(page.getByRole("heading", { name: "Rules and limits" })).toHaveCount(0);
			await page.evaluate(async () => {
				window.returnRead = window.beginRulesRead();
				const write = window.heldWrites[0];
				write.resolve(
					typeof write.data.value === "number"
						? { key: write.data.key, value: write.data.value }
						: window.ruleRow(write.data),
				);
				await window.flush();
			});
			await page.evaluate(async () => {
				window.returnRead.loadRules([...window.seedRules]);
				window.returnRead.loadLimits(window.seedLimits.map((row) => ({ ...row })));
				await window.flush();
			});
			await page.getByRole("button", { name: "Return to rules" }).click();
			if (axis.kind === "add") {
				await expect(page.getByText("then Saved while away", { exact: true })).toHaveCount(1);
				await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(2);
			} else if (axis.kind === "rule") {
				await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveAttribute("aria-pressed", "false");
			} else {
				await expect(page.locator(`#${axis.id}`)).toHaveValue(String(axis.saved));
			}
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
		});
	});
}

async function actOnRecoveryAxis(page, axis) {
	if (axis.kind === "add") {
		await page.getByLabel("Then", { exact: true }).fill("Recovery draft");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
	} else if (axis.kind === "rule") {
		await page.getByRole("button", { name: "Rule enabled" }).first().click();
	} else {
		await page.locator(`#${axis.id}`).fill(String(axis.saved));
	}
	await page.evaluate(() => window.flush());
}

for (const axis of [...snapshotAxes, { kind: "add" }]) {
	const name = axis.id ?? axis.kind;

	test(`recovery ${name}: failed GET stays flagged until the next action reads once`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.send = () => Promise.reject(new Error("POST failed"));
				window.refresh = async () => {
					window.refreshCalls += 1;
					window.fail();
				};
			});
			await actOnRecoveryAxis(page, axis);
			await page.waitForFunction(() => window.refreshCalls === 1);
			assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			assert.equal(await page.evaluate(() => window.refreshCalls), 1);
			await page.evaluate(() => {
				window.send = async (data) =>
					typeof data.value === "number" ? { key: data.key, value: data.value } : window.ruleRow(data);
				window.refresh = async () => {
					window.refreshCalls += 1;
					window.finish();
				};
			});
			await actOnRecoveryAxis(page, axis);
			await page.waitForFunction(() => window.refreshCalls === 2 && !window.queue.readNeeded());
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			assert.equal(await page.evaluate(() => window.refreshCalls), 2);
		});
	});

	test(`recovery ${name}: navigation satisfies a timed-out write without another GET`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.send = () => new Promise(() => {});
				window.refresh = async () => {
					window.refreshCalls += 1;
					window.fail();
				};
			});
			await actOnRecoveryAxis(page, axis);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await page.waitForFunction(() => window.refreshCalls === 1 && window.queue.readNeeded());
			await page.getByRole("button", { name: "Leave rules" }).click();
			await page.evaluate(async () => {
				const navigation = window.beginRulesRead();
				navigation.finish();
				await navigation.done;
			});
			assert.equal(await page.evaluate(() => window.queue.readNeeded()), false);
			await page.getByRole("button", { name: "Return to rules" }).click();
			await page.evaluate(() => window.flush());
			assert.equal(await page.evaluate(() => window.refreshCalls), 1);
		});
	});

	test(`recovery ${name}: an older GET cannot clear a later failure`, async () => {
		await withPage(async (page) => {
			await seedSnapshot(page);
			await page.evaluate(() => {
				window.oldRead = window.beginRulesRead();
				window.counterBeforeFailure = window.queue.rulesWriteCounter();
				window.send = () => Promise.reject(new Error("POST failed"));
				window.refresh = async () => {
					window.refreshCalls += 1;
					window.fail();
				};
			});
			await actOnRecoveryAxis(page, axis);
			await page.waitForFunction(() => window.refreshCalls === 1);
			await page.evaluate(async () => {
				window.afterFailure = window.queue.rulesWriteCounter();
				window.oldRead.finish();
				await window.oldRead.done;
			});
			assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
			assert.equal(await page.evaluate(() => window.afterFailure > window.counterBeforeFailure), true);
			assert.equal(await page.evaluate(() => window.queue.rulesWriteCounter() === window.afterFailure), true);
			assert.equal(await page.evaluate(() => window.refreshCalls), 1);
			await page.evaluate(async () => {
				const dock = window.beginRulesRead();
				dock.finish();
				await dock.done;
			});
			assert.equal(await page.evaluate(() => window.queue.readNeeded()), false);
		});
	});
}

test("recovery: a timed-out GET records a failure and keeps the held snapshot", async () => {
	await withPage(async (page) => {
		await seedSnapshot(page);
		await page.evaluate(() => {
			window.beforeRead = window.queue.rulesRecoveryGeneration();
			window.timedRead = window.beginRulesRead();
			window.readSettled = "";
			void window.timedRead.done.then(
				(page) => {
					window.readSettled = "kept";
					window.keptRules = page.rules.length;
				},
				() => {
					window.readSettled = "rejected";
				},
			);
		});
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await page.waitForFunction(() => window.readSettled === "kept" && window.queue.readNeeded());
		assert.equal(await page.evaluate(() => window.queue.rulesRecoveryGeneration() > window.beforeRead), true);
		assert.equal(await page.evaluate(() => window.keptRules), 1);
		await page.evaluate(async () => {
			window.timedRead.finish();
			await window.flush();
		});
		assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
		assert.equal(await page.evaluate(() => window.refreshCalls), 0);
	});
});

test("recovery: a timed-out GET with no snapshot still rejects", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.readSource = () => new Promise(() => {});
			window.beforeRead = window.queue.rulesRecoveryGeneration();
			window.timedRead = window.loadRulesSnapshot();
			window.readRejected = false;
			void window.timedRead.catch(() => {
				window.readRejected = true;
			});
		});
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		assert.equal(await page.evaluate(() => window.readRejected && window.queue.readNeeded()), true);
		assert.equal(await page.evaluate(() => window.queue.rulesRecoveryGeneration() > window.beforeRead), true);
	});
});

test("recovery: server reads hold no browser recovery state", async () => {
	const server = await build({
		stdin: {
			contents: `
				import { loadRulesSnapshot } from "./apps/web/src/screens/rules/loader.ts";
				import * as queue from "./apps/web/src/screens/rules/write-queue.ts";
				globalThis.loader = loadRulesSnapshot;
				globalThis.queue = queue;
			`,
			resolveDir: process.cwd(),
			loader: "ts",
		},
		bundle: true,
		write: false,
		format: "iife",
		plugins: [
			{
				name: "server-read-boundary",
				setup(build) {
					build.onResolve({ filter: /^#\/server\/rules.ts$/ }, ({ path }) => ({ path, namespace: "boundary" }));
					build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
						contents: `
					export const loadRulesPage = () => globalThis.readSource();
					export const setRuleEnabled = () => {};
					export const setRuleLimit = () => {};
				`,
					}));
				},
			},
		],
	});
	const worker = { readSource: async () => ({ rules: [], limits: [] }) };
	runInNewContext(server.outputFiles[0].text, worker);
	worker.queue.markReadFailed();
	worker.queue.watchSignedInUser("account-a");
	worker.queue.watchSignedInUser("account-b");
	assert.equal(worker.queue.readNeeded(), false);
	assert.equal(worker.queue.rulesRecoveryGeneration(), 0);
	assert.equal(worker.queue.rulesAccountEpoch(), 0);
	assert.equal((await worker.loader()).readCounter, 0);
	worker.readSource = async () => {
		throw new Error("GET failed");
	};
	await assert.rejects(worker.loader(), /GET failed/);
	assert.equal(worker.queue.readNeeded(), false);
	assert.equal(worker.queue.rulesRecoveryGeneration(), 0);
});

const overlappingRecoveries = [
	{ first: snapshotAxes[1], second: snapshotAxes[2], shared: snapshotAxes[3] },
	{ first: snapshotAxes[0], second: { kind: "add" }, shared: snapshotAxes[1] },
	{ first: snapshotAxes[3], second: snapshotAxes[0], shared: snapshotAxes[2] },
];

for (const { first, second, shared } of overlappingRecoveries) {
	for (const outcome of ["success", "failure"]) {
		test(`recovery: ${first.id ?? first.kind} then ${second.id ?? second.kind} gets two reads (${outcome})`, async () => {
			await withPage(async (page) => {
				await seedSnapshot(page);
				await page.evaluate(() => {
					window.recoveries = [];
					window.failWrite = true;
					window.send = async (data) => {
						if (window.failWrite) throw new Error("POST failed");
						return typeof data.value === "number" ? { key: data.key, value: data.value } : window.ruleRow(data);
					};
					window.refresh = () => {
						window.refreshCalls += 1;
						window.recoveries.push({
							done: window.done,
							finish: window.finish,
							fail: window.fail,
							loadRules: window.loadRules,
							loadLimits: window.loadLimits,
						});
						return window.done.catch(() => undefined);
					};
				});
				await actOnRecoveryAxis(page, first);
				await page.waitForFunction(() => window.refreshCalls === 1);
				await page.evaluate(() => {
					window.failWrite = false;
				});
				await actOnRecoveryAxis(page, shared);
				assert.equal(await page.evaluate(() => window.refreshCalls), 1);
				await page.evaluate(() => {
					window.failWrite = true;
				});
				await actOnRecoveryAxis(page, second);
				assert.equal(await page.evaluate(() => window.refreshCalls), 2);
				await page.evaluate(async () => {
					window.recoveries[0].loadRules([...window.seedRules]);
					window.recoveries[0].loadLimits(window.seedLimits.map((row) => ({ ...row })));
					await window.recoveries[0].done;
					await window.flush();
				});
				assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
				await page.evaluate(() => {
					window.failWrite = false;
				});
				await actOnRecoveryAxis(page, { ...shared, saved: shared.later });
				assert.equal(await page.evaluate(() => window.refreshCalls), 2);
				await page.evaluate(async (outcome) => {
					const latest = window.recoveries[1];
					if (outcome === "success") latest.finish();
					else latest.fail();
					await latest.done.catch(() => undefined);
					await window.flush();
				}, outcome);
				assert.equal(await page.evaluate(() => window.queue.readNeeded()), outcome === "failure");
				await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
				assert.equal(await page.evaluate(() => window.refreshCalls), 2);
			});
		});
	}
}

test("signing out and into another account drops rules state and ignores the old response", async () => {
	await withPage(async (page) => {
		await seedSnapshot(page);
		await page.evaluate(() => {
			window.queue.watchSignedInUser("account-a");
			window.hold = false;
			window.held = [];
			window.send = (data) => {
				window.calls.push(data);
				if (window.hold) {
					return new Promise((resolve, reject) => {
						window.held.push({ data, resolve, reject });
					});
				}
				if (typeof data.value === "number") return Promise.resolve({ key: data.key, value: data.value });
				return Promise.resolve(window.ruleRow(data));
			};
		});
		await page.locator("#lim-ads").fill("240");
		await page.evaluate(() => window.flush());
		await expect(page.locator("#lim-ads")).toHaveValue("240");
		await page.getByLabel("Then", { exact: true }).fill("Account A saved");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.evaluate(() => window.flush());
		await expect(page.getByText("then Account A saved", { exact: true })).toHaveCount(1);
		await page.evaluate(() => {
			window.hold = true;
		});
		await page.getByLabel("Then", { exact: true }).fill("Account A pending");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page.locator("#lim-ads").fill("260");
		await page.waitForFunction(() => window.held.length === 2);
		await expect(page.getByText("then Account A pending", { exact: true })).toHaveCount(1);
		await expect(page.locator("#lim-ads")).toHaveValue("260");
		await page.evaluate(() => {
			window.queue.markReadFailed();
			window.staleRead = new Promise((resolve) => {
				window.finishStale = () => resolve({ rules: [], limits: [] });
			});
			window.readSource = () => window.staleRead;
			window.staleRejected = false;
			window.staleDone = window.loadRulesSnapshot();
			void window.staleDone.catch(() => {
				window.staleRejected = true;
			});
		});
		assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
		await page.evaluate(async () => {
			window.queue.watchSignedInUser("account-a");
			await window.flush();
		});
		await expect(page.getByText("then Account A pending", { exact: true })).toHaveCount(1);
		assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);

		await page.evaluate(async () => {
			window.queue.watchSignedInUser(null);
			await window.flush();
		});
		await expect(page.getByText("then Account A pending", { exact: true })).toHaveCount(0);
		await expect(page.getByText("then Account A saved", { exact: true })).toHaveCount(0);
		await expect(page.locator("#lim-ads")).toHaveValue("200");
		assert.equal(await page.evaluate(() => window.queue.readNeeded()), false);
		assert.equal(await page.evaluate(() => window.queue.rulesWriteCounter()), 0);
		assert.deepEqual(await page.evaluate(() => window.queue.rulesWrittenSince(0)), { rules: [], limits: [] });

		await page.evaluate(async () => {
			window.queue.watchSignedInUser("account-b");
			window.queue.markReadFailed();
			window.afterSwitch = {
				needed: window.queue.readNeeded(),
				counter: window.queue.rulesWriteCounter(),
				generation: window.queue.rulesRecoveryGeneration(),
				refreshCalls: window.refreshCalls,
			};
			await window.flush();
		});
		const afterSwitch = await page.evaluate(() => window.afterSwitch);
		assert.equal(afterSwitch.needed, true);
		assert.equal(afterSwitch.counter, 0);
		await page.evaluate(async () => {
			const pending = window.held.find((item) => typeof item.data.action === "string");
			const limit = window.held.find((item) => typeof item.data.value === "number");
			pending.reject(new Error("Account A failed"));
			limit.resolve({ key: limit.data.key, value: limit.data.value });
			window.finishStale();
			await window.staleDone.catch(() => undefined);
			await window.flush();
		});
		await expect(page.getByLabel("Then", { exact: true })).toHaveValue("");
		await expect(page.getByText("then Account A pending", { exact: true })).toHaveCount(0);
		await expect(page.getByText("then Account A saved", { exact: true })).toHaveCount(0);
		await expect(page.locator("#lim-ads")).toHaveValue("200");
		assert.equal(await page.evaluate(() => window.staleRejected), true);
		assert.equal(await page.evaluate(() => window.queue.readNeeded()), true);
		assert.equal(await page.evaluate(() => window.queue.rulesWriteCounter()), afterSwitch.counter);
		assert.equal(await page.evaluate(() => window.queue.rulesRecoveryGeneration()), afterSwitch.generation);
		assert.equal(await page.evaluate(() => window.refreshCalls), afterSwitch.refreshCalls);
		assert.deepEqual(await page.evaluate(() => window.queue.rulesWrittenSince(0)), { rules: [], limits: [] });
	});
});

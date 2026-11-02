import assert from "node:assert/strict";
import test from "node:test";
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
			import * as queue from "./apps/web/src/screens/rules/write-queue.ts";
			window.queue = queue;
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
				const page = useMemo(() => ({ rules, limits }), [rules, limits]);
				window.loadRules = setRules;
				window.loadLimits = setLimits;
				const [ruleForm, setRuleForm] = useState({
					when: "A new order arrives", agent: "orders", action: "", approval: "Ask first"
				});
				return <WorkspaceContext.Provider value={{
					ruleForm, setRuleForm, refresh: () => window.refresh(),
					frame: { masterName: "Master", agents: [{id: "orders", name: "Orders"}, {id: "support", name: "Support"}] },
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
					export const setRuleEnabled = ({data, signal}) => window.send(data, signal);
					export const setRuleLimit = ({data, signal}) => window.send(data, signal);
					export const addWorkspaceRule = ({data, signal}) => window.send(data, signal);
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
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
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
			assert.equal(await page.evaluate(() => window.refreshCalls), 0);
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.initial);
			assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
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
					if (outcome === "reject") throw new Error("Read failed");
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
		await expect(switches.first()).toHaveAttribute("aria-pressed", "true");
		await expect(slider).toHaveValue("200");
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

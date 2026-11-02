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
				const [showRules, setShowRules] = useState(true);
				const [rules, setRules] = useState([]);
				window.loadRules = setRules;
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
					{showRules && <RulesScreen page={{ rules, limits: [] }} />}
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
		window.write = (value, loaded) =>
			window.queue[kind === "rule" ? "queueRule" : "queueLimit"]("test-key", value, loaded, () => window.refresh());
		window.shown = (loaded) => window.queue[kind === "rule" ? "shownOn" : "shownLimit"]("test-key", loaded);
	}, values);
}

for (const values of cases) {
	test(`${values.kind}: a confirmed idle flight yields to later loader reads`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			assert.equal(
				await page.evaluate(async () => {
					const { initial, first } = window.values;
					window.refresh = () =>
						new Promise((resolve) => {
							window.releaseRefresh = resolve;
						});
					window.write(first, initial);
					await window.flush();
					return window.shown(initial);
				}),
				values.first,
			);
			assert.equal(
				await page.evaluate(async () => {
					window.shown(window.values.first);
					window.releaseRefresh();
					await window.flush();
					return window.shown(window.values.initial);
				}),
				values.first,
			);
			assert.equal(await page.evaluate(() => window.shown(window.values.first)), values.first);
			assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.initial);
		});
	});

	for (const finish of ["settle", "timeout"]) {
		test(`${values.kind}: the last value queued during refresh goes out after ${finish}`, async () => {
			await withPage(async (page) => {
				await configure(page, values);
				await page.evaluate(async () => {
					const { initial, first, last } = window.values;
					window.refresh = () =>
						new Promise((resolve) => {
							window.releaseRefresh = resolve;
						});
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
				else
					await page.evaluate(async () => {
						window.releaseRefresh();
						await window.flush();
					});
				assert.deepEqual(
					await page.evaluate(() => window.calls),
					values.kind === "rule"
						? [
								{ id: "test-key", on: values.first },
								{ id: "test-key", on: values.last },
							]
						: [
								{ key: "test-key", value: values.first },
								{ key: "test-key", value: values.last },
							],
				);
				await page.evaluate(async () => {
					window.releaseRefresh();
					await window.flush();
				});
				assert.equal(await page.evaluate(() => window.shown(window.values.last)), values.last);
				assert.equal(await page.evaluate(() => window.shown(window.values.newer)), values.newer);
			});
		});
	}

	test(`${values.kind}: a failed write after refresh timeout preserves confirmed storage`, async () => {
		await withPage(async (page) => {
			await configure(page, values);
			await page.evaluate(async () => {
				window.stored = window.values.initial;
				window.send = async (data) => {
					window.stored = data.on ?? data.value;
				};
				window.refresh = () => new Promise(() => {});
				window.write(window.values.first, window.values.initial);
				await window.flush();
			});
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.first);
			await page.evaluate(async () => {
				window.send = async () => {
					throw new Error("Write failed");
				};
				window.refresh = async () => {};
				window.write(window.values.last, window.values.initial);
				await window.flush();
			});
			assert.equal(await page.evaluate(() => window.shown(window.values.initial)), values.first);
			assert.equal(await page.evaluate(() => window.stored), values.first);
		});
	});
}

test("limit: a newer read reconciles without first observing the confirmed value", async () => {
	await withPage(async (page) => {
		await configure(page, cases[0]);
		await page.evaluate(async () => {
			window.write(70, 50);
			await window.flush();
		});
		assert.equal(await page.evaluate(() => window.shown(50)), 70);
		assert.equal(await page.evaluate(() => window.shown(80)), 80);
		assert.equal(await page.evaluate(() => window.shown(50)), 50);
	});
});

for (const refreshResult of ["timeout", "reject"]) {
	for (const newer of ["", "A newer action"]) {
		test(`add rule: refresh ${refreshResult} after POST success preserves the cleared draft or newer typing (${newer})`, async () => {
			await withPage(async (page) => {
				await page.evaluate(() => {
					window.send = async (data) => {
						window.calls.push(data);
						return { id: "r100" };
					};
					window.refresh = () =>
						new Promise((_resolve, reject) => {
							window.rejectRefresh = reject;
						});
					window.mount();
				});
				const action = page.getByLabel("Then", { exact: true });
				await action.fill("Handle the order");
				const add = page.getByRole("button", { name: "Add rule", exact: true });
				await add.click();
				await page.waitForFunction(() => window.rejectRefresh);
				await expect(action).toHaveValue("");
				if (newer) await action.fill(newer);
				if (refreshResult === "timeout") await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
				else
					await page.evaluate(async () => {
						window.rejectRefresh(new Error("Read failed"));
						await window.flush();
					});
				await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(1);
				await expect(action).toHaveValue(newer);
				if (!newer) await add.click();
				assert.equal(await page.evaluate(() => window.calls.length), 1);
			});
		});
	}
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
				else {
					window.loadRules([{ ...first.data, id: "r100", on: true, when: "a new order arrives" }]);
					first.resolve({ id: "r100" });
				}
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

test("add rule: identical submissions keep each row until its own read confirms it", async () => {
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
			window.adds[0].resolve({ id: "r100" });
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
		await expect(action).toHaveValue("");
		assert.equal(await page.evaluate(() => window.adds[1].signal.aborted), false);
		await page.evaluate(async () => {
			window.savedA = { ...window.adds[0].data, id: "r100", on: true, when: "a new order arrives" };
			window.loadRules([window.savedA]);
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
		await page.evaluate(async () => {
			window.adds[1].resolve({ id: "r101" });
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
		await page.evaluate(async () => {
			window.loadRules([window.savedA, { ...window.savedA, id: "r101" }]);
			await window.flush();
		});
		await expect(switches).toHaveCount(2);
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
				return { id: "r100" };
			};
			window.adds[0].resolve({ id: "r100" });
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

test("add rule: a saved row stays while the refresh hangs", async () => {
	await withPage(async (page) => {
		await page.evaluate(() => {
			window.send = async (data) => {
				window.calls.push(data);
				return { id: "r100" };
			};
			window.refresh = () => new Promise(() => {});
			window.mount();
		});
		await page.getByLabel("Then", { exact: true }).fill("Handle the order");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		const toggles = page.getByRole("button", { name: "Rule enabled" });
		await expect(toggles).toHaveCount(1);
		await page.waitForFunction(() => window.calls.length === 1);
		await page.evaluate(() => window.flush());
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await page.evaluate(() => window.flush());
		await expect(toggles).toHaveCount(1);
		await page.evaluate(async () => {
			window.loadRules([
				{
					id: "r100",
					when: "a new order arrives",
					agent: "orders",
					action: "Handle the order",
					approval: "Ask first",
					on: true,
				},
			]);
			await window.flush();
		});
		await expect(toggles).toHaveCount(1);
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
					return new Promise((_resolve, reject) => { window.rejectToggle = reject; });
				};
				window.adds[0].resolve({ id: "r100" });
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
			await page.evaluate(() => { window.send = async (data) => { window.calls.push(data); }; });
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await page.evaluate(() => window.flush());
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			await expect(toggle).toHaveAttribute("aria-pressed", "false");
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", "true");
			assert.deepEqual(await page.evaluate(() => window.calls), [
				{ id: "r100", on: false }, { id: "r100", on: false }, { id: "r100", on: true },
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
					window.loadRules([{ id: "r1", when: "a new order arrives", agent: "orders", action: "Server row", approval: "Ask first", on: true }]);
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
				// Complete B before its own write deadline. Its saved row must survive the hung reads.
				await page.evaluate(async () => {
					window.adds[1].resolve({ id: "r100" });
					await window.flush();
				});
				await page.waitForFunction(() => window.refreshCalls === 2);
				await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
			}
			await expect(page.locator("section[aria-label='Rules']").getByText("Draft B", { exact: false })).toHaveCount(1);
			await expect(action).toHaveValue("");
			await expect(page.getByRole("button", { name: "Rule enabled" })).toHaveCount(refreshResult === "success" ? 2 : 1);
			if (refreshResult === "success") await expect(page.getByText("Server row", { exact: false })).toHaveCount(1);
			assert.deepEqual(await page.evaluate(() => window.calls), []);
		});
	});
}

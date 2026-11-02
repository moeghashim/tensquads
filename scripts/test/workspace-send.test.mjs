import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { createRepositories, readWorkspaceFrame, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { and, eq } from "drizzle-orm";
import * as esbuild from "esbuild";
import { PENDING_TASK_WINDOW_MS } from "../../packages/adapters/src/neon/commands/conversation.ts";
import { openPglite } from "../../packages/adapters/test/pglite.ts";
import { replaceDemoAccount } from "../../packages/seed/src/demo-account.ts";

const question = "How did ads do this week?";
const reply = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const bundle = await esbuild.build({
	stdin: {
		contents: `
   import React from "react";
   import { createRoot } from "react-dom/client";
   import { createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
   import { WorkspaceProvider } from "./apps/web/src/workspace/provider.tsx";
   import { Dock } from "./apps/web/src/workspace/dock.tsx";
   import { useWorkspace } from "./apps/web/src/workspace/context.ts";
   function Probe() {
    const value = useWorkspace();
    return <><Dock /><output id="pending">{String(value.pending)}</output>
     <output id="count">{value.approvalCount}</output></>;
   }
   const rootRoute = createRootRoute({component: Outlet});
   const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute, id: "_workspace",
    loader: async () => {
     if (window.holdLoader) await new Promise(resolve => { window.releaseLoader = resolve; });
     if (window.nextLoaderFrame) {
      const frame = window.nextLoaderFrame;
      window.nextLoaderFrame = undefined;
      return frame;
     }
     return window.readFrame();
    },
    component: () => <WorkspaceProvider frame={workspaceRoute.useLoaderData()}><Probe /></WorkspaceProvider>,
   });
   const overview = createRoute({getParentRoute: () => workspaceRoute, path: "/overview"});
   const router = createRouter({routeTree: rootRoute.addChildren([workspaceRoute.addChildren([overview])]),
    history: createMemoryHistory({initialEntries: ["/overview"]})});
   const invalidate = router.invalidate.bind(router);
   router.invalidate = (options) => {
    if (window.rejectRefresh) { window.rejectRefresh = false; return Promise.reject(new Error("Read failed")); }
    return invalidate(options);
   };
   window.router = router;
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
			name: "workspace-boundaries",
			setup(build) {
				build.onResolve({ filter: /^#\/server\/workspace.ts$/ }, ({ path }) => ({
					path,
					namespace: "boundary",
				}));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
					contents: `
     export const beginWorkspaceSend = ({data}) => window.beginSend(data);
     export const finishWorkspaceSend = ({data, signal}) => {
      if (window.holdFinish) {
       window.finishHeld = true;
       return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (!signal) return;
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
       });
      }
      return window.finishSend(data);
     };
    `,
				}));
			},
		},
	],
});

async function withDock(t, run) {
	t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T12:00:00Z") });
	const { db, close } = await openPglite();
	const browser = await chromium.launch({ headless: true });
	const scope = { accountId: "dock-regression", mode: "account" };
	const faults = { begin: false, finish: false };
	try {
		await replaceDemoAccount(db, scope.accountId, "clerk-dock-regression");
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.exposeFunction("beginSend", async (text) => {
			if (faults.begin) {
				faults.begin = false;
				throw new Error("Request failed");
			}
			return new Kernel(createRepositories(db)).beginSend(scope, text);
		});
		await page.exposeFunction("finishSend", async (taskId) => {
			const result = await new Kernel(createRepositories(db)).finishSend(scope, taskId);
			if (faults.finish) {
				faults.finish = false;
				await db
					.update(schema.approvals)
					.set({ status: "Declined" })
					.where(eq(schema.approvals.accountId, scope.accountId));
				throw new Error("Response lost");
			}
			return result;
		});
		await page.exposeFunction("readFrame", async () => {
			return readWorkspaceFrame(db, scope);
		});
		const mount = async () => {
			await page.setContent('<div id="root"></div>');
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
			await page.getByRole("button", { name: "Ask Master" }).click();
		};
		await mount();
		await run({ page, db, scope, faults, mount });
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
		await close();
	}
}

async function send(page) {
	await page.locator("#dock-input").fill(question);
	await page.getByRole("button", { name: "Send", exact: true }).click();
}

async function advanceReply(page) {
	await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
	await page.clock.fastForward(1400);
}

for (const newerDraft of ["", "A newer question"]) {
	test(`an ignored send ${newerDraft ? "keeps newer typing" : "restores the submitted draft"}`, async (t) => {
		await withDock(t, async ({ page }) => {
			await page.evaluate(() => {
				window.beginSend = () =>
					new Promise((resolve) => {
						window.releaseBegin = () => resolve({ kind: "ignored" });
					});
			});
			await send(page);
			await page.waitForFunction(() => window.releaseBegin);
			await expect(page.locator("#dock-input")).toHaveValue("");
			await expect(page.locator("#pending")).toHaveText("true");
			if (newerDraft) await page.locator("#dock-input").fill(newerDraft);
			await page.evaluate(() => window.releaseBegin());
			await expect(page.locator("#pending")).toHaveText("false");
			await expect(page.locator("#dock-input")).toHaveValue(newerDraft || question);
			await expect(page.locator("[data-loop='dockChat']").getByText(question, { exact: true })).toHaveCount(0);
		});
	});
}

test("reload during Working retains the first Task and a later send replies", async (t) => {
	await withDock(t, async ({ page, db, scope, mount }) => {
		await page.clock.install();
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.reload();
		await mount();
		await expect(page.locator("#pending")).toHaveText("false");
		t.mock.timers.tick(PENDING_TASK_WINDOW_MS + 1);
		await send(page);
		await advanceReply(page);
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#pending")).toHaveText("false");
		const events = await db
			.select()
			.from(schema.busEvents)
			.where(and(eq(schema.busEvents.accountId, scope.accountId), eq(schema.busEvents.fromAgent, "master")));
		const tasks = events
			.filter((event) => event.kind === "Task" && event.payload.from === "chat")
			.sort((left, right) => left.seq - right.seq);
		assert.equal(tasks.length, 2);
		const results = await db
			.select()
			.from(schema.busEvents)
			.where(and(eq(schema.busEvents.accountId, scope.accountId), eq(schema.busEvents.kind, "Result")));
		const generated = results.filter((event) => /^e\d+$/.test(event.id));
		assert.equal(generated.length, 1);
		assert.ok(generated[0].seq > tasks[1].seq);
	});
});

test("a lost finish response recovers the saved reply and approval count", async (t) => {
	await withDock(t, async ({ page, faults }) => {
		await page.clock.install();
		faults.finish = true;
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.evaluate(() => {
			window.holdLoader = true;
		});
		await advanceReply(page);
		await page.waitForFunction(() => window.releaseLoader);
		await expect(page.locator("#pending")).toHaveText("true");
		await page.evaluate(() => {
			window.holdLoader = false;
			window.releaseLoader();
		});
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#count")).toHaveText("1");
	});
});

test("a failed recovery read releases the send guard and older loaders cannot replace a send", async (t) => {
	await withDock(t, async ({ page, db, scope, faults }) => {
		await page.clock.install();
		faults.begin = true;
		await page.evaluate(() => {
			window.rejectRefresh = true;
		});
		await send(page);
		await expect(page.locator("#pending")).toHaveText("false");
		const older = await readWorkspaceFrame(db, scope);
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.evaluate((frame) => {
			window.nextLoaderFrame = frame;
			return window.router.invalidate({ sync: true });
		}, older);
		await expect(page.locator("[data-loop='dockChat']").getByText(question, { exact: true })).toBeVisible();
		await advanceReply(page);
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#pending")).toHaveText("false");
	});
});

test("saved bubbles stay while invalidation completes before the loader frame is rendered", async (t) => {
	await withDock(t, async ({ page }) => {
		await page.clock.install();
		await page.evaluate(() => {
			window.holdLoader = true;
			window.router.invalidate().then(() => {
				window.invalidated = true;
			});
		});
		await page.waitForFunction(() => window.invalidated && window.releaseLoader);
		await page.evaluate(() => {
			window.holdLoader = false;
			window.releaseLoader();
			window.releaseLoader = undefined;
		});
		await page.waitForFunction(() => !window.router.state.isLoading);
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.evaluate(() => {
			window.holdLoader = true;
		});
		await advanceReply(page);
		await page.waitForFunction(() => window.releaseLoader);
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#pending")).toHaveText("true");
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await page.evaluate(() => {
			window.holdLoader = false;
			window.releaseLoader();
		});
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
	});
});

test(
	"a finish request that never settles releases the guard and accepts another send",
	{ timeout: 90_000 },
	async (t) => {
		await withDock(t, async ({ page }) => {
			await page.clock.install();
			await page.evaluate(() => {
				const read = window.readFrame;
				window.reads = 0;
				window.readFrame = async () => {
					window.reads += 1;
					return read();
				};
				window.holdFinish = true;
				window.finishHeld = false;
			});
			await send(page);
			await advanceReply(page);
			await expect(page.locator("#pending")).toHaveText("true");
			await expect.poll(() => page.evaluate(() => window.finishHeld)).toBe(true);
			const readsBefore = await page.evaluate(() => window.reads);
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS);
			await expect(page.locator("#pending")).toHaveText("false");
			await expect(page.getByText("Marketing agent is working on it…")).toHaveCount(0);
			const readsAfter = await page.evaluate(() => window.reads);
			assert.ok(readsAfter > readsBefore);
			t.mock.timers.tick(PENDING_TASK_WINDOW_MS + 1);
			await page.evaluate(() => {
				window.holdFinish = false;
			});
			await send(page);
			await advanceReply(page);
			await expect(page.getByText(reply, { exact: true })).toBeVisible();
			await expect(page.locator("#pending")).toHaveText("false");
		});
	},
);

test(
	"a begin request that never settles releases the guard and accepts another send",
	{ timeout: 90_000 },
	async (t) => {
		await withDock(t, async ({ page }) => {
			await page.clock.install();
			await page.evaluate(() => {
				window.realBegin = window.beginSend;
				window.beginSend = () => new Promise(() => {});
			});
			await send(page);
			await expect(page.locator("#pending")).toHaveText("true");
			await page.clock.fastForward(PENDING_TASK_WINDOW_MS);
			await expect(page.locator("#pending")).toHaveText("false");
			await expect(page.getByText("Marketing agent is working on it…")).toHaveCount(0);
			await page.evaluate(() => {
				window.beginSend = window.realBegin;
			});
			await send(page);
			await advanceReply(page);
			await expect(page.getByText(reply, { exact: true })).toBeVisible();
			await expect(page.locator("#pending")).toHaveText("false");
		});
	},
);

test("a refresh that never settles releases the guard and accepts another send", { timeout: 90_000 }, async (t) => {
	await withDock(t, async ({ page }) => {
		await page.clock.install();
		await page.evaluate(() => {
			window.refreshHeld = false;
			window.realInvalidate = window.router.invalidate.bind(window.router);
			window.router.invalidate = () => {
				window.refreshHeld = true;
				return new Promise(() => {});
			};
		});
		await send(page);
		await advanceReply(page);
		await expect.poll(() => page.evaluate(() => window.refreshHeld)).toBe(true);
		await expect(page.locator("#pending")).toHaveText("true");
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS);
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText("Marketing agent is working on it…")).toHaveCount(0);
		await page.evaluate(() => {
			window.router.invalidate = window.realInvalidate;
		});
		await send(page);
		await advanceReply(page);
		await expect(page.getByText(reply, { exact: true })).toHaveCount(2);
		await expect(page.locator("#pending")).toHaveText("false");
	});
});

test("a failed refresh keeps returned messages and permits another send", async (t) => {
	await withDock(t, async ({ page }) => {
		await page.clock.install();
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.evaluate(() => {
			window.rejectRefresh = true;
		});
		await advanceReply(page);
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await send(page);
		await advanceReply(page);
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText(reply, { exact: true })).toHaveCount(2);
	});
});

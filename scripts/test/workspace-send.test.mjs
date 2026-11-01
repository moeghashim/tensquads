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
   import { WorkspaceProvider } from "./apps/web/src/workspace/provider.tsx";
   import { Dock } from "./apps/web/src/workspace/dock.tsx";
   import { useWorkspace } from "./apps/web/src/workspace/context.ts";
   function Probe() {
    const value = useWorkspace();
    return <><Dock /><output id="pending">{String(value.pending)}</output>
     <output id="count">{value.approvalCount}</output></>;
   }
   const root = createRoot(document.getElementById("root"));
   window.renderFrame = (frame) => root.render(<WorkspaceProvider frame={frame}><Probe /></WorkspaceProvider>);
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
				build.onResolve({ filter: /^(@tanstack\/react-router|#\/server\/workspace.ts)$/ }, ({ path }) => ({
					path,
					namespace: "boundary",
				}));
				build.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
					contents: path.startsWith("@tanstack")
						? `
     const router = { invalidate: async () => {
      window.renderFrame(await window.readFrame());
      await new Promise(requestAnimationFrame);
     }};
     export const useRouter = () => router;
     export const useNavigate = () => async () => {};
     export const useRouterState = ({select}) => select({location: {pathname: "/overview"}});
    `
						: `
     export const beginWorkspaceSend = ({data}) => window.beginSend(data);
     export const finishWorkspaceSend = ({data}) => window.finishSend(data);
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
	const faults = { begin: false, finish: false, refresh: false };
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
			if (faults.refresh) {
				faults.refresh = false;
				throw new Error("Read failed");
			}
			return readWorkspaceFrame(db, scope);
		});
		const mount = async () => {
			await page.setContent('<div id="root"></div>');
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
			await page.evaluate((frame) => window.renderFrame(frame), await readWorkspaceFrame(db, scope));
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
		await advanceReply(page);
		await expect(page.locator("#pending")).toHaveText("false");
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#count")).toHaveText("1");
	});
});

test("a failed recovery read releases the send guard and older loaders cannot replace a send", async (t) => {
	await withDock(t, async ({ page, db, scope, faults }) => {
		await page.clock.install();
		faults.begin = true;
		faults.refresh = true;
		await send(page);
		await expect(page.locator("#pending")).toHaveText("false");
		const older = await readWorkspaceFrame(db, scope);
		await send(page);
		await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
		await page.evaluate((frame) => window.renderFrame(frame), older);
		await expect(page.locator("[data-loop='dockChat']").getByText(question, { exact: true })).toBeVisible();
		await advanceReply(page);
		await expect(page.getByText(reply, { exact: true })).toBeVisible();
		await expect(page.locator("#pending")).toHaveText("false");
	});
});

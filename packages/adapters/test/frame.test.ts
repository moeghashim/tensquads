import assert from "node:assert/strict";
import test from "node:test";
import { accountForClerkUser, readWorkspaceFrame } from "@tensquads/adapters";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPglite } from "./pglite.ts";

const clerkId = "clerk_frame_owner";

async function openCopy() {
	const queries: string[] = [];
	const opened = await openPglite({
		logQuery(query) {
			queries.push(query);
		},
	});
	await replaceDemoAccount(opened.db, "frame-read", clerkId);
	return { ...opened, queries };
}

test("the frame reader asks six questions and returns the demo badge", async () => {
	const { db, close, queries } = await openCopy();
	try {
		queries.length = 0;
		const started = performance.now();
		const frame = await readWorkspaceFrame(db, { accountId: "frame-read", mode: "account" });
		const elapsed = Math.round(performance.now() - started);
		console.log(`frame loader queries ${queries.length} time ${elapsed}ms`);
		assert.equal(queries.length, 6);
		assert.equal(frame.accountName, "Demo store");
		assert.equal(frame.owner, "Moe Ghashim");
		assert.equal(frame.masterName, "Master");
		assert.equal(frame.agents.length, 5);
		assert.equal(frame.approvalCount, 4);
		assert.equal(frame.messages.length, 5);
		assert.equal(frame.messages[0]?.text, "Did the tracking for #A-1007 go through?");
	} finally {
		await close();
	}
});

test("a clerk id finds only that account", async () => {
	const { db, close, queries } = await openCopy();
	try {
		queries.length = 0;
		assert.equal(await accountForClerkUser(db, ""), null);
		assert.equal(await accountForClerkUser(db, "   "), null);
		assert.equal(queries.length, 0);
		assert.equal(await accountForClerkUser(db, "clerk_missing"), null);
		const found = await accountForClerkUser(db, clerkId);
		assert.equal(found?.id, "frame-read");
		assert.equal(found?.name, "Demo store");
	} finally {
		await close();
	}
});

test("platform mode and a missing account do not return a frame", async () => {
	const { db, close } = await openCopy();
	try {
		await assert.rejects(
			() => readWorkspaceFrame(db, { accountId: "platform", mode: "platform" }),
			/The workspace frame needs an account/,
		);
		await assert.rejects(
			() => readWorkspaceFrame(db, { accountId: "missing", mode: "account" }),
			/The account is missing/,
		);
	} finally {
		await close();
	}
});

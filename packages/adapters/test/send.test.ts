import assert from "node:assert/strict";
import test from "node:test";
import { type AppDatabase, createRepositories, schema, traceFor } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { and, eq } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/neon/commands/conversation.ts";
import { openPglite } from "./pglite.ts";

const ads = "How did ads do this week?";
const marketingResult = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const noAgent =
	"That one I can answer myself, no agent needed. Ask me about orders, refunds, ads, profit or stock and I will hand it to the right agent.";
const paused = "That is a job for the Inventory agent, but it is paused. Turn it on in Agents and ask me again.";

function beginSend(db: AppDatabase, accountScope: ReturnType<typeof scope>, text: string) {
	return new Kernel(createRepositories(db)).beginSend(accountScope, text);
}

function finishSend(db: AppDatabase, accountScope: ReturnType<typeof scope>, taskId = "e102") {
	return new Kernel(createRepositories(db)).finishSend(accountScope, taskId);
}

async function withCopy(name: string, run: (db: AppDatabase, accountId: string) => Promise<void>) {
	const { db, close } = await openPglite();
	const accountId = `send-${name}`;
	try {
		await replaceDemoAccount(db, accountId, `clerk-${name}`);
		await run(db, accountId);
	} finally {
		await close();
	}
}

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

async function generated(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	return rows.filter((row) => /^e\d+$/.test(row.id)).sort((left, right) => left.seq - right.seq);
}

async function cursor(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
	const row = rows[0];
	assert.ok(row);
	return row;
}

async function storeText(db: AppDatabase, accountId: string, key: string) {
	const rows = await db
		.select()
		.from(schema.stateEntries)
		.where(and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, key)));
	return rows[0]?.value;
}

for (const seeded of [true, false]) {
	test(`a send uses one dock thread ${seeded ? "with seeded messages" : "when no thread exists"}`, async () => {
		await withCopy(`thread-${seeded}`, async (db, accountId) => {
			if (!seeded) {
				await db.delete(schema.messages).where(eq(schema.messages.accountId, accountId));
				await db.delete(schema.threads).where(eq(schema.threads.accountId, accountId));
			}
			const before = await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId));
			if (seeded) assert.ok(before.length > 0);
			for (const message of before) assert.equal(message.threadId, "dock");
			const started = await beginSend(db, scope(accountId), ads);
			assert.equal(started.kind, "working");
			if (started.kind !== "working") return;
			assert.equal((await finishSend(db, scope(accountId), started.taskId)).kind, "replied");
			const after = await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId));
			assert.equal(after.length, before.length + 3);
			for (const message of after) assert.equal(message.threadId, "dock");
			for (const message of before) {
				assert.deepEqual(
					after.find((row) => row.id === message.id),
					message,
				);
			}
			const storedThreads = await db.select().from(schema.threads).where(eq(schema.threads.accountId, accountId));
			assert.deepEqual(
				storedThreads.map((thread) => thread.id),
				["dock"],
			);
		});
	});
}

test("a marketing send writes the task, and the reply writes the result without changing the store", async () => {
	await withCopy("marketing", async (db, accountId) => {
		const before = await storeText(db, accountId, "marketing.roas_7d");
		assert.equal((await generated(db, accountId)).length, 0);
		const started = await beginSend(db, scope(accountId), ads);
		assert.equal(started.kind, "working");
		if (started.kind !== "working") {
			return;
		}
		assert.equal(started.agentId, "marketing");
		assert.equal(started.agentName, "Marketing");
		assert.equal(started.skill, "meta_ads.report");
		assert.deepEqual(
			started.messages.slice(-2).map((message) => message.id),
			["c100", "c101"],
		);
		assert.equal(started.messages.at(-1)?.text, "Passing this to the Marketing agent. I will report back here.");
		const task = (await generated(db, accountId))[0];
		assert.ok(task);
		assert.equal(task.id, "e102");
		assert.equal(task.timeText, "11:03");
		assert.equal(task.trace, traceFor("e102"));
		assert.equal(task.fromAgent, "master");
		assert.equal(task.toAgent, "marketing");
		assert.equal(task.kind, "Task");
		assert.equal(task.skill, "meta_ads.report");
		assert.equal(task.body, ads);
		assert.equal(started.taskId, "e102");
		assert.deepEqual(started.task, {
			id: "e102",
			time: "11:03",
			from: "master",
			to: "marketing",
			kind: "Task",
			text: ads,
		});
		assert.deepEqual(task.payload, {
			intent: "user_request",
			user_text: ads,
			from: "chat",
			limits: { refund_auto_limit: 50, daily_ad_cap: 200 },
		});
		const open = await cursor(db, accountId);
		assert.equal(open.seq, 103);
		assert.equal(open.clock, 663);
		const finished = await finishSend(db, scope(accountId));
		assert.equal(finished.kind, "replied");
		if (finished.kind !== "replied") {
			return;
		}
		assert.equal(finished.messages.at(-1)?.id, "c103");
		assert.equal(finished.messages.at(-1)?.text, marketingResult);
		const events = await generated(db, accountId);
		assert.equal(events.length, 2);
		const result = events[1];
		assert.ok(result);
		assert.equal(result.id, "e104");
		assert.equal(result.timeText, "11:04");
		assert.equal(result.trace, traceFor("e104"));
		assert.equal(result.kind, "Result");
		assert.deepEqual(result.writes, ["marketing.roas_7d"]);
		assert.equal(result.body, marketingResult);
		const done = await cursor(db, accountId);
		assert.equal(done.seq, 105);
		assert.equal(done.clock, 664);
		const agents = await db
			.select()
			.from(schema.agents)
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, "marketing")));
		assert.equal(agents[0]?.tasks, 39);
		assert.equal(agents[0]?.lastText, marketingResult);
		assert.equal(await storeText(db, accountId, "marketing.roas_7d"), before);
	});
});

test("a message with no agent or a paused agent writes no event and does not move the clock", async () => {
	await withCopy("none", async (db, accountId) => {
		const answered = await beginSend(db, scope(accountId), "Hello there");
		assert.equal(answered.kind, "answered");
		if (answered.kind !== "answered") {
			return;
		}
		assert.equal(answered.messages.at(-1)?.text, noAgent);
		assert.equal((await generated(db, accountId)).length, 0);
		const held = await cursor(db, accountId);
		assert.equal(held.seq, 102);
		assert.equal(held.clock, 662);
	});
	await withCopy("paused", async (db, accountId) => {
		const answered = await beginSend(db, scope(accountId), "Is anything low on stock?");
		assert.equal(answered.kind, "answered");
		if (answered.kind !== "answered") {
			return;
		}
		assert.equal(answered.messages.at(-1)?.text, paused);
		assert.equal((await generated(db, accountId)).length, 0);
		const held = await cursor(db, accountId);
		assert.equal(held.seq, 102);
		assert.equal(held.clock, 662);
	});
});

test("an empty message, a blank message, or a second send changes nothing", async () => {
	await withCopy("empty", async (db, accountId) => {
		for (const text of ["", "   ", "\n\t"]) {
			const ignored = await beginSend(db, scope(accountId), text);
			assert.equal(ignored.kind, "ignored");
		}
		const held = await cursor(db, accountId);
		assert.equal(held.seq, 100);
		assert.equal(held.clock, 662);
		assert.equal((await generated(db, accountId)).length, 0);
		const started = await beginSend(db, scope(accountId), ads);
		assert.equal(started.kind, "working");
		const again = await beginSend(db, scope(accountId), "Hello there");
		assert.equal(again.kind, "ignored");
		const events = await generated(db, accountId);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.kind, "Task");
		const pending = await finishSend(db, scope(accountId));
		assert.equal(pending.kind, "replied");
	});
});

test("a pending task stays when the reply is not finished", async () => {
	await withCopy("pending", async (db, accountId) => {
		const started = await beginSend(db, scope(accountId), ads);
		assert.equal(started.kind, "working");
		const events = await generated(db, accountId);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.kind, "Task");
		const agents = await db
			.select()
			.from(schema.agents)
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, "marketing")));
		assert.equal(agents[0]?.tasks, 38);
		assert.equal(agents[0]?.lastText, "Asked to raise the prints ad set to $60 a day");
	});
});

test("a marketing send with no skill on records a dash", async () => {
	await withCopy("noskill", async (db, accountId) => {
		await db
			.delete(schema.skills)
			.where(and(eq(schema.skills.accountId, accountId), eq(schema.skills.agentId, "marketing")));
		const started = await beginSend(db, scope(accountId), ads);
		assert.equal(started.kind, "working");
		if (started.kind !== "working") {
			return;
		}
		assert.equal(started.skill, "-");
		const task = (await generated(db, accountId))[0];
		assert.equal(task?.skill, "-");
	});
});

test("an abandoned Task expires at 30 seconds and a later send gets its own reply", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T12:00:00Z") });
	await withCopy("expired", async (db, accountId) => {
		assert.equal((await beginSend(db, scope(accountId), ads)).kind, "working");
		t.mock.timers.tick(PENDING_TASK_WINDOW_MS - 1);
		assert.equal((await beginSend(db, scope(accountId), ads)).kind, "ignored");
		t.mock.timers.tick(1);
		assert.equal((await finishSend(db, scope(accountId))).kind, "ignored");
		const second = await beginSend(db, scope(accountId), ads);
		assert.equal(second.kind, "working");
		if (second.kind !== "working") return;
		assert.equal((await finishSend(db, scope(accountId), "e102")).kind, "ignored");
		assert.equal((await finishSend(db, scope(accountId), second.taskId)).kind, "replied");
		const events = await generated(db, accountId);
		assert.deepEqual(
			events.map(({ kind }) => kind),
			["Task", "Task", "Result"],
		);
		assert.equal(events[0]?.timeText, "11:03");
		assert.equal(events[1]?.timeText, "11:04");
		assert.equal(events[2]?.timeText, "11:05");
	});
});

test("an approval between a chat task and its finish still writes the reply", async () => {
	await withCopy("approval-between", async (db, accountId) => {
		const started = await beginSend(db, scope(accountId), ads);
		assert.equal(started.kind, "working");
		if (started.kind !== "working") {
			return;
		}
		await new Kernel(createRepositories(db)).decide(scope(accountId), "ap1", true);
		assert.equal((await beginSend(db, scope(accountId), "How did ads do this week?")).kind, "ignored");
		const finished = await finishSend(db, scope(accountId), started.taskId);
		assert.equal(finished.kind, "replied");
		if (finished.kind !== "replied") {
			return;
		}
		assert.equal(finished.messages.at(-1)?.text, marketingResult);
		assert.equal((await finishSend(db, scope(accountId), started.taskId)).kind, "ignored");
		const events = await generated(db, accountId);
		assert.deepEqual(
			events.map(({ kind }) => kind),
			["Task", "Approval", "Result"],
		);
	});
});

for (const order of ["chat-both-traffic", "chat-traffic-task", "traffic-task-chat-result"] as const) {
	test(`${order} matches each Result to its own Task`, async () => {
		await withCopy(order, async (db, accountId) => {
			const kernel = new Kernel(createRepositories(db));
			const accountScope = scope(accountId);
			if (order === "traffic-task-chat-result") await kernel.nextEvent(accountScope);
			const started = await kernel.beginSend(accountScope, ads);
			assert.equal(started.kind, "working");
			if (started.kind !== "working") return;
			await kernel.nextEvent(accountScope);
			if (order === "chat-both-traffic") await kernel.nextEvent(accountScope);
			assert.equal((await kernel.beginSend(accountScope, ads)).kind, "ignored");
			const finished = await kernel.finishSend(accountScope, started.taskId);
			assert.equal(finished.kind, "replied");
			if (finished.kind !== "replied") return;
			assert.equal(finished.messages.at(-1)?.text, marketingResult);
			const events = await generated(db, accountId);
			assert.equal(events.filter((event) => event.kind === "Result" && event.fromAgent === "marketing").length, 1);
			const agents = await createRepositories(db).squads.listAgents(accountScope);
			assert.equal(agents.find((agent) => agent.id === "marketing")?.tasks, 39);
			assert.equal((await kernel.finishSend(accountScope, started.taskId)).kind, "ignored");
			assert.deepEqual(await generated(db, accountId), events);
			assert.deepEqual(await createRepositories(db).squads.listAgents(accountScope), agents);
			assert.deepEqual(
				(await createRepositories(db).conversation.thread(accountScope))?.messages,
				finished.messages,
			);
			assert.equal((await kernel.beginSend(accountScope, ads)).kind, "working");
		});
	});
}

test("a later matching chat Task takes the first Result and leaves the earlier Task open", async () => {
	await withCopy("newest-matching", async (db, accountId) => {
		const repos = createRepositories(db);
		const kernel = new Kernel(repos);
		const accountScope = scope(accountId);
		const first = await kernel.beginSend(accountScope, ads);
		assert.equal(first.kind, "working");
		if (first.kind !== "working") return;
		const second = await repos.conversation.transaction(accountScope, (commands) =>
			commands.appendEvent({
				from: "master",
				to: first.agentId,
				kind: "Task",
				skill: first.skill,
				text: ads,
				payload: { from: "chat" },
			}),
		);
		assert.equal((await kernel.finishSend(accountScope, second.id)).kind, "replied");
		assert.equal((await kernel.finishSend(accountScope, second.id)).kind, "ignored");
		assert.equal((await kernel.beginSend(accountScope, ads)).kind, "ignored");
		assert.equal((await kernel.finishSend(accountScope, first.taskId)).kind, "replied");
		assert.equal((await kernel.finishSend(accountScope, first.taskId)).kind, "ignored");
		assert.equal((await kernel.beginSend(accountScope, ads)).kind, "working");
	});
});

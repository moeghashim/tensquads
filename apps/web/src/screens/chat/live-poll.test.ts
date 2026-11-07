import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CHAT_POLL_MS, type PollClock, startChatPoll } from "./live-poll.ts";

interface FakeTimer {
	readonly ms: number;
	readonly run: () => void;
	cancelled: boolean;
}

function fakeClock(startHidden = false) {
	let hidden = startHidden;
	const timers: FakeTimer[] = [];
	const listeners = new Set<() => void>();
	const clock: PollClock = {
		every: (ms, run) => {
			const timer: FakeTimer = { ms, run, cancelled: false };
			timers.push(timer);
			return () => {
				timer.cancelled = true;
			};
		},
		hidden: () => hidden,
		onVisibility: (run) => {
			listeners.add(run);
			return () => {
				listeners.delete(run);
			};
		},
	};
	return {
		clock,
		timers,
		listeners,
		activeTimers: () => timers.filter((timer) => !timer.cancelled).length,
		fire: () => {
			for (const timer of timers) if (!timer.cancelled) timer.run();
		},
		setHidden: (value: boolean) => {
			hidden = value;
			for (const listener of [...listeners]) listener();
		},
	};
}

async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("chat live poll", () => {
	test("test mode never polls and never refreshes", async () => {
		const fake = fakeClock();
		let refreshes = 0;
		const stop = startChatPoll(
			false,
			async () => {
				refreshes += 1;
			},
			fake.clock,
		);
		assert.equal(fake.timers.length, 0);
		assert.equal(fake.listeners.size, 0);
		fake.fire();
		fake.setHidden(true);
		fake.setHidden(false);
		await flush();
		assert.equal(refreshes, 0);
		stop();
	});

	test("real mode refreshes every few seconds without a reload", async () => {
		const fake = fakeClock();
		let refreshes = 0;
		const stop = startChatPoll(
			true,
			async () => {
				refreshes += 1;
			},
			fake.clock,
		);
		assert.equal(fake.activeTimers(), 1);
		assert.equal(fake.timers[0]?.ms, CHAT_POLL_MS);
		assert.ok(CHAT_POLL_MS >= 3000 && CHAT_POLL_MS <= 5000);
		for (let round = 1; round <= 3; round += 1) {
			fake.fire();
			await flush();
			assert.equal(refreshes, round);
		}
		stop();
	});

	test("a refresh still running blocks the next tick", async () => {
		const fake = fakeClock();
		let refreshes = 0;
		let finish!: () => void;
		const stop = startChatPoll(
			true,
			() => {
				refreshes += 1;
				return new Promise<void>((resolve) => {
					finish = resolve;
				});
			},
			fake.clock,
		);
		fake.fire();
		fake.fire();
		fake.fire();
		assert.equal(refreshes, 1);
		finish();
		await flush();
		fake.fire();
		assert.equal(refreshes, 2);
		stop();
	});

	test("a failed refresh keeps polling", async () => {
		const fake = fakeClock();
		let refreshes = 0;
		const stop = startChatPoll(
			true,
			async () => {
				refreshes += 1;
				throw new Error("The workspace frame did not load.");
			},
			fake.clock,
		);
		fake.fire();
		await flush();
		fake.fire();
		await flush();
		assert.equal(refreshes, 2);
		assert.equal(fake.activeTimers(), 1);
		stop();
	});

	test("a hidden tab stops the timer and a visible tab refreshes at once and resumes", async () => {
		const fake = fakeClock();
		let refreshes = 0;
		const stop = startChatPoll(
			true,
			async () => {
				refreshes += 1;
			},
			fake.clock,
		);
		fake.setHidden(true);
		assert.equal(fake.activeTimers(), 0);
		fake.fire();
		await flush();
		assert.equal(refreshes, 0);
		fake.setHidden(false);
		await flush();
		assert.equal(refreshes, 1);
		assert.equal(fake.activeTimers(), 1);
		fake.fire();
		await flush();
		assert.equal(refreshes, 2);
		stop();
	});

	test("a tab that opens hidden waits until it is visible", async () => {
		const fake = fakeClock(true);
		let refreshes = 0;
		const stop = startChatPoll(
			true,
			async () => {
				refreshes += 1;
			},
			fake.clock,
		);
		assert.equal(fake.activeTimers(), 0);
		fake.setHidden(false);
		await flush();
		assert.equal(refreshes, 1);
		assert.equal(fake.activeTimers(), 1);
		stop();
	});

	test("stop cancels the timer and the visibility listener", () => {
		const fake = fakeClock();
		const stop = startChatPoll(true, async () => undefined, fake.clock);
		stop();
		assert.equal(fake.activeTimers(), 0);
		assert.equal(fake.listeners.size, 0);
	});
});

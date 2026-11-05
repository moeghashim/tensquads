import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import {
	consumeQueuedEvent,
	registerTrafficAdvance,
	runLiveTick,
	sendNextEvent,
} from "../../apps/web/src/workspace/live.ts";
import { PENDING_TASK_WINDOW_MS } from "../../packages/adapters/src/pending-window.ts";

const actions = {
	send: sendNextEvent,
	live: (refresh) => runLiveTick({ live: true, refresh }),
};

for (const [name, action] of Object.entries(actions)) {
	for (const stallsAdvance of [false, true]) {
		test(`${name} recovers from a hung refresh after ${stallsAdvance ? "timed-out" : "successful"} advance`, async (t) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });
			consumeQueuedEvent();
			let calls = 0;
			let signal;
			registerTrafficAdvance((options) => {
				calls++;
				signal = options.signal;
				return stallsAdvance ? new Promise(() => {}) : Promise.resolve("first");
			});
			let refreshes = 0;
			let settled = false;
			const pending = action(() => {
				refreshes++;
				return new Promise(() => {});
			}).then(() => {
				settled = true;
			});
			await setImmediate();
			if (stallsAdvance) {
				t.mock.timers.tick(PENDING_TASK_WINDOW_MS);
				await setImmediate();
				assert.equal(signal.aborted, true);
			}
			assert.equal(refreshes, 1);
			assert.equal(consumeQueuedEvent(), stallsAdvance ? "" : "first");
			await runLiveTick({ live: true, refresh: () => {} });
			assert.equal(calls, 1);
			t.mock.timers.tick(PENDING_TASK_WINDOW_MS - 1);
			await setImmediate();
			assert.equal(settled, false);
			t.mock.timers.tick(1);
			await setImmediate();
			assert.equal(settled, true);
			await pending;
			registerTrafficAdvance(async () => {
				calls++;
				return `event-${calls}`;
			});
			for (const retry of Object.values(actions)) {
				await retry(() => {
					refreshes++;
				});
				assert.equal(consumeQueuedEvent(), `event-${calls}`);
			}
			assert.equal(calls, 3);
			assert.equal(refreshes, 3);
		});
	}
}

test("three Send next event clicks each add one event, in order", async () => {
	consumeQueuedEvent();
	const releases = [];
	const order = [];
	registerTrafficAdvance(() => {
		const n = releases.length + 1;
		order.push(`start-${n}`);
		return new Promise((resolve) => {
			releases.push(() => {
				order.push(`end-${n}`);
				resolve(`e${n}`);
			});
		});
	});
	let refreshes = 0;
	const refresh = () => {
		refreshes += 1;
		return Promise.resolve();
	};
	const first = sendNextEvent(refresh);
	const second = sendNextEvent(refresh);
	const third = sendNextEvent(refresh);
	await setImmediate();
	assert.equal(releases.length, 1);
	releases[0]();
	await setImmediate();
	assert.equal(releases.length, 2);
	releases[1]();
	await setImmediate();
	assert.equal(releases.length, 3);
	releases[2]();
	await Promise.all([first, second, third]);
	assert.deepEqual(order, ["start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
	assert.equal(refreshes, 3);
});

test("a failed advance refreshes and the queued click runs", async () => {
	consumeQueuedEvent();
	let calls = 0;
	let releaseFail;
	registerTrafficAdvance(() => {
		calls += 1;
		if (calls === 1) {
			return new Promise((_resolve, reject) => {
				releaseFail = () => reject(new Error("advance failed"));
			});
		}
		return Promise.resolve(`e${calls}`);
	});
	let refreshes = 0;
	const refresh = () => {
		refreshes += 1;
		return Promise.resolve();
	};
	const first = sendNextEvent(refresh);
	const second = sendNextEvent(refresh);
	await setImmediate();
	assert.equal(calls, 1);
	releaseFail();
	await Promise.all([first, second]);
	assert.equal(calls, 2);
	assert.equal(refreshes, 2);
	assert.equal(consumeQueuedEvent(), "e2");
});

test("a refresh-needed advance does not refresh and the queued click still runs", async () => {
	consumeQueuedEvent();
	let calls = 0;
	registerTrafficAdvance(() => {
		calls += 1;
		if (calls === 1) return Promise.reject(new Error("The session needs a refresh."));
		return Promise.resolve(`e${calls}`);
	});
	let refreshes = 0;
	const refresh = () => {
		refreshes += 1;
		return Promise.resolve();
	};
	const first = sendNextEvent(refresh);
	const second = sendNextEvent(refresh);
	await Promise.all([first, second]);
	assert.equal(calls, 2);
	assert.equal(refreshes, 1);
	assert.equal(consumeQueuedEvent(), "e2");
});

test("a live tick does not queue behind an open send", async () => {
	consumeQueuedEvent();
	let release;
	let calls = 0;
	registerTrafficAdvance(() => {
		calls += 1;
		return new Promise((resolve) => {
			release = () => resolve("e100");
		});
	});
	const send = sendNextEvent(() => Promise.resolve());
	await setImmediate();
	await runLiveTick({ live: true, refresh: () => Promise.resolve() });
	await runLiveTick({ live: true, refresh: () => Promise.resolve() });
	assert.equal(calls, 1);
	release();
	await send;
	await setImmediate();
	assert.equal(calls, 1);
});

test("each queued click keeps its id for its caller", async () => {
	consumeQueuedEvent();
	const releases = [];
	registerTrafficAdvance(() => {
		return new Promise((resolve) => {
			releases.push(resolve);
		});
	});
	const ids = [];
	const run = async () => {
		await sendNextEvent(() => Promise.resolve());
		ids.push(consumeQueuedEvent());
	};
	const first = run();
	await setImmediate();
	const second = run();
	await setImmediate();
	assert.equal(releases.length, 1);
	releases[0]("one");
	await setImmediate();
	assert.equal(releases.length, 2);
	releases[1]("two");
	await Promise.all([first, second]);
	assert.deepEqual(ids, ["one", "two"]);
});

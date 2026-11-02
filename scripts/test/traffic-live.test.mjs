import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { PENDING_TASK_WINDOW_MS } from "../../packages/adapters/src/pending-window.ts";
import {
	consumeQueuedEvent,
	registerTrafficAdvance,
	runLiveTick,
	sendNextEvent,
} from "../../apps/web/src/workspace/live.ts";

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
			await sendNextEvent(() => {});
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

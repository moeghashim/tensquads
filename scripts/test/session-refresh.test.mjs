import assert from "node:assert/strict";
import { test } from "node:test";

const { SessionRefreshNeeded } = await import("../../apps/web/src/server/session-error.ts");
const { createSessionRefresh } = await import("../../apps/web/src/session/refresh-controller.ts");

function harness(token) {
	const calls = { token: 0, reload: 0, signIn: 0 };
	let tokenImpl = token ?? (async () => "fresh-token");
	const refresh = createSessionRefresh({
		token: () => {
			calls.token += 1;
			return tokenImpl();
		},
		reload: () => {
			calls.reload += 1;
		},
		signIn: () => {
			calls.signIn += 1;
		},
	});
	return {
		calls,
		refresh,
		setToken(next) {
			tokenImpl = next;
		},
	};
}

const needed = () => new SessionRefreshNeeded();

test("the first read refreshes the token and reloads once", async () => {
	const { calls, refresh } = harness();
	const id = refresh.begin();
	await refresh.finish(needed(), "GET", id);
	assert.deepEqual(calls, { token: 1, reload: 1, signIn: 0 });
});

test("a second read in the same action opens sign-in", async () => {
	const { calls, refresh } = harness();
	await refresh.finish(needed(), "GET", refresh.begin());
	await refresh.finish(needed(), "GET", refresh.begin());
	assert.deepEqual(calls, { token: 1, reload: 1, signIn: 1 });
});

test("a read that starts during the token refresh shares that reload", async () => {
	let release = () => {};
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const { calls, refresh } = harness(() => gate.then(() => "fresh-token"));
	const first = refresh.finish(needed(), "GET", refresh.begin());
	const sibling = refresh.begin();
	const second = refresh.finish(needed(), "GET", sibling);
	release();
	await first;
	await second;
	assert.equal(calls.token, 1);
	assert.equal(calls.reload, 1);
	assert.equal(calls.signIn, 0);
	await refresh.finish(needed(), "GET", refresh.begin());
	assert.equal(calls.token, 1);
	assert.equal(calls.reload, 1);
	assert.equal(calls.signIn, 1);
});

test("a read that starts after the reload opens sign-in", async () => {
	const calls = { token: 0, reload: 0, signIn: 0 };
	let startedDuringReload = 0;
	const refresh = createSessionRefresh({
		token: async () => {
			calls.token += 1;
			return "fresh-token";
		},
		reload: () => {
			calls.reload += 1;
			startedDuringReload = refresh.begin();
		},
		signIn: () => {
			calls.signIn += 1;
		},
	});
	await refresh.finish(needed(), "GET", refresh.begin());
	await refresh.finish(needed(), "GET", startedDuringReload);
	assert.deepEqual(calls, { token: 1, reload: 1, signIn: 1 });
});

test("a missing or failed token opens sign-in and does not reload", async () => {
	for (const token of [async () => null, async () => "", async () => Promise.reject(new Error("no token"))]) {
		const { calls, refresh } = harness(token);
		await refresh.finish(needed(), "GET", refresh.begin());
		assert.equal(calls.token, 1);
		assert.equal(calls.reload, 0);
		assert.equal(calls.signIn, 1);
	}
});

test("a write is not replayed", async () => {
	const { calls, refresh } = harness();
	await refresh.finish(needed(), "POST", refresh.begin());
	await refresh.finish(new Error("The write failed."), "GET", refresh.begin());
	assert.deepEqual(calls, { token: 0, reload: 0, signIn: 0 });
});

test("the next action may refresh once", async () => {
	const { calls, refresh, setToken } = harness(async () => {
		refresh.noteAction();
		return "fresh-token";
	});
	await refresh.finish(needed(), "GET", refresh.begin());
	assert.deepEqual(calls, { token: 1, reload: 0, signIn: 0 });
	setToken(async () => "fresh-token");
	await refresh.finish(needed(), "GET", refresh.begin());
	assert.deepEqual(calls, { token: 2, reload: 1, signIn: 0 });
});

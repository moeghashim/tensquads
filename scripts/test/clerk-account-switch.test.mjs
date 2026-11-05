import assert from "node:assert/strict";
import { test } from "node:test";

const { clerkAccountReset } = await import("../../apps/web/src/workspace/clerk-account-switch.ts");

test("the first user on a new document is not an account switch", () => {
	const loaded = clerkAccountReset(undefined, null, 0);
	assert.deepEqual(loaded, { previous: null, reset: false });
	const arrived = clerkAccountReset(loaded.previous, "user_a", 0);
	assert.deepEqual(arrived, { previous: "user_a", reset: false });
});

test("leaving a signed-in user reloads", () => {
	assert.deepEqual(clerkAccountReset("user_a", null, 0), { previous: null, reset: true });
	assert.deepEqual(clerkAccountReset("user_a", "user_b", 1), { previous: "user_b", reset: true });
});

test("a sign-in after sign-out reloads", () => {
	const signedOut = clerkAccountReset("user_a", null, 0);
	assert.equal(signedOut.reset, true);
	const signedIn = clerkAccountReset(signedOut.previous, "user_b", 1);
	assert.deepEqual(signedIn, { previous: "user_b", reset: true });
});

test("an unresolved clerk state does not reload", () => {
	assert.deepEqual(clerkAccountReset(undefined, undefined, 0), { previous: undefined, reset: false });
	assert.deepEqual(clerkAccountReset("user_a", "user_a", 0), { previous: "user_a", reset: false });
});

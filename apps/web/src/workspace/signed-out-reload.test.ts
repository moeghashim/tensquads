import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redirect } from "@tanstack/react-router";

import { hiddenFrame, hiddenSession, staySignedOut } from "./signed-out-reload.ts";

describe("signed-out workspace reload", () => {
	test("a stay that redirects to sign-in is the signed-out reload", () => {
		assert.equal(staySignedOut("stay", redirect({ to: "/signin" })), true);
		assert.equal(hiddenSession, -1);
	});

	test("entering the workspace and other redirects still leave", () => {
		assert.equal(staySignedOut("enter", redirect({ to: "/signin" })), false);
		assert.equal(staySignedOut("stay", redirect({ to: "/signup" })), false);
		assert.equal(staySignedOut("stay", new Error("The workspace frame did not load.")), false);
	});

	test("the hidden frame has no account data", () => {
		const frame = hiddenFrame(4);
		assert.equal(frame.accountName, "");
		assert.equal(frame.agents.length, 0);
		assert.equal(frame.messages.length, 0);
		assert.equal(frame.approvalCount, 0);
		assert.equal(frame.writeAt, 4);
	});
});

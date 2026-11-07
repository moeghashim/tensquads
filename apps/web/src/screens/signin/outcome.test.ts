import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifySignIn, messageFor, newSignInText, sameAccount, wrongError } from "./outcome.ts";

describe("classify the Clerk result of a password attempt", () => {
	it("completes when Clerk returns a complete status and a session", () => {
		const step = classifySignIn({ error: null, status: "complete", sessionId: "sess_1" });
		assert.deepEqual(step, { kind: "complete" });
	});

	it("reports wrong credentials as a wrong attempt", () => {
		const step = classifySignIn({
			error: { errors: [{ code: "form_password_incorrect" }] },
			status: "needs_first_factor",
			sessionId: null,
		});
		assert.deepEqual(step, { kind: "wrong" });
	});

	it("reports an unknown identifier as a wrong attempt", () => {
		const step = classifySignIn({
			error: { errors: [{ code: "form_identifier_not_found" }] },
			status: null,
			sessionId: null,
		});
		assert.deepEqual(step, { kind: "wrong" });
	});

	it("reports an active session as session_exists, even with a code on the error itself", () => {
		const step = classifySignIn({
			error: { code: "session_exists" },
			status: null,
			sessionId: null,
		});
		assert.deepEqual(step, { kind: "session_exists" });
	});

	it("reports an extra step for a second factor, client trust, email code and new password", () => {
		for (const status of ["needs_second_factor", "needs_client_trust", "needs_first_factor", "needs_new_password"]) {
			const step = classifySignIn({ error: null, status, sessionId: null });
			assert.deepEqual(step, { kind: "extra_step" }, status);
		}
	});

	it("does not complete when status is complete but there is no session", () => {
		const step = classifySignIn({ error: null, status: "complete", sessionId: null });
		assert.deepEqual(step, { kind: "wrong" });
	});

	it("treats an error that names no known code as a wrong attempt", () => {
		const step = classifySignIn({ error: { code: "something_else" }, status: null, sessionId: null });
		assert.deepEqual(step, { kind: "wrong" });
	});
});

describe("message for each step", () => {
	it("keeps the existing wrong-credentials text", () => {
		assert.equal(wrongError, "That email or password is wrong.");
		assert.equal(messageFor({ kind: "wrong" }), "That email or password is wrong.");
	});

	it("shows the proposed extra-step text", () => {
		assert.equal(messageFor({ kind: "extra_step" }), newSignInText.extraStep);
	});

	it("shows the proposed network text, never the wrong-credentials text", () => {
		assert.equal(messageFor({ kind: "network" }), newSignInText.network);
		assert.notEqual(newSignInText.network, wrongError);
	});

	it("shows no message when the sign-in completes or an active session is handled", () => {
		assert.equal(messageFor({ kind: "complete" }), "");
		assert.equal(messageFor({ kind: "session_exists" }), "");
	});
});

describe("same account check", () => {
	it("matches the typed email to the active account, ignoring case and spaces", () => {
		assert.equal(sameAccount("Pat@Example.com", " pat@example.com "), true);
	});

	it("does not match another person's email", () => {
		assert.equal(sameAccount("other@example.com", "pat@example.com"), false);
	});

	it("does not match when no account is active", () => {
		assert.equal(sameAccount(null, "pat@example.com"), false);
		assert.equal(sameAccount(undefined, "pat@example.com"), false);
	});
});

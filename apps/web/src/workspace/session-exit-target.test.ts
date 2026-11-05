import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redirect } from "@tanstack/react-router";

import { beginDocumentExit, sessionExitTarget, workspacePage } from "./session-exit-target.ts";

describe("session exit targets", () => {
	test("an admin redirect leaves the workspace", () => {
		assert.equal(sessionExitTarget(redirect({ to: "/admin" })), "/admin");
	});

	test("no browser window does not navigate", () => {
		assert.equal(beginDocumentExit(redirect({ to: "/admin" })), false);
	});

	test("a sign-in redirect leaves the workspace", () => {
		assert.equal(sessionExitTarget(redirect({ to: "/signin" })), "/signin");
	});

	test("a trailing slash still leaves", () => {
		assert.equal(sessionExitTarget(redirectResponse({ to: "/admin/" })), "/admin");
	});

	test("a query on the sign-in redirect still leaves", () => {
		assert.equal(sessionExitTarget(redirectResponse({ href: "https://example.test/signin?next=1" })), "/signin");
	});

	test("a location header to admin leaves", () => {
		assert.equal(sessionExitTarget(redirectResponse({}, "https://example.test/admin")), "/admin");
	});

	test("a sign-up redirect stays in the app", () => {
		assert.equal(sessionExitTarget(redirect({ to: "/signup" })), null);
	});

	test("an agents redirect stays in the workspace", () => {
		assert.equal(sessionExitTarget(redirect({ to: "/agents" })), null);
	});

	test("an overview redirect stays in the workspace", () => {
		assert.equal(sessionExitTarget(redirect({ to: "/overview" })), null);
	});

	test("an image catalog redirect stays in admin", () => {
		assert.equal(sessionExitTarget(redirectResponse({ to: "/admin/images" })), null);
	});

	test("a normal error is not a session exit", () => {
		assert.equal(sessionExitTarget(new Error("The workspace write did not finish.")), null);
	});
});

describe("workspace pages", () => {
	test("each workspace screen is a workspace page", () => {
		for (const path of ["/overview", "/rules", "/traffic", "/chat", "/agents", "/agents/support"]) {
			assert.equal(workspacePage(path), true, path);
		}
	});

	test("a trailing slash is still the workspace", () => {
		assert.equal(workspacePage("/overview/"), true);
	});

	test("admin and sign-in are not workspace pages", () => {
		for (const path of ["/admin", "/admin/images", "/signin", "/signup"]) {
			assert.equal(workspacePage(path), false, path);
		}
	});
});

function redirectResponse(options: { to?: string; href?: string }, location?: string): Response {
	const headers = location === undefined ? undefined : { location };
	const response = new Response(null, { status: 307, headers });
	Object.assign(response, { options });
	return response;
}

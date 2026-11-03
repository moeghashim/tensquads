import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { isRedirect } from "@tanstack/react-router";

const state = {
	request: new Request("http://localhost/overview"),
	authCalls: 0,
	auth: async () => ({ userId: "user_signed_in", orgId: null, orgRole: null, debug: () => ({}) }),
};

registerHooks({
	resolve(specifier, context, nextResolve) {
		const names = {
			"@tanstack/react-start/server": ["getRequest"],
			"@clerk/tanstack-react-start/server": ["auth"],
		}[specifier];
		if (!names) return nextResolve(specifier, context);
		const source = names
			.map(
				(name) =>
					`export const ${name} = (...args) => globalThis.sessionReadTest[${JSON.stringify(name)}](...args);`,
			)
			.join("\n");
		return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
	},
});

globalThis.sessionReadTest = {
	getRequest: () => state.request,
	auth: () => {
		state.authCalls += 1;
		return state.auth();
	},
};

process.env.CLERK_SECRET_KEY = "sk_test_session_read";
const { requireClerkSession, requireClerkUser } = await import("../../apps/web/src/server/session.ts");
const { isSessionRefreshNeeded } = await import("../../apps/web/src/server/session-error.ts");

function request(signal) {
	return new Request("http://localhost/overview", { signal });
}

function reset(next = {}) {
	state.request = request();
	state.authCalls = 0;
	state.auth = async () => ({ userId: "user_signed_in", orgId: null, orgRole: null, debug: () => ({}) });
	Object.assign(state, next);
}

function refreshNeeded(error) {
	return isSessionRefreshNeeded(error) && !isRedirect(error);
}

let tail = Promise.resolve();

function testSerial(name, fn) {
	const run = tail.then(() => fn());
	tail = run.then(
		() => undefined,
		() => undefined,
	);
	test(name, () => run);
}

testSerial("the session module does not verify cookies", () => {
	const source = readFileSync(new URL("../../apps/web/src/server/session.ts", import.meta.url), "utf8");
	assert.equal(source.includes("@clerk/backend"), false);
	assert.equal(source.includes("verifyToken"), false);
	assert.equal(source.includes("__session"), false);
});

testSerial("an empty secret opens sign-in and does not call Clerk", async () => {
	delete process.env.CLERK_SECRET_KEY;
	try {
		reset();
		await assert.rejects(
			() => requireClerkUser(),
			(error) => isRedirect(error) && error.options?.to === "/signin",
		);
		assert.equal(state.authCalls, 0);
	} finally {
		process.env.CLERK_SECRET_KEY = "sk_test_session_read";
	}
});

testSerial("a missing session and client opens sign-in", async () => {
	reset({
		auth: async () => ({ userId: null, debug: () => ({ reason: "session-token-and-uat-missing" }) }),
	});
	await assert.rejects(
		() => requireClerkUser(),
		(error) => isRedirect(error) && error.options?.to === "/signin",
	);
	assert.equal(state.authCalls, 1);
});

testSerial("any other signed-out answer needs a refresh and grants nothing", async () => {
	const reasons = [
		"session-token-but-no-client-uat",
		"session-token-iat-before-client-uat",
		"dev-browser-missing",
		null,
	];
	for (const reason of reasons) {
		reset({
			auth: async () => ({ userId: null, orgId: "org_hidden", orgRole: "org:admin", debug: () => ({ reason }) }),
		});
		await assert.rejects(() => requireClerkSession(), refreshNeeded);
		assert.equal(state.authCalls, 1);
	}
});

testSerial("one Clerk answer gives the user, the organization, and the role", async () => {
	reset({
		auth: async () => ({
			userId: "user_a",
			orgId: "org_1",
			orgRole: "org:admin",
			debug: () => {
				throw new Error("debug was read");
			},
		}),
	});
	assert.deepEqual(await requireClerkSession(), {
		userId: "user_a",
		organizationId: "org_1",
		role: "org:admin",
	});
	assert.equal(state.authCalls, 1);
	reset({
		auth: async () => ({ userId: "user_b", orgId: "", orgRole: null }),
	});
	assert.equal(await requireClerkUser(), "user_b");
	assert.deepEqual(await requireClerkSession(), {
		userId: "user_b",
		organizationId: null,
		role: null,
	});
});

testSerial("an aborted request does not open sign-in", async () => {
	const controller = new AbortController();
	controller.abort();
	reset({ request: request(controller.signal) });
	await assert.rejects(
		() => requireClerkUser(),
		(error) => error instanceof DOMException && error.name === "AbortError" && !isRedirect(error),
	);
	assert.equal(state.authCalls, 0);

	const during = new AbortController();
	reset({
		request: request(during.signal),
		auth: async () => {
			during.abort();
			throw new Error("Clerk network failed");
		},
	});
	await assert.rejects(
		() => requireClerkUser(),
		(error) => error instanceof DOMException && error.name === "AbortError" && !isSessionRefreshNeeded(error),
	);
});

testSerial("a Clerk failure is not a refresh and does not open sign-in", async () => {
	reset({
		auth: async () => {
			throw new Error("Clerk network failed");
		},
	});
	await assert.rejects(
		() => requireClerkUser(),
		(error) => error instanceof Error && error.message === "Clerk network failed" && !refreshNeeded(error),
	);
});

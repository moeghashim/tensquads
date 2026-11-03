import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { isRedirect } from "@tanstack/react-router";

const state = {
	request: new Request("http://localhost/overview"),
	authCalls: 0,
	verifyCalls: 0,
	auth: async () => ({ userId: "user_signed_in", debug: () => ({}) }),
	verify: async () => ({ sub: "user_from_cookie", iat: 1 }),
};

registerHooks({
	resolve(specifier, context, nextResolve) {
		const names = {
			"@tanstack/react-start/server": ["getRequest"],
			"@clerk/tanstack-react-start/server": ["auth"],
			"@clerk/backend": ["verifyToken"],
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
	verifyToken: (token, options) => {
		state.verifyCalls += 1;
		state.verified = { token, options };
		return state.verify(token, options);
	},
};

process.env.CLERK_SECRET_KEY = "sk_test_session_read";
const { requireClerkUser } = await import("../../apps/web/src/server/session.ts");

function request(cookie, signal) {
	return new Request("http://localhost/overview", {
		headers: cookie ? { cookie } : undefined,
		signal,
	});
}

function reset(next = {}) {
	state.request = request();
	state.authCalls = 0;
	state.verifyCalls = 0;
	state.verified = undefined;
	state.auth = async () => ({ userId: "user_signed_in", debug: () => ({}) });
	state.verify = async () => ({ sub: "user_from_cookie", iat: 1 });
	Object.assign(state, next);
}

test("an absent session is the only answer that opens sign-in", async () => {
	reset({
		auth: async () => ({ userId: null, debug: () => ({ reason: "session-token-and-uat-missing" }) }),
	});
	await assert.rejects(
		() => requireClerkUser(),
		(error) => isRedirect(error) && error.options?.to === "/signin",
	);
	assert.equal(state.verifyCalls, 0);
});

test("a token refresh signed-out keeps the signed-in user", async () => {
	reset({
		request: request("__client_uat=20; __session=header.payload.sig"),
		auth: async () => ({
			userId: null,
			debug: () => ({ reason: "session-token-iat-before-client-uat" }),
		}),
		verify: async (token) => {
			assert.equal(token, "header.payload.sig");
			return { sub: "user_signed_in", iat: 5 };
		},
	});
	assert.equal(await requireClerkUser(), "user_signed_in");
	assert.equal(state.verifyCalls, 1);
});

test("an aborted request does not open sign-in", async () => {
	const controller = new AbortController();
	controller.abort();
	reset({ request: request(undefined, controller.signal) });
	await assert.rejects(
		() => requireClerkUser(),
		(error) => error instanceof DOMException && error.name === "AbortError",
	);
	assert.equal(state.authCalls, 0);

	const during = new AbortController();
	reset({
		request: request("__session=header.payload.sig", during.signal),
		auth: async () => {
			during.abort();
			return { userId: null, debug: () => ({ reason: "session-token-and-uat-missing" }) };
		},
	});
	await assert.rejects(
		() => requireClerkUser(),
		(error) => error instanceof DOMException && error.name === "AbortError",
	);
	assert.equal(state.verifyCalls, 0);
});

test("a failed session read does not open sign-in", async () => {
	reset({
		request: request("__session=expired"),
		auth: async () => {
			throw new Error("Clerk network failed");
		},
	});
	await assert.rejects(() => requireClerkUser(), /Clerk network failed/);
	assert.equal(state.verifyCalls, 0);

	reset({
		request: request("__session=expired"),
		auth: async () => ({ userId: null, debug: () => ({ reason: "unexpected-error" }) }),
		verify: async () => {
			throw new Error("token expired");
		},
	});
	await assert.rejects(() => requireClerkUser(), /The session could not be read/);
});

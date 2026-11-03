import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { isRedirect } from "@tanstack/react-router";

const { authorizedParties } = await import("./authorized-parties.ts");
const { isSessionRefreshNeeded } = await import("./session-error.ts");

const publishableKey = `pk_live_${Buffer.from("clerk.review.example$").toString("base64")}`;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "review-key", alg: "RS256", use: "sig" };
const previousFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
	const href = input instanceof Request ? input.url : String(input);
	if (new URL(href).pathname.endsWith("/jwks")) return Response.json({ keys: [jwk] });
	return Response.json({ errors: [{ code: "blocked", message: "The test blocks this request." }] }, { status: 404 });
};

const { clerkClient } = await import("@clerk/tanstack-react-start/server");
const client = clerkClient({ secretKey: "secret_review_fixture", publishableKey });

const sessionState = {
	request: new Request("http://localhost:3000/overview"),
	auth: async () => ({ userId: null, debug: () => ({ reason: "" }) }),
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
					`export const ${name} = (...args) => globalThis.authorizedPartyTest[${JSON.stringify(name)}](...args);`,
			)
			.join("\n");
		return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
	},
});

globalThis.authorizedPartyTest = {
	getRequest: () => sessionState.request,
	auth: () => sessionState.auth(),
};

process.env.CLERK_SECRET_KEY = "sk_test_azp";
const { requireClerkUser } = await import("./session.ts");

function mint(claims) {
	const now = Math.floor(Date.now() / 1000);
	const encoded = [
		{ alg: "RS256", typ: "JWT", kid: "review-key" },
		{
			iss: "https://clerk.review.example",
			sub: "user_foreign",
			sid: "sess_foreign",
			iat: now - 10,
			nbf: now - 20,
			exp: now + 50,
			...claims,
		},
	].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
	const data = encoded.join(".");
	return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}

async function clerkState(claims) {
	const request = new Request("http://localhost:3000/overview", {
		headers: { cookie: `__client_uat=1; __session=${mint(claims)}`, "sec-fetch-dest": "empty" },
	});
	const result = await client.authenticateRequest(request, { authorizedParties: [...authorizedParties] });
	const auth = result.toAuth();
	return {
		status: result.status,
		reason: result.reason,
		userId: auth && typeof auth === "object" && "userId" in auth ? auth.userId : null,
		auth,
	};
}

async function grantsNothing(auth) {
	sessionState.request = new Request("http://localhost:3000/overview");
	sessionState.auth = async () => auth;
	await assert.rejects(
		() => requireClerkUser(),
		(error) => isSessionRefreshNeeded(error) && !isRedirect(error),
	);
}

test("the authorized parties are the app origins", () => {
	assert.deepEqual([...authorizedParties], ["https://tensquads.moe-678.workers.dev", "http://localhost:3000"]);
	const start = readFileSync(new URL("../start.ts", import.meta.url), "utf8");
	assert.equal(start.includes('from "#/server/authorized-parties.ts"'), true);
	assert.equal(start.includes("clerkMiddleware({ authorizedParties })"), true);
	assert.equal(start.includes("10squads.com"), false);
});

test("a foreign azp grants nothing and an app origin still signs in", async () => {
	try {
		const foreign = await clerkState({ azp: "https://other.example", sub: "user_foreign" });
		assert.equal(foreign.status, "signed-out", `foreign azp ${foreign.status} ${foreign.reason}`);
		assert.equal(foreign.reason, "token-invalid-authorized-parties");
		assert.equal(foreign.userId, null);
		await grantsNothing(foreign.auth);

		for (const origin of ["https://10squads.com", "https://acme.10squads.com"]) {
			const customer = await clerkState({ azp: origin, sub: "user_customer" });
			assert.equal(customer.status, "signed-out", `${origin} ${customer.status} ${customer.reason}`);
			assert.equal(customer.userId, null);
			await grantsNothing(customer.auth);
		}

		for (const [origin, userId] of [
			["http://localhost:3000", "user_local"],
			["https://tensquads.moe-678.workers.dev", "user_worker"],
		]) {
			const allowed = await clerkState({ azp: origin, sub: userId });
			assert.equal(allowed.status, "signed-in", `${origin} ${allowed.status} ${allowed.reason}`);
			assert.equal(allowed.userId, userId);
			sessionState.request = new Request("http://localhost:3000/overview");
			sessionState.auth = async () => allowed.auth;
			assert.equal(await requireClerkUser(), userId);
		}
	} finally {
		globalThis.fetch = previousFetch;
	}
});

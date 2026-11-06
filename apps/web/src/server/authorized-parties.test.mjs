import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { isRedirect } from "@tanstack/react-router";

import { adaptersMode } from "../../adapters-mode.ts";
import { authorizedOrigin } from "../../authorized-origin.ts";

const { partiesWithLocalPort } = await import("./authorized-parties.ts");
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

const productionOrigin = "https://tensquads.moe-678.workers.dev";
const realOrigin = "https://tensquads-real.moe-678.workers.dev";
const productionParties = [productionOrigin];
const realParties = [realOrigin];

async function clerkState(claims, parties = productionParties) {
	const request = new Request("http://localhost:3000/overview", {
		headers: { cookie: `__client_uat=1; __session=${mint(claims)}`, "sec-fetch-dest": "empty" },
	});
	const result = await client.authenticateRequest(request, { authorizedParties: [...parties] });
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

const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

test("the production list is the deployed origin", () => {
	assert.equal(authorizedOrigin(adaptersMode(wrangler, undefined)), productionOrigin);
	assert.equal(authorizedOrigin(adaptersMode(wrangler, "")), productionOrigin);
	assert.equal(authorizedOrigin(adaptersMode(wrangler, "staging")), productionOrigin);
	assert.equal(authorizedOrigin("test"), productionOrigin);
	const start = readFileSync(new URL("../start.ts", import.meta.url), "utf8");
	assert.equal(start.includes('from "#/server/authorized-parties.ts"'), true);
	assert.equal(start.includes("clerkMiddleware({ authorizedParties: [...partiesForBuild()] })"), true);
	assert.equal(start.includes("10squads.com"), false);
	const source = readFileSync(new URL("./authorized-parties.ts", import.meta.url), "utf8");
	assert.equal(source.includes("workers.dev"), false);
	assert.equal(source.includes("tensquads-real"), false);
	assert.equal(
		source.includes(
			"if (import.meta.env.DEV) return partiesWithLocalPort([__TENSQUADS_AUTHORIZED_ORIGIN__], process.env.TS_E2E_PORT);",
		),
		true,
	);
});

test("the real list is the real worker origin", () => {
	assert.equal(adaptersMode(wrangler, "real"), "real");
	assert.equal(authorizedOrigin("real"), realOrigin);
	assert.equal(authorizedOrigin(adaptersMode(wrangler, "real")), realOrigin);
	assert.equal(realOrigin.includes(productionOrigin), false);
});

test("a dev build accepts the deployed origin and one local port", () => {
	const local = "http://localhost:3000";
	assert.deepEqual([...partiesWithLocalPort(productionParties, undefined)], [productionOrigin, local]);
	assert.deepEqual([...partiesWithLocalPort(productionParties, "")], [productionOrigin, local]);
	assert.deepEqual([...partiesWithLocalPort(productionParties, "3000")], [productionOrigin, local]);
	assert.deepEqual(
		[...partiesWithLocalPort(productionParties, "41234")],
		[productionOrigin, "http://localhost:41234"],
	);
	for (const port of ["0", "65536", "nope"]) {
		assert.deepEqual([...partiesWithLocalPort(productionParties, port)], [productionOrigin, local]);
	}
	assert.deepEqual([...partiesWithLocalPort(realParties, undefined)], [realOrigin, local]);
	assert.deepEqual([...partiesWithLocalPort(realParties, "41234")], [realOrigin, "http://localhost:41234"]);
	assert.equal(partiesWithLocalPort(realParties, "41234").includes(productionOrigin), false);
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

		const blockedLocal = await clerkState({ azp: "http://localhost:3000", sub: "user_local" });
		assert.equal(blockedLocal.status, "signed-out", `${blockedLocal.status} ${blockedLocal.reason}`);
		assert.equal(blockedLocal.reason, "token-invalid-authorized-parties");
		assert.equal(blockedLocal.userId, null);
		await grantsNothing(blockedLocal.auth);

		const worker = await clerkState({ azp: productionOrigin, sub: "user_worker" });
		assert.equal(worker.status, "signed-in", `${worker.status} ${worker.reason}`);
		assert.equal(worker.userId, "user_worker");
		sessionState.request = new Request("http://localhost:3000/overview");
		sessionState.auth = async () => worker.auth;
		assert.equal(await requireClerkUser(), "user_worker");

		const realOnProduction = await clerkState({ azp: realOrigin, sub: "user_real" });
		assert.equal(realOnProduction.status, "signed-out", `${realOnProduction.status} ${realOnProduction.reason}`);
		assert.equal(realOnProduction.reason, "token-invalid-authorized-parties");
		const realWorker = await clerkState({ azp: realOrigin, sub: "user_real" }, realParties);
		assert.equal(realWorker.status, "signed-in", `${realWorker.status} ${realWorker.reason}`);
		assert.equal(realWorker.userId, "user_real");
		const productionOnReal = await clerkState({ azp: productionOrigin, sub: "user_worker" }, realParties);
		assert.equal(productionOnReal.status, "signed-out", `${productionOnReal.status} ${productionOnReal.reason}`);
		assert.equal(productionOnReal.reason, "token-invalid-authorized-parties");

		const devParties = partiesWithLocalPort(productionParties, undefined);
		const local = await clerkState({ azp: "http://localhost:3000", sub: "user_local" }, devParties);
		assert.equal(local.status, "signed-in", `${local.status} ${local.reason}`);
		assert.equal(local.userId, "user_local");
		sessionState.auth = async () => local.auth;
		assert.equal(await requireClerkUser(), "user_local");

		const customParties = partiesWithLocalPort(productionParties, "41234");
		const custom = await clerkState({ azp: "http://localhost:41234", sub: "user_custom" }, customParties);
		assert.equal(custom.status, "signed-in", `${custom.status} ${custom.reason}`);
		assert.equal(custom.userId, "user_custom");
		const wrongPort = await clerkState({ azp: "http://localhost:3000", sub: "user_local" }, customParties);
		assert.equal(wrongPort.status, "signed-out", `${wrongPort.status} ${wrongPort.reason}`);
		assert.equal(wrongPort.reason, "token-invalid-authorized-parties");
	} finally {
		globalThis.fetch = previousFetch;
	}
});

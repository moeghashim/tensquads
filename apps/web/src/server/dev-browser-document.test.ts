import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClerkClient } from "@clerk/backend";
import { getCookieSuffix } from "@clerk/shared/keys";

import { clerkDocumentGet, documentRequestForClerk } from "./dev-browser-document.ts";

const publishable = "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k";
const liveKey = "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k";
const devBrowser = "dev-browser-token";
const clientUat = "1700000000";
const otherSession = "other-session";

describe("development document cookies", () => {
	it("treats a document GET the way Clerk treats a handshake", () => {
		assert.equal(clerkDocumentGet(get("/overview")), true);
		assert.equal(clerkDocumentGet(get("/overview", { "sec-fetch-dest": "iframe" })), true);
		assert.equal(clerkDocumentGet(get("/overview", { "sec-fetch-dest": "" })), true);
		assert.equal(
			clerkDocumentGet(get("/overview", { "sec-fetch-dest": "empty", accept: "application/json" })),
			false,
		);
		const post = new Request("http://localhost:3000/overview", { method: "POST" });
		assert.equal(clerkDocumentGet(post), false);
	});

	it("does not rewrite a document GET to a server function", async () => {
		const header = await badHeader();
		const call = get("/_serverFn/test", { cookie: header });
		assert.equal(clerkDocumentGet(call), false);
		assert.equal(await documentRequestForClerk(call, publishable), call);
		const encoded = get("/%5FserverFn/test", { cookie: header });
		assert.equal(clerkDocumentGet(encoded), false);
		assert.equal(await documentRequestForClerk(encoded, publishable), encoded);
		for (const path of ["/machine/send", "/machine/take"]) {
			const machine = get(path, { cookie: header });
			assert.equal(clerkDocumentGet(machine), false);
			assert.equal(await documentRequestForClerk(machine, publishable), machine);
		}
	});

	it("leaves a production request and a complete development request unchanged", async () => {
		const header = await badHeader();
		const document = get("/admin", { cookie: header });
		assert.equal(await documentRequestForClerk(document, liveKey), document);
		assert.equal(await documentRequestForClerk(document, ""), document);
		const complete = get("/admin", { cookie: `${header}; __clerk_db_jwt_${await suffix()}=present` });
		assert.equal(await documentRequestForClerk(complete, publishable), complete);
		const post = new Request("http://localhost:3000/admin", {
			method: "POST",
			headers: { cookie: header, accept: "text/html" },
		});
		assert.equal(await documentRequestForClerk(post, publishable), post);
	});

	it("drops this instance's suffixed session names when the dev-browser suffix is absent", async () => {
		const header = await badHeader();
		const document = get("/overview", { cookie: header, "x-request-id": "kept" });
		const carried = await documentRequestForClerk(document, publishable);
		assert.notEqual(carried, document);
		assert.equal(document.headers.get("cookie"), header);
		assert.equal(carried.url, document.url);
		assert.equal(carried.method, "GET");
		assert.equal(carried.headers.get("x-request-id"), "kept");
		const next = carried.headers.get("cookie") ?? "";
		const key = await suffix();
		assert.equal(cookieValue(next, "__clerk_db_jwt"), devBrowser);
		assert.equal(cookieValue(next, "__session"), sessionToken());
		assert.equal(cookieValue(next, "__client_uat"), clientUat);
		assert.equal(cookieValue(next, "ts_special_account"), "demo.1");
		assert.equal(cookieValue(next, "__session_zzzzzzzz"), otherSession);
		assert.equal(cookieValue(next, "__client_uat_zzzzzzzz"), clientUat);
		assert.equal(cookieValue(next, "theme"), "light");
		assert.equal(cookieValue(next, `__session_${key}`), undefined);
		assert.equal(cookieValue(next, `__client_uat_${key}`), undefined);
		assert.equal(cookieValue(next, `__clerk_db_jwt_${key}`), undefined);
		assert.equal(next.includes(`__clerk_db_jwt_${key}`), false);
	});

	it("keeps the header when the unsuffixed session is missing, foreign, or different", async () => {
		const key = await suffix();
		const token = sessionToken();
		const foreign = sessionToken("https://other.example.com");
		const base = `__clerk_db_jwt=${devBrowser}; __client_uat=${clientUat}; __client_uat_${key}=${clientUat}`;
		const missingSession = get("/overview", { cookie: `${base}; __session_${key}=${token}` });
		assert.equal(await documentRequestForClerk(missingSession, publishable), missingSession);
		const different = get("/overview", {
			cookie: `${base}; __session=${token}; __session_${key}=${sessionToken("https://clerk.example.com", "user_other")}`,
		});
		assert.equal(await documentRequestForClerk(different, publishable), different);
		const signedOut = get("/overview", {
			cookie: `__clerk_db_jwt=${devBrowser}; __session=${token}; __session_${key}=${token}; __client_uat=0; __client_uat_${key}=0`,
		});
		assert.equal(await documentRequestForClerk(signedOut, publishable), signedOut);
		const otherInstance = get("/overview", {
			cookie: `${base}; __session=${foreign}; __session_${key}=${foreign}`,
		});
		assert.equal(await documentRequestForClerk(otherInstance, publishable), otherInstance);
	});

	it("makes Clerk read the unsuffixed dev-browser cookie instead of starting a handshake", async () => {
		const header = await badHeader();
		const clerk = createClerkClient({
			secretKey: "sk_test_fixture",
			publishableKey: publishable,
			jwtKey: "local-test-key",
			telemetry: { disabled: true },
		});
		const before = await clerk.authenticateRequest(get("/overview", { cookie: header }), {
			publishableKey: publishable,
		});
		assert.equal(before.status, "handshake");
		assert.equal(before.reason, "dev-browser-missing");
		const carried = await documentRequestForClerk(get("/overview", { cookie: header }), publishable);
		const after = await Promise.race([
			clerk.authenticateRequest(carried, { publishableKey: publishable }),
			timeout(),
		]);
		assert.notEqual(after.reason, "dev-browser-missing");
		assert.notEqual(after.status, "handshake");
	});
});

function get(path: string, headers: Record<string, string> = {}): Request {
	const accept = headers.accept ?? "text/html";
	const dest = Object.hasOwn(headers, "sec-fetch-dest") ? headers["sec-fetch-dest"] : "document";
	const next = new Headers({ accept });
	if (dest) next.set("sec-fetch-dest", dest);
	for (const [name, value] of Object.entries(headers)) {
		if (name === "accept" || name === "sec-fetch-dest") continue;
		next.set(name, value);
	}
	return new Request(`http://localhost:3000${path}`, { headers: next });
}

async function badHeader(): Promise<string> {
	const key = await suffix();
	const token = sessionToken();
	return [
		"ts_special_account=demo.1",
		`__clerk_db_jwt=${devBrowser}`,
		`__session=${token}`,
		`__session_${key}=${token}`,
		`__client_uat=${clientUat}`,
		`__client_uat_${key}=${clientUat}`,
		`__session_zzzzzzzz=${otherSession}`,
		`__client_uat_zzzzzzzz=${clientUat}`,
		"theme=light",
	].join("; ");
}

function sessionToken(issuer = "https://clerk.example.com", sub = "user_test"): string {
	const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
	const header = encode({ alg: "none", typ: "JWT" });
	const payload = encode({ iss: issuer, iat: 1_700_000_000, exp: 4_000_000_000, sub });
	return `${header}.${payload}.sig`;
}

function suffix(): Promise<string> {
	return getCookieSuffix(publishable);
}

function cookieValue(header: string, name: string): string | undefined {
	const length = header.length;
	let index = 0;
	while (index < length) {
		const eq = header.indexOf("=", index);
		if (eq === -1) return undefined;
		const semicolon = header.indexOf(";", index);
		const end = semicolon === -1 ? length : semicolon;
		if (eq > end) {
			index = header.lastIndexOf(";", eq - 1) + 1;
			continue;
		}
		if (header.slice(index, eq).trim() === name) return header.slice(eq + 1, end).trim();
		index = end + 1;
	}
	return undefined;
}

function timeout(): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => reject(new Error("Clerk authenticateRequest timed out")), 2_000);
	});
}

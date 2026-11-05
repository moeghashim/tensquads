import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { devBrowserCookieWrites, requestWithDevBrowser, withDevBrowserCookie } from "./dev-browser.ts";

const suffix = "b4rjRfVL";
const token = "dvb_signed_in";

describe("dev browser cookie", () => {
	test("a suffixed session keeps the unsuffixed dev browser", () => {
		const header = `__clerk_db_jwt=${token}; __session_${suffix}=session; __client_uat_${suffix}=12`;
		const carried = withDevBrowserCookie(header);
		assert.equal(carried, `${header}; __clerk_db_jwt_${suffix}=${token}`);
	});

	test("an existing suffixed dev browser is left as it was", () => {
		const header = `__clerk_db_jwt=${token}; __clerk_db_jwt_${suffix}=${token}; __session_${suffix}=session`;
		assert.equal(withDevBrowserCookie(header), header);
	});

	test("no suffixed session does not add a suffixed dev browser", () => {
		const header = `__clerk_db_jwt=${token}; __session=session`;
		assert.equal(withDevBrowserCookie(header), header);
	});

	test("a missing dev browser is left as it was", () => {
		const header = `__session_${suffix}=session; __client_uat_${suffix}=12`;
		assert.equal(withDevBrowserCookie(header), header);
	});

	test("a document exit rewrites the dev browser as a first-party cookie", () => {
		const cookie = `__clerk_db_jwt=${token}; __client_uat_${suffix}=12`;
		assert.deepEqual(devBrowserCookieWrites(cookie, "http://localhost:3000/agents/support"), [
			`__clerk_db_jwt=${token}; Path=/; Max-Age=31536000; SameSite=Lax`,
			`__clerk_db_jwt_${suffix}=${token}; Path=/; Max-Age=31536000; SameSite=Lax`,
		]);
	});

	test("the page url keeps a dev browser that is not in a cookie yet", () => {
		const writes = devBrowserCookieWrites("", `http://localhost:3000/agents/support?__clerk_db_jwt=${token}`);
		assert.deepEqual(writes, [`__clerk_db_jwt=${token}; Path=/; Max-Age=31536000; SameSite=Lax`]);
	});

	test("a document get copies the dev browser before Clerk reads it", () => {
		const request = new Request("http://localhost:3000/admin", {
			headers: {
				accept: "text/html",
				"sec-fetch-dest": "document",
				cookie: `__clerk_db_jwt=${token}; __session_${suffix}=session`,
			},
		});
		const carried = requestWithDevBrowser(request);
		assert.equal(
			carried.headers.get("cookie"),
			`__clerk_db_jwt=${token}; __session_${suffix}=session; __clerk_db_jwt_${suffix}=${token}`,
		);
	});

	test("a server function keeps its own cookies", () => {
		const request = new Request("http://localhost:3000/_serverFn/toggle", {
			method: "POST",
			headers: { cookie: `__clerk_db_jwt=${token}; __session_${suffix}=session` },
		});
		assert.equal(requestWithDevBrowser(request), request);
	});
});

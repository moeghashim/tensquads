import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	specialAccountCookie,
	specialAccountCookieOptions,
	specialAccountMaxAge,
	specialAccountPattern,
} from "./special-account.ts";

describe("special session cookie", () => {
	it("is HttpOnly, Secure, SameSite Lax, and lasts one hour", () => {
		assert.equal(specialAccountCookie, "ts_special_account");
		assert.equal(specialAccountMaxAge, 3600);
		assert.deepEqual(specialAccountCookieOptions, {
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			maxAge: 3600,
			path: "/",
		});
	});

	it("accepts an account id and rejects anything else", () => {
		assert.equal(specialAccountPattern.test("northwind"), true);
		assert.equal(specialAccountPattern.test("account-1"), true);
		assert.equal(specialAccountPattern.test("a_b"), true);
		assert.equal(specialAccountPattern.test(""), false);
		assert.equal(specialAccountPattern.test("north wind"), false);
		assert.equal(specialAccountPattern.test("north/wind"), false);
	});
});

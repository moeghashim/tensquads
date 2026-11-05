import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	accountFromSpecialCookie,
	specialAccountCookie,
	specialAccountCookieOptions,
	specialAccountMaxAge,
	specialAccountPattern,
	specialAccountValue,
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

	it("accepts the same cookie at 59 minutes and rejects it at 61 minutes", () => {
		const minute = 60 * 1000;
		const openedAt = 1_700_000_000_000;
		const value = specialAccountValue("northwind", openedAt);
		assert.equal(value, `northwind.${openedAt}`);
		assert.equal(accountFromSpecialCookie(value, openedAt + 59 * minute), "northwind");
		assert.equal(accountFromSpecialCookie(value, openedAt + specialAccountMaxAge * 1000), "northwind");
		assert.equal(accountFromSpecialCookie(value, openedAt + 61 * minute), null);
		assert.equal(accountFromSpecialCookie(value, openedAt + specialAccountMaxAge * 1000 + 1), null);
		assert.equal(accountFromSpecialCookie("northwind", openedAt + 59 * minute), null);
		assert.equal(accountFromSpecialCookie(specialAccountValue("a_b", openedAt), openedAt - minute), "a_b");
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

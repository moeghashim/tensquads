import assert from "node:assert/strict";
import test from "node:test";

import {
	isExpiredTestUser,
	staleTestUserAgeMs,
	staleTestUserEmail,
	sweepClerkTestUsers,
	sweepExpiredTestUsers,
} from "../clerk-test-users.mjs";

const now = 1_800_000_000_000;
const staleAt = now - staleTestUserAgeMs - 1;
const freshAt = now - staleTestUserAgeMs;

const realAddresses = ["moe@10claws.com", "subs@10claws.com", "demo@10squads.com"];

const rejected = [
	...realAddresses,
	"MOE@10claws.com",
	"Subs@10claws.com",
	"Demo@10squads.com",
	"sq-abcd1234+clerk_test@example.com",
	"sq-abcd123@example.com",
	"sq-abcd12345@example.com",
	"sq-abcd123z@example.com",
	"sq-abcd1234@example.org",
	"sq-abcd1234@example.com.",
	"sq-abcd1234@10claws.com",
	"sq-abcd1234@10squads.com",
	"notsq-abcd1234@example.com",
	"xsq-abcd1234@example.com",
	"sq-abcd1234@example.com.attacker",
	" sq-abcd1234@example.com",
	"sq-abcd1234@example.com ",
	"",
];

function row(id, email, createdAt = staleAt) {
	return { id, email_addresses: [{ email_address: email }], created_at: createdAt };
}

test("the stale test pattern never matches a real address", () => {
	for (const email of rejected) {
		assert.equal(staleTestUserEmail.test(email), false, email);
		assert.equal(isExpiredTestUser(email, staleAt, now), false, email);
	}
	assert.equal(staleTestUserEmail.test("sq-abcd1234@example.com"), true);
	assert.equal(staleTestUserEmail.test("SQ-ABCD1234@EXAMPLE.COM"), true);
	assert.equal(isExpiredTestUser("sq-deadbeef@example.com", staleAt, now), true);
	assert.equal(isExpiredTestUser("sq-deadbeef@example.com", freshAt, now), false);
	assert.equal(isExpiredTestUser("sq-deadbeef@example.com", freshAt + 1, now), false);
});

test("the sweep deletes only an exact stale test address", async () => {
	const removed = [];
	const pages = [
		[
			row("user_stale", "sq-abcd1234@example.com"),
			row("user_fresh", "sq-00abcdef@example.com", freshAt),
			row("user_folded", "SQ-ABCDEF01@example.com"),
			row("user_moe", "moe@10claws.com", 0),
			row("user_subs", "subs@10claws.com", 0),
			row("user_demo", "demo@10squads.com", 0),
			row("user_3Lazhi4zDFFw28I6hhujdsQrV4W", "sq-11111111@example.com", 0),
			row("org_3Lazia1HC1hdgfY0mAttb1qTWYm", "sq-22222222@example.com", 0),
			row("user_tagged", "sq-33333333+clerk_test@example.com", 0),
			{
				id: "user_mixed",
				email_addresses: [{ email_address: "sq-44444444@example.com" }, { email_address: "moe@10claws.com" }],
				created_at: 0,
			},
		],
		{ data: [row("user_next", "sq-55555555@example.com")] },
	];
	let calls = 0;
	const deleted = await sweepExpiredTestUsers({
		now,
		pageSize: 10,
		list: async () => pages[calls++] ?? [],
		remove: async (id) => {
			removed.push(id);
		},
	});
	assert.equal(deleted, 3);
	assert.deepEqual(removed, ["user_stale", "user_folded", "user_next"]);
	assert.equal(removed.includes("user_3Lazhi4zDFFw28I6hhujdsQrV4W"), false);
	assert.equal(removed.includes("org_3Lazia1HC1hdgfY0mAttb1qTWYm"), false);
});

test("the sweep stops when the Clerk list does not end", async () => {
	const removed = [];
	await assert.rejects(
		() =>
			sweepExpiredTestUsers({
				now,
				pageSize: 1,
				list: async () => [row("user_moe", "moe@10claws.com", 0)],
				remove: async (id) => {
					removed.push(id);
				},
			}),
		/Clerk list users did not end/,
	);
	assert.deepEqual(removed, []);
});

test("a missing Clerk secret skips the sweep", async () => {
	assert.equal(await sweepClerkTestUsers({ secret: "" }), 0);
});

test("the sweep lists every candidate before it deletes one", async () => {
	const events = [];
	const pages = [
		[row("user_stale", "sq-abcd1234@example.com"), row("user_fresh", "sq-00abcdef@example.com", freshAt)],
		[row("user_next", "sq-55555555@example.com")],
	];
	let calls = 0;
	const deleted = await sweepExpiredTestUsers({
		now,
		pageSize: 2,
		list: async () => {
			events.push("list");
			return pages[calls++] ?? [];
		},
		remove: async (id) => {
			events.push(id);
		},
	});
	assert.equal(deleted, 2);
	assert.deepEqual(events, ["list", "list", "user_stale", "user_next"]);
});

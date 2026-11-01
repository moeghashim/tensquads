import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summaryLine } from "./catalog.ts";
import { back, initialSignup, markCreated, nextDetails, openAccount, pickKind, togglePicked } from "./machine.ts";

describe("sign-up machine", () => {
	it("starts at business type with no squads", () => {
		const state = initialSignup();
		assert.equal(state.step, "choose");
		assert.equal(state.kind, null);
		assert.deepEqual(state.picked, []);
	});

	it("pre-selects the design squads for each type", () => {
		const next = pickKind(initialSignup(), "new");
		assert.equal(next.step, "details");
		assert.deepEqual(next.picked, ["marketing", "orders", "support"]);
		const existing = pickKind(initialSignup(), "existing");
		assert.deepEqual(existing.picked, ["orders", "support", "finance", "inventory"]);
	});

	it("moves details to squads and back one step", () => {
		const details = pickKind(initialSignup(), "new");
		const squads = nextDetails(details);
		assert.equal(squads.step, "agents");
		assert.equal(back(squads).step, "details");
		assert.equal(back(details).step, "choose");
	});

	it("blocks the account form when no squad is picked", () => {
		let state = nextDetails(pickKind(initialSignup(), "new"));
		for (const id of state.picked) {
			state = togglePicked(state, id);
		}
		assert.equal(state.picked.length, 0);
		assert.equal(openAccount(state).step, "agents");
		assert.equal(summaryLine(0), "Pick at least one squad to start.");
	});

	it("opens the account form and returns to the squad list", () => {
		const squads = nextDetails(pickKind(initialSignup(), "new"));
		const account = openAccount(squads);
		assert.equal(account.step, "account");
		assert.equal(summaryLine(account.picked.length), "3 squads and one master squad will be created.");
		assert.equal(summaryLine(1), "1 squad and one master squad will be created.");
		assert.equal(back(account).step, "agents");
		assert.equal(markCreated(account).step, "created");
	});
});

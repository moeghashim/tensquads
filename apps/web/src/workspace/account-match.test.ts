import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextReread, workspaceChildAccount } from "./account-match.ts";

describe("workspace account match", () => {
	it("reads the account on the leaf screen", () => {
		assert.equal(
			workspaceChildAccount([
				{ routeId: "/_workspace", loaderData: { accountId: "northwind" } },
				{ routeId: "/_workspace/chat", loaderData: { accountId: "demo", events: [] } },
			]),
			"demo",
		);
		assert.equal(workspaceChildAccount([{ routeId: "/_workspace", loaderData: { accountId: "demo" } }]), null);
		assert.equal(workspaceChildAccount([{ routeId: "/_workspace/traffic" }]), null);
	});

	it("rereads once when the screen account is not the frame account", () => {
		assert.equal(nextReread("user-1", "northwind", "demo", null), "user-1:northwind");
		assert.equal(nextReread("user-1", "northwind", "demo", "user-1:northwind"), null);
		assert.equal(nextReread("user-1", "northwind", "northwind", "user-1:northwind"), null);
		assert.equal(nextReread("user-1", "northwind", null, "user-1:northwind"), null);
		assert.equal(nextReread("user-2", "northwind", "demo", "user-1:northwind"), "user-2:northwind");
		assert.equal(nextReread("user-1", "demo", "northwind", "user-1:northwind"), "user-1:demo");
	});
});

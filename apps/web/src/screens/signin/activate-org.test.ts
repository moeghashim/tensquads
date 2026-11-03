import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activateCompanyOrganization, type CompanyClerk } from "./activate-org.ts";

function clerk(options: { memberOf?: readonly string[]; user?: boolean }): {
	session: CompanyClerk;
	active: () => string;
} {
	let chosen = "";
	return {
		active: () => chosen,
		session: {
			user:
				options.user === false
					? null
					: {
							getOrganizationMemberships: async () => ({
								data: (options.memberOf ?? []).map((id) => ({ organization: { id } })),
							}),
						},
			setActive: async (params) => {
				chosen = params.organization;
			},
		},
	};
}

describe("activate the company organization", () => {
	it("does nothing when the organization id is empty", async () => {
		const session = clerk({ memberOf: ["org_company"] });
		await activateCompanyOrganization(session.session, "");
		assert.equal(session.active(), "");
	});

	it("does not switch a user who is not a member", async () => {
		const session = clerk({ memberOf: ["org_other"] });
		await activateCompanyOrganization(session.session, "org_company");
		assert.equal(session.active(), "");
	});

	it("sets the company organization when the user is a member", async () => {
		const session = clerk({ memberOf: ["org_other", "org_company"] });
		await activateCompanyOrganization(session.session, "org_company");
		assert.equal(session.active(), "org_company");
	});

	it("does not throw when the user is missing", async () => {
		const session = clerk({ user: false });
		await activateCompanyOrganization(session.session, "org_company");
		assert.equal(session.active(), "");
	});
});

interface MembershipUser {
	getOrganizationMemberships: () => Promise<{ data: readonly { organization: { id: string } }[] }>;
}

export interface CompanyClerk {
	user: MembershipUser | null | undefined;
	setActive: (params: { organization: string }) => Promise<unknown>;
	load?: () => Promise<unknown>;
}

// Sign-in sets the company organization active only when this user is a member.
// A role in any other organization stays on that organization.
export async function activateCompanyOrganization(clerk: CompanyClerk, orgId: string): Promise<void> {
	if (orgId.length === 0) {
		return;
	}
	if (!clerk.user && clerk.load) {
		await clerk.load();
	}
	const user = clerk.user;
	if (!user) {
		return;
	}
	const memberships = await user.getOrganizationMemberships();
	const member = memberships.data.some((item) => item.organization.id === orgId);
	if (!member) {
		return;
	}
	await clerk.setActive({ organization: orgId });
}

import { redirect } from "@tanstack/react-router";

import { requireClerkSession, requireClerkUser } from "./session.ts";
import { workerEnv } from "./worker-env.ts";

const superAdminRole = "org:super_admin";

// The session already carries the active organization and its role.
// This reads that session. It does not call the Clerk Backend API.
export async function isSuperAdmin(): Promise<boolean> {
	const orgId = await workerEnv("CLERK_PLATFORM_ORG_ID");
	if (orgId.length === 0) {
		return false;
	}
	const session = await requireClerkSession();
	return session.organizationId === orgId && session.role === superAdminRole;
}

export async function requireSuperAdmin(): Promise<void> {
	await requireClerkUser();
	if (!(await isSuperAdmin())) {
		throw redirect({ to: "/overview" });
	}
}

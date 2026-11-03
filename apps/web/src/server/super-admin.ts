import { redirect } from "@tanstack/react-router";

import { requireClerkUser } from "./session.ts";
import { workerEnv } from "./worker-env.ts";

const superAdminRole = "org:super_admin";

// The session already carries the active organization and its role.
// This reads that session. It does not call the Clerk Backend API.
export async function isSuperAdmin(): Promise<boolean> {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	const orgId = await workerEnv("CLERK_PLATFORM_ORG_ID");
	if (secret.length === 0 || orgId.length === 0) {
		return false;
	}
	const { auth } = await import("@clerk/tanstack-react-start/server");
	const session = await auth();
	if (!session.userId || session.orgId !== orgId) {
		return false;
	}
	return session.has({ role: superAdminRole });
}

export async function requireSuperAdmin(): Promise<void> {
	await requireClerkUser();
	if (!(await isSuperAdmin())) {
		throw redirect({ to: "/overview" });
	}
}

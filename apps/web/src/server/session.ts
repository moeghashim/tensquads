import { redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { SessionRefreshNeeded } from "./session-error.ts";
import { workerEnv } from "./worker-env.ts";

const absentSession = "session-token-and-uat-missing";

export interface ClerkIdentity {
	readonly userId: string;
	readonly organizationId: string | null;
	readonly role: string | null;
}

interface ClerkAuth {
	readonly userId: string | null;
	readonly orgId?: string | null;
	readonly orgRole?: string | null;
	readonly debug?: () => { readonly reason?: unknown };
}

export async function requireClerkUser(): Promise<string> {
	const session = await requireClerkSession();
	return session.userId;
}

export async function requireClerkSession(): Promise<ClerkIdentity> {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	if (secret.length === 0) {
		throw redirect({ to: "/signin" });
	}
	const request = getRequest();
	assertActive(request);
	let session: ClerkAuth;
	try {
		const { auth } = await import("@clerk/tanstack-react-start/server");
		session = await auth();
	} catch (error) {
		assertActive(request);
		throw error;
	}
	assertActive(request);
	const userId = textOrNull(session.userId);
	if (userId) {
		return {
			userId,
			organizationId: textOrNull(session.orgId),
			role: textOrNull(session.orgRole),
		};
	}
	// Only a missing session and client opens sign-in. Any other signed-out answer grants nothing.
	if (sessionReason(session) === absentSession) {
		throw redirect({ to: "/signin" });
	}
	throw new SessionRefreshNeeded();
}

function assertActive(request: Request): void {
	if (request.signal.aborted) {
		throw new DOMException("The operation was aborted.", "AbortError");
	}
}

function sessionReason(session: ClerkAuth): string {
	try {
		const reason = session.debug?.().reason;
		return typeof reason === "string" ? reason : "";
	} catch {
		return "";
	}
}

function textOrNull(value: string | null | undefined): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

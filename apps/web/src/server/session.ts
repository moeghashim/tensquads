import { redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { workerEnv } from "./worker-env.ts";

const absentSession = "session-token-and-uat-missing";

interface ClerkSession {
	readonly userId: string | null;
	readonly debug?: () => { readonly reason?: unknown };
}

export async function requireClerkUser(): Promise<string> {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	if (secret.length === 0) {
		throw redirect({ to: "/signin" });
	}
	const request = getRequest();
	assertActive(request);
	let session: ClerkSession;
	try {
		const { auth } = await import("@clerk/tanstack-react-start/server");
		session = await auth();
	} catch (error) {
		assertActive(request);
		throw error;
	}
	assertActive(request);
	if (session.userId) return session.userId;
	// A fetch cannot complete Clerk's document handshake. Clerk then answers
	// signed-out for a token refresh. Only a missing session and client open /signin.
	if (sessionReason(session) === absentSession) {
		throw redirect({ to: "/signin" });
	}
	const userId = await userIdFromSessionCookie(request, secret);
	assertActive(request);
	if (userId) return userId;
	throw new Error("The session could not be read.");
}

function assertActive(request: Request): void {
	if (request.signal.aborted) {
		throw new DOMException("The operation was aborted.", "AbortError");
	}
}

function sessionReason(session: ClerkSession): string {
	const reason = session.debug?.().reason;
	return typeof reason === "string" ? reason : "";
}

async function userIdFromSessionCookie(request: Request, secret: string): Promise<string | null> {
	const { verifyToken } = await import("@clerk/backend");
	let newest = 0;
	let userId: string | null = null;
	for (const token of sessionCookies(request)) {
		assertActive(request);
		try {
			const claims = await verifyToken(token, { secretKey: secret });
			const issued = typeof claims.iat === "number" ? claims.iat : 0;
			const subject = typeof claims.sub === "string" ? claims.sub : "";
			if (subject.length > 0 && issued >= newest) {
				newest = issued;
				userId = subject;
			}
		} catch {
			if (request.signal.aborted) {
				throw new DOMException("The operation was aborted.", "AbortError");
			}
		}
	}
	return userId;
}

function sessionCookies(request: Request): string[] {
	const header = request.headers.get("cookie") ?? "";
	const tokens: string[] = [];
	for (const part of header.split(";")) {
		const trimmed = part.trim();
		const split = trimmed.indexOf("=");
		if (split <= 0) continue;
		const name = trimmed.slice(0, split);
		if (name !== "__session" && !name.startsWith("__session_")) continue;
		try {
			const value = decodeURIComponent(trimmed.slice(split + 1));
			if (value.length > 0) tokens.push(value);
		} catch {
			// A malformed cookie is not a session.
		}
	}
	return tokens;
}

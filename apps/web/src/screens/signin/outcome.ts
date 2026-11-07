// Maps what Clerk returns after a password attempt to one step and one message.
// Pure code: no Clerk import, so the unit test runs without Clerk or a browser.

export const wrongError = "That email or password is wrong.";

// NEW TEXT. Needs Moe's approval before it ships.
// The design (design/SignIn.dc.html) has no string for these states.
// AGENTS.md: a new state is a question. These strings are the proposal.
export const newSignInText = {
	// Clerk asks for a second factor, a new-device check, or a new password.
	extraStep: "Sign-in needs one more check. This page cannot do that yet.",
	// The request failed before Clerk answered, or the session did not finish.
	network: "Sign-in could not reach the server. Check your connection and try again.",
} as const;

export type ClerkFailure =
	| {
			code?: string;
			errors?: readonly { code: string }[];
	  }
	| null
	| undefined;

export type SignInStep =
	| { kind: "complete" }
	| { kind: "session_exists" }
	| { kind: "extra_step" }
	| { kind: "wrong" }
	| { kind: "network" };

// Statuses that need a step this page does not have.
const extraStatuses = new Set([
	"needs_first_factor",
	"needs_second_factor",
	"needs_client_trust",
	"needs_new_password",
	"needs_protect_check",
]);

export function classifySignIn(input: {
	error: ClerkFailure;
	status: string | null;
	sessionId: string | null;
}): SignInStep {
	if (input.error) {
		// Another session is already active in this browser.
		if (failureCodes(input.error).includes("session_exists")) {
			return { kind: "session_exists" };
		}
		// Clerk rejected the credentials, or an error this page does not name.
		return { kind: "wrong" };
	}
	if (input.status === "complete" && input.sessionId) {
		return { kind: "complete" };
	}
	if (input.status !== null && extraStatuses.has(input.status)) {
		return { kind: "extra_step" };
	}
	return { kind: "wrong" };
}

// The text to show for a step. Empty when the step needs no message.
export function messageFor(step: SignInStep): string {
	switch (step.kind) {
		case "wrong":
			return wrongError;
		case "extra_step":
			return newSignInText.extraStep;
		case "network":
			return newSignInText.network;
		case "complete":
		case "session_exists":
			return "";
	}
}

// True when the signed-in account is the one typed in the form.
export function sameAccount(activeEmail: string | null | undefined, typedEmail: string): boolean {
	if (!activeEmail) return false;
	return activeEmail.trim().toLowerCase() === typedEmail.trim().toLowerCase();
}

function failureCodes(error: NonNullable<ClerkFailure>): string[] {
	const codes: string[] = [];
	if (typeof error.code === "string") codes.push(error.code);
	for (const item of error.errors ?? []) codes.push(item.code);
	return codes;
}

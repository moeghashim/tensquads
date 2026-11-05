export type ClerkUserId = string | null | undefined;

// Clerk can report a loaded null before the first user on a new document.
// That arrival is not an account switch. Leaving a real user id is.
export function clerkAccountReset(
	previous: ClerkUserId,
	next: ClerkUserId,
	session: number,
): { readonly previous: ClerkUserId; readonly reset: boolean } {
	if (next === undefined || previous === next) return { previous, reset: false };
	if (previous === undefined) return { previous: next, reset: false };
	const firstUser = previous === null && typeof next === "string" && session === 0;
	return { previous: next, reset: !firstUser };
}

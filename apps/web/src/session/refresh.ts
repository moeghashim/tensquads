import { getRouterInstance } from "@tanstack/react-start";

import { createSessionRefresh } from "#/session/refresh-controller.ts";

const refresh = createSessionRefresh({
	token: freshToken,
	reload: reloadOnce,
	signIn: goToSignIn,
});

let listening = false;

export function beginSessionRead(): number {
	listenForNextAction();
	return refresh.begin();
}

export function endSessionRead(requestId: number): void {
	refresh.end(requestId);
}

export async function finishSessionRead(error: unknown, method: string, requestId: number): Promise<void> {
	await refresh.finish(error, method, requestId);
}

function listenForNextAction(): void {
	if (listening || typeof window === "undefined") return;
	listening = true;
	const reset = () => {
		refresh.noteAction();
	};
	window.addEventListener("pointerdown", reset, true);
	window.addEventListener("keydown", reset, true);
}

function reloadOnce(): void {
	void reloadRouter();
}

async function reloadRouter(): Promise<void> {
	const router = await getRouterInstance();
	void router.invalidate();
}

async function goToSignIn(): Promise<void> {
	const router = await getRouterInstance();
	await router.navigate({ to: "/signin" });
}

interface ClerkTokenSession {
	getToken(options: { skipCache: true }): Promise<string | null>;
}

async function freshToken(): Promise<string | null> {
	if (typeof window === "undefined") return null;
	const session = clerkSession();
	if (!session) return null;
	const token = await session.getToken({ skipCache: true });
	return typeof token === "string" && token.length > 0 ? token : null;
}

function clerkSession(): ClerkTokenSession | null {
	const clerk = (window as Window & { Clerk?: { session?: ClerkTokenSession | null } }).Clerk;
	return clerk?.session ?? null;
}

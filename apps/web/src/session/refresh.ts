import { getRouterInstance } from "@tanstack/react-start";

import { createSessionRefresh } from "#/session/refresh-controller.ts";

const refresh = createSessionRefresh({
	token: freshToken,
	reload: reloadOnce,
	signIn: goToSignIn,
});

let listening = false;
let ignoreNavigation = false;
let armed = false;
let armStamp = 0;

export function beginSessionRead(): number {
	listenForNextAction();
	if (armed) {
		armed = false;
		refresh.noteAction();
	}
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
	window.addEventListener("click", armUserRequest, true);
	void listenToRouter();
}

// A click arms the next server call in this turn. A later poll keeps the current allowance.
function armUserRequest(): void {
	armed = true;
	const stamp = ++armStamp;
	setTimeout(() => {
		if (armStamp === stamp) armed = false;
	}, 0);
}

async function listenToRouter(): Promise<void> {
	const router = await getRouterInstance();
	let previous = locationKey(router.history.location);
	router.history.subscribe((event) => {
		const next = locationKey(event.location);
		const changed = next !== previous;
		previous = next;
		if (!changed || ignoreNavigation) return;
		refresh.noteAction();
	});
}

function locationKey(location: { pathname: string; search: string }): string {
	return `${location.pathname}${location.search}`;
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
	ignoreNavigation = true;
	try {
		await router.navigate({ to: "/signin" });
	} finally {
		ignoreNavigation = false;
	}
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

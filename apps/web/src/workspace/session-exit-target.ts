import { isRedirect } from "@tanstack/react-router";

const sessionExits = new Set(["/admin", "/signin"]);
const workspaceRoots = ["/overview", "/rules", "/traffic", "/chat", "/agents"];

// One document load. A second redirect must not assign again.
let navigationStarted = false;

// The support session is the workspace. Admin and sign-in pages keep their own redirects.
export function workspacePage(path: string): boolean {
	const bare = stripSlash(stripQuery(path));
	return workspaceRoots.some((root) => bare === root || bare.startsWith(`${root}/`));
}

// A workspace server call that redirects here ends the support session.
// Other redirects, including /signup, /overview, and /agents, stay in the app.
export function sessionExitTarget(error: unknown): string | null {
	const path = redirectPath(error);
	if (path === null || !sessionExits.has(path)) return null;
	return path;
}

// Leaves at once. This module is already loaded, so the navigation does not fetch another file.
export function beginDocumentExit(error: unknown): boolean {
	const target = exitPath(error);
	if (target === null) return false;
	if (navigationStarted) return true;
	navigationStarted = true;
	window.location.assign(target);
	return true;
}

function exitPath(error: unknown): string | null {
	const target = sessionExitTarget(error);
	if (stopped(target)) return null;
	return target;
}

function stopped(target: string | null): boolean {
	if (target === null || typeof window === "undefined") return true;
	if (!workspacePage(window.location.pathname)) return true;
	return window.location.pathname === target;
}

function redirectPath(error: unknown): string | null {
	if (typeof Response === "undefined" || !isRedirect(error)) return null;
	return pathOf(redirectText(error));
}

function redirectText(error: Response & { options?: { to?: unknown; href?: unknown } }): string {
	const options = error.options;
	if (typeof options?.to === "string" && options.to.length > 0) return options.to;
	if (typeof options?.href === "string" && options.href.length > 0) return options.href;
	return error.headers.get("location") ?? "";
}

function pathOf(value: string): string | null {
	const bare = stripQuery(value);
	if (bare.startsWith("/")) return stripSlash(bare);
	return absolutePath(bare);
}

function stripQuery(value: string): string {
	const hash = value.split("#")[0] ?? "";
	return hash.split("?")[0] ?? "";
}

function stripSlash(path: string): string {
	if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
	return path;
}

function absolutePath(value: string): string | null {
	if (!value.startsWith("http://") && !value.startsWith("https://")) return null;
	try {
		return stripSlash(new URL(value).pathname);
	} catch {
		return null;
	}
}

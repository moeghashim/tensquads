import { decodeJwt } from "@clerk/backend/jwt";
import { getCookieSuffix, isDevelopmentFromPublishableKey, parsePublishableKey } from "@clerk/shared/keys";

import { workerEnv } from "./worker-env.ts";

const sessionCookie = "__session";
const clientUatCookie = "__client_uat";
const devBrowserCookie = "__clerk_db_jwt";

const suffixes = new Map<string, Promise<string>>();
let cachedPublishableKey = "";

// clerk-js can store the dev-browser token in memory and write __session_<suffix> first.
// A document GET then has no __clerk_db_jwt_<suffix>. Clerk starts a handshake and replaces the client.
// Drop those two suffixed names from the request Clerk reads. Do this only for a development key.
// The unsuffixed names must already carry the same values, and the session must belong to this key.
// This does not write a cookie, copy a value, or change a cookie attribute.

export async function clerkPublishableKey(): Promise<string> {
	if (cachedPublishableKey.length > 0) return cachedPublishableKey;
	const key = await readPublishableKey();
	if (key.length > 0) cachedPublishableKey = key;
	return key;
}

export function clerkDocumentGet(request: Request): boolean {
	if (request.method !== "GET") return false;
	const dest = request.headers.get("sec-fetch-dest");
	if (dest === "document" || dest === "iframe") return true;
	if (dest) return false;
	const accept = request.headers.get("accept");
	return accept?.startsWith("text/html") ?? false;
}

export async function documentRequestForClerk(request: Request, publishableKey: string): Promise<Request> {
	if (!clerkDocumentGet(request) || !isDevelopmentFromPublishableKey(publishableKey)) return request;
	const header = request.headers.get("cookie");
	if (header === null || header.length === 0) return request;
	const suffix = await cookieSuffix(publishableKey);
	if (suffix.length === 0) return request;
	const nextHeader = omitOrphanSuffix(header, publishableKey, suffix);
	if (nextHeader === header) return request;
	const headers = new Headers(request.headers);
	if (nextHeader.length === 0) headers.delete("cookie");
	else headers.set("cookie", nextHeader);
	return new Request(request, { headers });
}

async function readPublishableKey(): Promise<string> {
	const fromVite = await workerEnv("VITE_CLERK_PUBLISHABLE_KEY");
	if (fromVite.length > 0) return fromVite;
	const fromClerk = await workerEnv("CLERK_PUBLISHABLE_KEY");
	if (fromClerk.length > 0) return fromClerk;
	return metaEnv("VITE_CLERK_PUBLISHABLE_KEY") || metaEnv("CLERK_PUBLISHABLE_KEY");
}

function metaEnv(name: string): string {
	const env = import.meta.env as Record<string, unknown> | undefined;
	const value = env?.[name];
	return typeof value === "string" ? value : "";
}

function cookieSuffix(publishableKey: string): Promise<string> {
	const cached = suffixes.get(publishableKey);
	if (cached) return cached;
	const pending = getCookieSuffix(publishableKey);
	suffixes.set(publishableKey, pending);
	return pending;
}

function omitOrphanSuffix(header: string, publishableKey: string, suffix: string): string {
	const parts = cookieParts(header);
	const values = firstValues(parts);
	const devBrowser = values.get(devBrowserCookie) ?? "";
	const suffixedDevBrowser = values.get(`${devBrowserCookie}_${suffix}`) ?? "";
	if (devBrowser.length === 0 || suffixedDevBrowser.length > 0) return header;
	const session = values.get(sessionCookie) ?? "";
	const suffixedSession = values.get(`${sessionCookie}_${suffix}`) ?? "";
	if (session.length === 0 || session !== suffixedSession || !sessionBelongsToKey(session, publishableKey)) {
		return header;
	}
	const clientUat = values.get(clientUatCookie) ?? "";
	const suffixedClientUat = values.get(`${clientUatCookie}_${suffix}`) ?? "";
	if (clientUat.length === 0 || clientUat === "0" || clientUat !== suffixedClientUat) return header;
	const kept = parts.filter(
		(part) => part.name !== `${sessionCookie}_${suffix}` && part.name !== `${clientUatCookie}_${suffix}`,
	);
	if (kept.length === parts.length) return header;
	return joinKept(kept);
}

function sessionBelongsToKey(token: string, publishableKey: string): boolean {
	const parsed = parsePublishableKey(publishableKey);
	if (parsed === null) return false;
	try {
		const issuer = decodeJwt(token).payload.iss;
		if (typeof issuer !== "string" || issuer.length === 0) return false;
		return issuer.replace(/https?:\/\//gi, "") === parsed.frontendApi;
	} catch {
		return false;
	}
}

interface CookiePart {
	readonly name: string;
	readonly value: string;
	readonly raw: string;
}

function cookieParts(header: string): CookiePart[] {
	const parts: CookiePart[] = [];
	const length = header.length;
	let index = 0;
	while (index < length) {
		const eq = header.indexOf("=", index);
		if (eq === -1) break;
		const semicolon = header.indexOf(";", index);
		const end = semicolon === -1 ? length : semicolon;
		if (eq > end) {
			index = header.lastIndexOf(";", eq - 1) + 1;
			continue;
		}
		const name = sliceTrim(header, index, eq);
		const value = decodeCookieValue(sliceTrim(header, eq + 1, end));
		parts.push({ name, value, raw: header.slice(index, end) });
		index = end + 1;
	}
	return parts;
}

function firstValues(parts: readonly CookiePart[]): Map<string, string> {
	const values = new Map<string, string>();
	for (const part of parts) {
		if (part.name.length === 0 || values.has(part.name)) continue;
		values.set(part.name, part.value);
	}
	return values;
}

function joinKept(parts: readonly CookiePart[]): string {
	return parts
		.map((part) => part.raw)
		.join(";")
		.replace(/^[\s;]+/, "");
}

function sliceTrim(value: string, start: number, end: number): string {
	let left = start;
	let right = end;
	while (left < right) {
		const code = value.charCodeAt(left);
		if (code !== 32 && code !== 9) break;
		left += 1;
	}
	while (right > left) {
		const code = value.charCodeAt(right - 1);
		if (code !== 32 && code !== 9) break;
		right -= 1;
	}
	return value.slice(left, right);
}

function decodeCookieValue(value: string): string {
	if (!value.includes("%")) return value;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

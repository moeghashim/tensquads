const devBrowser = "__clerk_db_jwt";
const suffixSources = ["__session", "__client_uat"];

// Clerk uses the suffixed dev browser cookie whenever the session cookies are suffixed.
// The unsuffixed cookie is what the browser can still send after a hard navigation.
// Copying it keeps the signed-in client, so an expired support session stays on /admin.
export function withDevBrowserCookie(header: string): string {
	const pairs = readPairs(header);
	const token = pairs.get(devBrowser);
	if (!token || !usable(token)) return header;
	const extra: string[] = [];
	for (const suffix of suffixes(pairs)) {
		const name = `${devBrowser}_${suffix}`;
		if (pairs.has(name)) continue;
		extra.push(`${name}=${token}`);
	}
	if (extra.length === 0) return header;
	const trimmed = header.trim();
	return `${trimmed}${trimmed.length > 0 ? "; " : ""}${extra.join("; ")}`;
}

// Rewrites the dev browser as a first-party Lax cookie before a document exit.
// A SameSite=None cookie can be dropped on that navigation while the session cookie is kept.
export function devBrowserCookieWrites(cookie: string, href: string): readonly string[] {
	const token = tokenFrom(cookie, href);
	if (!token) return [];
	const pairs = readPairs(cookie);
	const names = new Set<string>([devBrowser]);
	for (const name of pairs.keys()) {
		if (name === devBrowser || name.startsWith(`${devBrowser}_`)) names.add(name);
	}
	for (const suffix of suffixes(pairs)) names.add(`${devBrowser}_${suffix}`);
	return [...names].map((name) => `${name}=${token}; Path=/; Max-Age=31536000; SameSite=Lax`);
}

export function requestWithDevBrowser(request: Request): Request {
	if (!documentGet(request)) return request;
	const cookie = request.headers.get("cookie");
	if (!cookie) return request;
	const carried = withDevBrowserCookie(cookie);
	if (carried === cookie) return request;
	const headers = new Headers(request.headers);
	headers.set("cookie", carried);
	return new Request(request, { headers });
}

function documentGet(request: Request): boolean {
	if (request.method !== "GET") return false;
	const dest = request.headers.get("sec-fetch-dest");
	if (dest === "document" || dest === "iframe") return true;
	if (dest) return false;
	return (request.headers.get("accept") ?? "").startsWith("text/html");
}

function tokenFrom(cookie: string, href: string): string | null {
	const fromUrl = readUrlToken(href);
	if (fromUrl) return fromUrl;
	const pairs = readPairs(cookie);
	const plain = pairs.get(devBrowser);
	if (plain && usable(plain)) return plain;
	for (const [name, value] of pairs) {
		if (name.startsWith(`${devBrowser}_`) && usable(value)) return value;
	}
	return null;
}

function readUrlToken(href: string): string | null {
	if (!href) return null;
	try {
		const token = new URL(href).searchParams.get(devBrowser);
		return token && usable(token) ? token : null;
	} catch {
		return null;
	}
}

function suffixes(pairs: ReadonlyMap<string, string>): string[] {
	const found: string[] = [];
	for (const name of pairs.keys()) {
		const suffix = suffixOf(name);
		if (suffix && !found.includes(suffix)) found.push(suffix);
	}
	return found;
}

function suffixOf(name: string): string | null {
	for (const base of suffixSources) {
		const prefix = `${base}_`;
		if (!name.startsWith(prefix)) continue;
		const suffix = name.slice(prefix.length);
		if (/^[A-Za-z0-9_-]{1,32}$/.test(suffix)) return suffix;
	}
	return null;
}

function readPairs(header: string): Map<string, string> {
	const pairs = new Map<string, string>();
	for (const part of header.split(";")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		pairs.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
	}
	return pairs;
}

function usable(value: string): boolean {
	return value.length > 0 && !/[\s;,]/.test(value);
}

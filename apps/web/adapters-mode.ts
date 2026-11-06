interface WranglerEnv {
	readonly vars?: { readonly ADAPTERS?: unknown };
}

interface WranglerConfig {
	readonly vars?: { readonly ADAPTERS?: unknown };
	readonly env?: Readonly<Record<string, WranglerEnv>>;
}

// The Cloudflare Vite plugin selects the wrangler environment from CLOUDFLARE_ENV.
// An empty name, or a name with no env block, stays on the top-level production config.
export function adaptersMode(source: string, cloudflareEnv: string | undefined): string {
	const config = parseWrangler(source);
	const name = cloudflareEnv?.trim() ?? "";
	if (name.length > 0 && config?.env && Object.hasOwn(config.env, name)) {
		return readAdapters(config.env[name]) ?? "test";
	}
	return readAdapters(config) ?? "test";
}

export function masterStubId(mode: string, imported: string, stub: string): string | null {
	if (mode === "real" || !imported.endsWith("master-live.ts")) return null;
	return stub;
}

export function publishStubId(mode: string, imported: string, stub: string): string | null {
	if (mode === "real" || !imported.endsWith("publish-live.ts")) return null;
	return stub;
}

function readAdapters(value: WranglerEnv | undefined): string | undefined {
	const mode = value?.vars?.ADAPTERS;
	return typeof mode === "string" && mode.length > 0 ? mode : undefined;
}

function parseWrangler(source: string): WranglerConfig | undefined {
	try {
		return JSON.parse(source.replace(/^\s*\/\/.*$/gm, "")) as WranglerConfig;
	} catch {
		return undefined;
	}
}

const DAY_MS = 86_400_000;

export function sizeText(vcpu: number, memoryGB: number): string {
	return `${vcpu} vCPU · ${memoryGB} GB`;
}

export function cpuText(percents: readonly number[], vcpu: number): string {
	if (vcpu <= 0) return "0%";
	const sum = percents.reduce((total, value) => total + value, 0);
	return `${Math.round(sum / vcpu)}%`;
}

export function uptimeText(now: Date, hydratedAt: Date | null, createdAt: Date | null): string {
	const start = hydratedAt ?? createdAt;
	if (!start) return "Just started";
	const days = Math.floor((now.getTime() - start.getTime()) / DAY_MS);
	if (days < 1) return "Just started";
	if (days === 1) return "1 day";
	return `${days} days`;
}

export function hostName(agentId: string): string {
	return `vps-${agentId}-01`;
}

export function imageTag(imageId: string, version: string): string {
	return `registry.agents.co/${imageId}:${version}`;
}

// Dashed snapshot names are not parsed. The real run uses this table only.
export const REAL_RUN_IMAGES = [
	{
		agentId: "market",
		snapshot: "tensquads-market-0-1-0",
		imageTag: "registry.agents.co/market:0.1.0",
		imageId: "market",
		version: "0.1.0",
	},
	{
		agentId: "website",
		snapshot: "tensquads-website-0-1-0",
		imageTag: "registry.agents.co/website:0.1.0",
		imageId: "website",
		version: "0.1.0",
	},
] as const;

export function realRunImage(templateId: string) {
	return REAL_RUN_IMAGES.find((row) => row.snapshot === templateId);
}

export function realRunAgent(agentId: string) {
	return REAL_RUN_IMAGES.find((row) => row.agentId === agentId);
}

export function templateName(imageId: string, version: string): string {
	return `tensquads-${imageId}-${version}`;
}

export function sourceName(imageId: string, version: string): string {
	return `tpl-${imageId}-${version}`.replaceAll(".", "-").toLowerCase().slice(0, 63);
}

export function imageFromTemplate(templateId: string): { readonly imageId: string; readonly version: string } {
	const known = realRunImage(templateId);
	if (known) return { imageId: known.imageId, version: known.version };
	if (!templateId.startsWith("tensquads-")) throw new Error("The template id is not valid.");
	const rest = templateId.slice("tensquads-".length);
	const split = rest.lastIndexOf("-");
	if (split <= 0 || split === rest.length - 1) {
		throw new Error("The template id is not valid.");
	}
	return { imageId: rest.slice(0, split), version: rest.slice(split + 1) };
}

// A resume that names env replaces the sandbox env. Omit both fields to keep them.
export function resumeInput(
	sandboxId: string,
	environment: string | undefined,
	env: Record<string, string> | undefined,
) {
	if (!environment && !env) return { sandboxId };
	return {
		sandboxId,
		resumeRequest: { ...(environment ? { environment } : {}), ...(env ? { env } : {}) },
	};
}

export function hostOf(baseUrl: string): string {
	return new URL(baseUrl).host;
}

export function startKey(accountId: string, agentId: string, image: string): string {
	return `tensquads-start-${accountId}-${agentId}-${image}`;
}

export function templateKey(accountId: string, imageId: string, version: string): string {
	return `tensquads-template-${accountId}-${imageId}-${version}`;
}

// Boat refuses a reused Idempotency-Key with a different body. A retry of the same body keeps
// its key, so a lost reply still creates one machine. A changed body, such as new model
// settings after the old machine was removed, gets a new key.
export async function keyFor(baseKey: string, body: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(body));
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	const hex = Array.from(digest.slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${baseKey}-${hex}`;
}

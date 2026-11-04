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

export function templateName(imageId: string, version: string): string {
	return `tensquads-${imageId}-${version}`;
}

export function sourceName(imageId: string, version: string): string {
	return `tpl-${imageId}-${version}`.replaceAll(".", "-").toLowerCase().slice(0, 63);
}

export function imageFromTemplate(templateId: string): { readonly imageId: string; readonly version: string } {
	const rest = templateId.startsWith("tensquads-") ? templateId.slice("tensquads-".length) : templateId;
	const split = rest.lastIndexOf("-");
	if (split <= 0 || split === rest.length - 1) {
		throw new Error("The template id is not valid.");
	}
	return { imageId: rest.slice(0, split), version: rest.slice(split + 1) };
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

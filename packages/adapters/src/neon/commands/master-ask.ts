export const briefAsk = "Build the site with this brief?";
export const publishAsk = "Publish the site?";

// Overview and decide both require an agent row. The proof squad that builds the site is website.
export const siteAgent = "website";

export function masterAsk(title: string): boolean {
	return title === briefAsk || title === publishAsk;
}

export function askDetail(event: {
	readonly kind: string;
	readonly from: string;
	readonly to: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
}): string | null {
	if (event.kind !== "Approval" || event.from !== "master" || event.to !== "user") return null;
	if (event.text === briefAsk) return textOf(event.payload.brief);
	if (event.text === publishAsk) return typeof event.payload.previewUrl === "string" ? event.payload.previewUrl : "";
	return null;
}

function textOf(brief: unknown): string {
	if (brief === null || typeof brief !== "object" || Array.isArray(brief)) return "";
	const text = (brief as { readonly text?: unknown }).text;
	return typeof text === "string" ? text : "";
}

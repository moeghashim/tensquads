export const briefAsk = "Build the site with this brief?";
export const publishAsk = "Publish the site?";
export const watchAsk = "Watch the competitors?";

// Overview and decide both require an agent row. The proof squad that builds the site is website.
const siteAgent = "website";
const watchAgent = "market";

export function masterAsk(title: string): boolean {
	return title === briefAsk || title === publishAsk || title === watchAsk;
}

export function mandateSkill(title: string): string {
	if (title === briefAsk) return "website.build";
	if (title === publishAsk) return "website.publish";
	if (title === watchAsk) return "competition.watch";
	return "";
}

export function askAgent(title: string): string {
	return title === watchAsk ? watchAgent : siteAgent;
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
	if (event.text === watchAsk) return textField(event.payload.query) || watchAsk;
	return null;
}

function textField(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function textOf(brief: unknown): string {
	if (brief === null || typeof brief !== "object" || Array.isArray(brief)) return "";
	const text = (brief as { readonly text?: unknown }).text;
	return typeof text === "string" ? text : "";
}

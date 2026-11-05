// Keyless typecheck resolves the master import here. The kit typecheck uses the real module.

export interface BusinessRequest {
	readonly businessName: string;
	readonly businessType: "restaurant" | "grocer";
	readonly items: readonly { readonly name: string; readonly price: string; readonly section: string }[];
	readonly cuisine?: string;
}

export interface PageAudit {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly p0: number;
	readonly p1: number;
	readonly horizontalScroll: boolean;
}

export type PageReader = (url: string) => Promise<{ readonly status: number; readonly body: string }>;

export interface RenderedPage {
	readonly visibleText: string;
	readonly cssContent: readonly string[];
	readonly linkTexts: readonly string[];
	readonly imageCount: number;
	readonly horizontalScroll: boolean;
	readonly keyboard: boolean;
	readonly contrast: boolean;
}

export function pageDocument(html: string): string {
	return html;
}

export function collectRendered(): RenderedPage {
	return {
		visibleText: "",
		cssContent: [],
		linkTexts: [],
		imageCount: 0,
		horizontalScroll: false,
		keyboard: true,
		contrast: true,
	};
}

export interface ProofStory {
	readonly request: BusinessRequest;
	readonly report: { readonly gap: string };
	readonly brief: string;
	readonly pageHtml: string;
	readonly previewUrl: string;
	readonly publishedUrl: string;
	readonly events: readonly unknown[];
	readonly pages: Record<string, { status: number; body: string }>;
	readonly audit: PageAudit;
}

export function proofStory(): Promise<ProofStory> {
	return Promise.reject(new Error("The proof story is not available."));
}

export function createMaster(_request: unknown, _ports: unknown): { accept: (event: unknown) => Promise<unknown[]> } {
	return { accept: () => Promise.resolve([]) };
}

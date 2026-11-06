// Keyless typecheck resolves the master import here. The kit typecheck uses the real module.

export interface BusinessRequest {
	readonly businessName: string;
	readonly businessType: "restaurant" | "grocer";
	readonly items: readonly { readonly name: string; readonly price: string; readonly section: string }[];
	readonly cuisine?: string;
	readonly sections?: readonly string[];
}

export interface PageAudit {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly horizontalScroll: boolean;
}

export interface MasterSnapshot {
	readonly phase: string;
	readonly researchFails: number;
	readonly pageFails: number;
	readonly seq: number;
	readonly report?: unknown;
	readonly brief?: string;
	readonly previewHtml?: string;
	readonly previewUrl?: string;
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
	readonly choice: unknown;
	readonly previewUrl: string;
	readonly publishedUrl: string;
	readonly events: readonly unknown[];
	readonly pages: Record<string, { status: number; body: string }>;
	readonly audit: PageAudit;
}

export function proofStory(): Promise<ProofStory> {
	return Promise.reject(new Error("The proof story is not available."));
}

export function createMaster(
	_request: unknown,
	_ports: unknown,
): {
	accept: (event: unknown) => Promise<unknown[]>;
	snapshot: () => MasterSnapshot;
	restore: (saved: MasterSnapshot) => void;
	createMonitor: (monitorId: string) => Promise<void>;
} {
	return {
		accept: () => Promise.resolve([]),
		snapshot: () => ({ phase: "research", researchFails: 0, pageFails: 0, seq: 0 }),
		restore: () => undefined,
		createMonitor: () => Promise.resolve(),
	};
}

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
	readonly watchFails?: number;
	readonly runTaskId?: string;
	readonly retryPayload?: Readonly<Record<string, unknown>>;
	readonly seq: number;
	readonly report?: unknown;
	readonly brief?: string;
	readonly previewHtml?: string;
	readonly previewUrl?: string;
}

export interface GrantQuery {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly ownerId: string;
	readonly now: string;
}

export interface StoredGrant {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly saidYes: string;
	readonly saidAt: string;
	readonly expiresAt: string;
}

export function syntheticGrant(query: GrantQuery): StoredGrant {
	const parsed = Date.parse(query.now);
	const start = Number.isFinite(parsed) ? parsed : Date.parse("2026-11-05T12:00:00.000Z");
	return {
		...query,
		saidYes: query.ownerId,
		saidAt: query.now,
		expiresAt: new Date(start + 86_400_000).toISOString(),
	};
}

export interface MasterPorts {
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
	readonly mandateAt?: string;
	readonly accountSlug?: string;
	readonly accountId?: string;
	readonly ownerId?: string;
	readonly now?: string;
	readonly loadGrant?: (query: GrantQuery) => StoredGrant | null | Promise<StoredGrant | null>;
	readonly browser?: (html: string) => Promise<RenderedPage>;
	readonly recordMonitor?: (monitorId: string) => void | Promise<void>;
}

export interface MasterEvent {
	readonly id?: string;
	readonly time?: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly trace?: string;
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
	readonly report: {
		readonly gap: string;
		readonly sources: readonly string[];
		readonly gapEvidence: { readonly sourceUrl: string; readonly quote: string };
	};
	readonly brief: string;
	readonly pageHtml: string;
	readonly choice: unknown;
	readonly previewUrl: string;
	readonly publishedUrl: string;
	readonly events: readonly unknown[];
	readonly pages: Record<string, { status: number; body: string }>;
	readonly audit: PageAudit;
}

export function renderItemSection(items: readonly { readonly name: string; readonly price: string }[]): string {
	return items.map((item) => `${item.name}: ${item.price}`).join("\n");
}

export function proofStory(): Promise<ProofStory> {
	return Promise.reject(new Error("The proof story is not available."));
}

export function createMaster(
	_request: unknown,
	_ports: MasterPorts,
): {
	accept: (event: MasterEvent) => Promise<MasterEvent[]>;
	snapshot: () => MasterSnapshot;
	restore: (saved: MasterSnapshot) => void;
	createMonitor: (monitorId: string) => Promise<void>;
	start: () => Promise<MasterEvent>;
} {
	return {
		accept: () => Promise.resolve([]),
		snapshot: () => ({ phase: "research", researchFails: 0, pageFails: 0, seq: 0 }),
		restore: () => undefined,
		createMonitor: () => Promise.resolve(),
		start: () => Promise.reject(new Error("The proof story is not available.")),
	};
}

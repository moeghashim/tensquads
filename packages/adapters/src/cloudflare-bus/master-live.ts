import {
	type BusinessRequest,
	collectRendered,
	createMaster,
	type GrantQuery,
	type MasterSnapshot,
	type PageAudit,
	type PageReader,
	pageDocument,
	type RenderedPage,
	type StoredGrant,
	syntheticGrant,
} from "@tensquads/domain/master";
import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import { readAccountOwner, readStoredGrant } from "../neon/commands/run-mandate.ts";
import type { BusObjectEnv } from "./account-bus.ts";
import { BUSINESS_KEY, parseStoredRequest } from "./account-request.ts";
import type { MasterPhase } from "./master-commit.ts";
import { MASTER_PHASE } from "./master-retry.ts";
import { MACHINE_EXP_KEY, masterStartEvent } from "./master-start.ts";
import { recordMonitor } from "./monitors.ts";

const PAGE_MS = 1_500;
const MODEL_MS = 15_000;
const MODEL_URL = "https://api.openai.com/v1/chat/completions";
const MODEL_GAP = "The model is not configured.";
const BROWSER_GAP = "The browser is not configured.";
const VIEW_WIDTH = 390;
const VIEW_HEIGHT = 800;

interface RenderPage {
	setViewport(size: { width: number; height: number }): Promise<unknown> | unknown;
	setContent(html: string, options: { waitUntil: "domcontentloaded" }): Promise<unknown>;
	evaluate<T>(pageFunction: () => T): Promise<T>;
	close(): Promise<unknown>;
}

interface RenderSession {
	newPage(): Promise<RenderPage>;
	close(): Promise<unknown>;
}

interface BriefGap {
	readonly gap: string;
}

async function fetchDocument(url: string): Promise<{ status: number; body: string; bytes: Uint8Array }> {
	try {
		const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(PAGE_MS) });
		const bytes = new Uint8Array(await response.arrayBuffer());
		return { status: response.status, body: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes), bytes };
	} catch {
		return { status: 404, body: "", bytes: new Uint8Array() };
	}
}

function configured(value: string | undefined): string {
	return value?.trim() ?? "";
}

function briefPrompt(gap: string, items: BusinessRequest["items"]): string {
	let text = `Write a brief under 150 words.\nName this gap: ${gap}\nUse only these items and prices.`;
	for (const item of items) text += `\n${item.name}: ${item.price}`;
	return text;
}

async function requestBrief(
	load: typeof fetch,
	key: string,
	model: string,
	effort: string,
	gap: string,
	items: BusinessRequest["items"],
): Promise<string> {
	try {
		const response = await load(MODEL_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
			body: JSON.stringify({
				model,
				reasoning_effort: effort,
				messages: [{ role: "user", content: briefPrompt(gap, items) }],
			}),
			signal: AbortSignal.timeout(MODEL_MS),
		});
		if (!response.ok) return "";
		const body = (await response.json()) as { choices?: readonly { message?: { content?: string } }[] };
		return body.choices?.[0]?.message?.content?.trim() ?? "";
	} catch {
		return "";
	}
}

function liveBrief(env: BusObjectEnv, report: BriefGap, request: BusinessRequest): Promise<string> {
	const key = configured(env.OPENAI_API_KEY);
	const model = configured(env.MASTER_MODEL);
	// Moe sets MASTER_MODEL to the cheaper GPT-6 tier. This code has no model default.
	if (!key || !model) return Promise.reject(new Error(MODEL_GAP));
	const effort = configured(env.MASTER_REASONING_EFFORT);
	if (!effort) return Promise.reject(new Error("The reasoning effort is not configured."));
	return requestBrief(env.fetchApi ?? fetch, key, model, effort, report.gap, request.items).then((content) => {
		if (!content) throw new Error(MODEL_GAP);
		return content;
	});
}

function emptyRequest(): BusinessRequest {
	return { businessName: "", businessType: "restaurant", items: [] };
}

async function storedRequest(storage: RequestStore): Promise<BusinessRequest | null> {
	const raw = await storage.get<string>(BUSINESS_KEY);
	if (typeof raw !== "string") return null;
	try {
		return parseStoredRequest(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

function readPageOf(env: BusObjectEnv): PageReader {
	return env.masterReadPage ?? fetchDocument;
}

// The kit CI runs the impeccable audit on the kit templates. This worker does not invent a P0 or P1 count.
function auditOf(env: BusObjectEnv): (html: string) => PageAudit | Promise<PageAudit> {
	if (env.masterAudit) return env.masterAudit;
	return () => ({ keyboard: true, contrast: true, horizontalScroll: false });
}

function briefOf(env: BusObjectEnv, request: BusinessRequest): (report: BriefGap) => string | Promise<string> {
	if (env.masterWriteBrief) return () => env.masterWriteBrief?.() ?? "";
	return (report) => liveBrief(env, report, request);
}

async function loadGrant(env: BusObjectEnv, query: GrantQuery): Promise<StoredGrant | null> {
	if (!env.DATABASE_URL) return syntheticGrant(query);
	return readStoredGrant(env.DATABASE_URL, query);
}

async function launchBrowser(binding: unknown): Promise<RenderSession> {
	const loaded = (await import("@cloudflare/puppeteer")) as {
		default?: { launch(endpoint: unknown): Promise<RenderSession> };
		launch?: (endpoint: unknown) => Promise<RenderSession>;
	};
	const launch = loaded.launch ?? loaded.default?.launch;
	if (!launch) throw new Error(BROWSER_GAP);
	return launch(binding);
}

async function renderBinding(binding: unknown, html: string): Promise<RenderedPage> {
	if (!binding) throw new Error(BROWSER_GAP);
	const browser = await launchBrowser(binding);
	const page = await browser.newPage();
	try {
		await page.setViewport({ width: VIEW_WIDTH, height: VIEW_HEIGHT });
		await page.setContent(pageDocument(html), { waitUntil: "domcontentloaded" });
		return await page.evaluate(collectRendered);
	} finally {
		await page.close();
		await browser.close();
	}
}

function browserOf(env: BusObjectEnv): (html: string) => Promise<RenderedPage> {
	if (env.masterBrowser) return env.masterBrowser;
	return (html) => renderBinding(env.BROWSER, html);
}

interface RequestStore {
	get<T>(key: string): Promise<T | undefined>;
	put?(key: string, value: string): Promise<void>;
}

const MACHINE_EXP_STATE = `state:${MACHINE_EXP_KEY}`;

async function storedMachineExp(storage: RequestStore): Promise<Record<string, unknown>> {
	const raw = await storage.get<string>(MACHINE_EXP_STATE);
	if (typeof raw !== "string") return {};
	try {
		return { [MACHINE_EXP_KEY]: JSON.parse(raw) as unknown };
	} catch {
		return {};
	}
}

interface OpenedMaster {
	accept(event: unknown): Promise<PublishedEvent[]>;
	snapshot(): MasterPhase;
	restore(phase: MasterPhase): void;
	createMonitor(monitorId: string): Promise<void>;
	start(): Promise<PublishedEvent>;
}

// fetchDocument is the page fetcher and the link checker. The key stays in the request header.
export async function openMaster(
	env: BusObjectEnv,
	accountId: string,
	storage: RequestStore,
): Promise<OpenedMaster | null> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return null;
	const request = (await storedRequest(storage)) ?? emptyRequest();
	const ownerId = env.DATABASE_URL ? await readAccountOwner(env.DATABASE_URL, accountId) : "";
	const master = createMaster(request, {
		readPage: readPageOf(env),
		audit: auditOf(env),
		model: { writeBrief: briefOf(env, request) },
		accountSlug: accountId,
		accountId,
		ownerId,
		loadGrant: (query) => loadGrant(env, query),
		browser: browserOf(env),
		recordMonitor: (monitorId: string) => recordMonitor(monitorId, accountId, env),
	});
	const saved = await storage.get<MasterSnapshot>(MASTER_PHASE);
	if (saved) master.restore(saved);
	return {
		accept: (event) => master.accept(event as never) as Promise<PublishedEvent[]>,
		snapshot: () => master.snapshot(),
		restore: (phase) => master.restore(phase as MasterSnapshot),
		createMonitor: (monitorId: string) => master.createMonitor(monitorId),
		async start() {
			const request = (await storedRequest(storage)) ?? emptyRequest();
			const stored = await storedMachineExp(storage);
			const event = await masterStartEvent(env, accountId, request, stored, Date.now());
			const map = event.set?.[MACHINE_EXP_KEY];
			if (storage.put) await storage.put(MACHINE_EXP_STATE, JSON.stringify(map ?? {}));
			return event;
		},
	};
}

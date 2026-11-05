import {
	type BusinessRequest,
	collectRendered,
	createMaster,
	type PageAudit,
	type PageReader,
	pageDocument,
	type RenderedPage,
} from "@tensquads/domain/master";
import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv } from "./account-bus.ts";
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

async function fetchDocument(url: string): Promise<{ status: number; body: string }> {
	try {
		const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(PAGE_MS) });
		return { status: response.status, body: await response.text() };
	} catch {
		return { status: 404, body: "" };
	}
}

async function requestBrief(key: string, gap: string): Promise<string> {
	try {
		const response = await fetch(MODEL_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
			body: JSON.stringify({
				model: "gpt-4o-mini",
				messages: [{ role: "user", content: `Write a brief under 150 words. Name this gap: ${gap}` }],
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

function liveBrief(env: BusObjectEnv, report: BriefGap): Promise<string> {
	const key = env.OPENAI_API_KEY;
	if (!key) return Promise.reject(new Error(MODEL_GAP));
	return requestBrief(key, report.gap).then((content) => {
		if (!content) throw new Error(MODEL_GAP);
		return content;
	});
}

function requestOf(input: BusObjectEnv["masterRequest"]): BusinessRequest {
	return {
		businessName: input?.businessName ?? "Account",
		businessType: input?.businessType === "grocer" ? "grocer" : "restaurant",
		...(input?.cuisine ? { cuisine: input.cuisine } : {}),
		items: (input?.items ?? []).map((item) => ({ name: item.name, price: item.price, section: item.section })),
	};
}

function readPageOf(env: BusObjectEnv): PageReader {
	return env.masterReadPage ?? fetchDocument;
}

function auditOf(env: BusObjectEnv): (html: string) => PageAudit | Promise<PageAudit> {
	if (env.masterAudit) return env.masterAudit;
	return () => ({ keyboard: true, contrast: true, p0: 0, p1: 0, horizontalScroll: false });
}

function briefOf(env: BusObjectEnv): (report: BriefGap) => string | Promise<string> {
	if (env.masterWriteBrief) return () => env.masterWriteBrief?.() ?? "";
	return (report) => liveBrief(env, report);
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

// fetchDocument is the page fetcher and the link checker. The key stays in the request header.
export async function openMaster(
	env: BusObjectEnv,
	accountId: string,
): Promise<{ accept: (event: unknown) => Promise<PublishedEvent[]> } | null> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return null;
	const master = createMaster(requestOf(env.masterRequest), {
		readPage: readPageOf(env),
		audit: auditOf(env),
		model: { writeBrief: briefOf(env) },
		accountSlug: accountId,
		browser: browserOf(env),
		recordMonitor: (monitorId: string) => recordMonitor(monitorId, accountId, env),
	});
	return {
		accept: (event) => master.accept(event as never) as Promise<PublishedEvent[]>,
	};
}

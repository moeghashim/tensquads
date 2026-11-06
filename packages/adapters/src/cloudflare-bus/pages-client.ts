import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// The account id matches apps/web/wrangler.jsonc. Publish uses no second secret for it.
export const PAGES_ACCOUNT_ID = "678c5a795f40f7e9f33b8a71248cc829";
export const DOMAIN_WAIT_MS = 120_000;
export const DOMAIN_POLL_MS = 2_000;

const API = "https://api.cloudflare.com/client/v4";

export class PagesFailure extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "PagesFailure";
		this.status = status;
	}
}

export interface PagesClient {
	publish(slug: string, html: string): Promise<string>;
}

export interface PagesClientOptions {
	readonly token: string;
	readonly accountId?: string;
	readonly fetch?: typeof fetch;
	readonly now?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly deadlineMs?: number;
	readonly pollMs?: number;
}

interface Reply {
	readonly status: number;
	readonly result: unknown;
}

// Pages hashes base64(contents) plus the extension, then keeps the first 32 blake3 hex characters.
export function pagesAssetHash(contents: Uint8Array, extension: string): string {
	return bytesToHex(blake3(new TextEncoder().encode(encodeBase64(contents) + extension))).slice(0, 32);
}

export function createPagesClient(options: PagesClientOptions): PagesClient {
	const token = options.token;
	const accountId = options.accountId ?? PAGES_ACCOUNT_ID;
	const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
	const now = options.now ?? (() => Date.now());
	const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const deadlineMs = options.deadlineMs ?? DOMAIN_WAIT_MS;
	const pollMs = options.pollMs ?? DOMAIN_POLL_MS;
	let signal: AbortSignal = new AbortController().signal;

	async function call(
		auth: string,
		url: string,
		method: string,
		failure: string,
		body?: string | FormData,
	): Promise<Reply> {
		const headers = new Headers({ authorization: `Bearer ${auth}` });
		if (typeof body === "string") headers.set("content-type", "application/json");
		let response: Response;
		try {
			response = await fetchImpl(url, { method, headers, body, redirect: "manual", signal });
		} catch (error) {
			if (aborted(error)) throw new PagesFailure(502, "The Cloudflare request timed out.");
			throw new PagesFailure(502, failure);
		}
		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel();
			throw new PagesFailure(502, "The Cloudflare API redirected.");
		}
		if (response.status === 401 || response.status === 403) {
			await response.body?.cancel();
			throw new PagesFailure(503, "The machine service is not configured.");
		}
		const payload = (await response.json().catch(() => null)) as { result?: unknown } | null;
		return { status: response.status, result: payload?.result };
	}

	return {
		async publish(slug, html) {
			if (token.length === 0) throw new PagesFailure(503, "The machine service is not configured.");
			signal = deadlineMs > 0 ? AbortSignal.timeout(deadlineMs) : new AbortController().signal;
			const project = `ts-${slug}`;
			const projectUrl = `${API}/accounts/${accountId}/pages/projects/${project}`;
			const fqdn = `${slug}.10squads.com`;
			await ensureProject(call, token, accountId, project, projectUrl);
			await uploadPage(call, token, projectUrl, html);
			const zone = await attachDomain(call, token, projectUrl, fqdn);
			await ensureDns(call, token, zone, fqdn, `ts-${slug}.pages.dev`);
			await waitForLive(call, fetchImpl, token, projectUrl, fqdn, now, sleep, deadlineMs, pollMs, signal);
			return `https://${fqdn}`;
		},
	};
}

async function ensureProject(
	call: Call,
	token: string,
	accountId: string,
	project: string,
	projectUrl: string,
): Promise<void> {
	const found = await call(token, projectUrl, "GET", "The Pages project was not created.");
	if (found.status === 404) {
		const created = await call(
			token,
			`${API}/accounts/${accountId}/pages/projects`,
			"POST",
			"The Pages project was not created.",
			JSON.stringify({ name: project, production_branch: "main" }),
		);
		if (!ok(created.status)) throw new PagesFailure(502, "The Pages project was not created.");
		return;
	}
	if (!ok(found.status)) throw new PagesFailure(502, "The Pages project was not created.");
}

const UPLOAD_FAILED = "The page was not uploaded.";

async function uploadJwt(call: Call, token: string, projectUrl: string): Promise<string> {
	const issued = await call(token, `${projectUrl}/upload-token`, "GET", UPLOAD_FAILED);
	const jwt = isRecord(issued.result) && typeof issued.result.jwt === "string" ? issued.result.jwt : "";
	if (!ok(issued.status) || jwt.length === 0) throw new PagesFailure(502, UPLOAD_FAILED);
	return jwt;
}

async function missingHashes(call: Call, jwt: string, hash: string): Promise<readonly unknown[]> {
	const missing = await call(
		jwt,
		`${API}/pages/assets/check-missing`,
		"POST",
		UPLOAD_FAILED,
		JSON.stringify({ hashes: [hash] }),
	);
	if (!ok(missing.status) || !Array.isArray(missing.result)) throw new PagesFailure(502, UPLOAD_FAILED);
	return missing.result;
}

async function sendAsset(call: Call, jwt: string, hash: string, bytes: Uint8Array): Promise<void> {
	const uploaded = await call(
		jwt,
		`${API}/pages/assets/upload`,
		"POST",
		UPLOAD_FAILED,
		JSON.stringify([{ key: hash, value: encodeBase64(bytes), metadata: { contentType: "text/html" }, base64: true }]),
	);
	if (!ok(uploaded.status)) throw new PagesFailure(502, UPLOAD_FAILED);
}

async function upsertHash(call: Call, jwt: string, hash: string): Promise<void> {
	const upserted = await call(
		jwt,
		`${API}/pages/assets/upsert-hashes`,
		"POST",
		UPLOAD_FAILED,
		JSON.stringify({ hashes: [hash] }),
	);
	if (!ok(upserted.status)) throw new PagesFailure(502, UPLOAD_FAILED);
}

async function deployIndex(call: Call, token: string, projectUrl: string, hash: string): Promise<void> {
	const manifest = new FormData();
	manifest.append(
		"manifest",
		new Blob([JSON.stringify({ "/index.html": hash })], { type: "application/json" }),
		"manifest.json",
	);
	const deployment = await call(token, `${projectUrl}/deployments`, "POST", UPLOAD_FAILED, manifest);
	if (!ok(deployment.status)) throw new PagesFailure(502, UPLOAD_FAILED);
}

async function uploadPage(call: Call, token: string, projectUrl: string, html: string): Promise<void> {
	const bytes = new TextEncoder().encode(html);
	const hash = pagesAssetHash(bytes, "html");
	const jwt = await uploadJwt(call, token, projectUrl);
	const missing = await missingHashes(call, jwt, hash);
	if (missing.includes(hash)) await sendAsset(call, jwt, hash, bytes);
	await upsertHash(call, jwt, hash);
	await deployIndex(call, token, projectUrl, hash);
}

async function attachDomain(call: Call, token: string, projectUrl: string, fqdn: string): Promise<string> {
	const posted = await call(
		token,
		`${projectUrl}/domains`,
		"POST",
		"The custom domain was not attached.",
		JSON.stringify({ name: fqdn }),
	);
	let domain = posted;
	if (!ok(posted.status)) {
		domain = await call(
			token,
			`${projectUrl}/domains/${encodeURIComponent(fqdn)}`,
			"GET",
			"The custom domain was not attached.",
		);
		if (!ok(domain.status)) throw new PagesFailure(502, "The custom domain was not attached.");
	}
	const status = textField(domain.result, "status");
	if (failedDomain(status)) throw new PagesFailure(502, "The custom domain failed.");
	const zone = textField(domain.result, "zone_tag");
	if (zone.length === 0) throw new PagesFailure(502, "The 10squads.com zone was not on the domain.");
	return zone;
}

async function ensureDns(call: Call, token: string, zone: string, fqdn: string, target: string): Promise<void> {
	const listed = await call(
		token,
		`${API}/zones/${zone}/dns_records?type=CNAME&name=${encodeURIComponent(fqdn)}`,
		"GET",
		"The DNS record was not created.",
	);
	if (!ok(listed.status) || !Array.isArray(listed.result))
		throw new PagesFailure(502, "The DNS record was not created.");
	const records = listed.result.filter(isRecord);
	if (records.length > 0) {
		const match = records.some(
			(record) =>
				textField(record, "type").toUpperCase() === "CNAME" &&
				textField(record, "name").toLowerCase() === fqdn.toLowerCase() &&
				textField(record, "content").toLowerCase() === target.toLowerCase() &&
				record.proxied === true,
		);
		if (!match) throw new PagesFailure(502, "The DNS record does not match.");
		return;
	}
	const created = await call(
		token,
		`${API}/zones/${zone}/dns_records`,
		"POST",
		"The DNS record was not created.",
		JSON.stringify({ type: "CNAME", name: fqdn, content: target, proxied: true, ttl: 1 }),
	);
	if (!ok(created.status)) throw new PagesFailure(502, "The DNS record was not created.");
}

function failedDomain(status: string): boolean {
	return status === "error" || status === "blocked" || status === "deactivated";
}

async function domainStatus(call: Call, token: string, domainUrl: string): Promise<string> {
	const current = await call(token, domainUrl, "GET", "The custom domain failed.");
	if (!ok(current.status)) throw new PagesFailure(502, "The custom domain failed.");
	const status = textField(current.result, "status");
	if (failedDomain(status)) throw new PagesFailure(502, "The custom domain failed.");
	return status;
}

function pastDeadline(now: () => number, deadline: number, message: string): "wait" {
	if (now() >= deadline) throw new PagesFailure(502, message);
	return "wait";
}

async function onePoll(
	call: Call,
	fetchImpl: typeof fetch,
	token: string,
	domainUrl: string,
	fqdn: string,
	now: () => number,
	deadline: number,
	signal: AbortSignal,
): Promise<"ready" | "wait"> {
	const status = await domainStatus(call, token, domainUrl);
	if (status !== "active") return pastDeadline(now, deadline, "The custom domain did not become active.");
	if (await liveOk(fetchImpl, `https://${fqdn}/`, signal)) return "ready";
	return pastDeadline(now, deadline, "The published site did not return 200.");
}

async function waitForLive(
	call: Call,
	fetchImpl: typeof fetch,
	token: string,
	projectUrl: string,
	fqdn: string,
	now: () => number,
	sleep: (ms: number) => Promise<void>,
	deadlineMs: number,
	pollMs: number,
	signal: AbortSignal,
): Promise<void> {
	const deadline = now() + deadlineMs;
	const domainUrl = `${projectUrl}/domains/${encodeURIComponent(fqdn)}`;
	for (;;) {
		const step = await onePoll(call, fetchImpl, token, domainUrl, fqdn, now, deadline, signal);
		if (step === "ready") return;
		await sleep(pollMs);
	}
}

async function liveOk(fetchImpl: typeof fetch, url: string, signal: AbortSignal): Promise<boolean> {
	try {
		const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal });
		await response.body?.cancel();
		return response.status === 200;
	} catch (error) {
		if (aborted(error)) throw new PagesFailure(502, "The Cloudflare request timed out.");
		return false;
	}
}

function aborted(error: unknown): boolean {
	return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

type Call = (auth: string, url: string, method: string, failure: string, body?: string | FormData) => Promise<Reply>;

function ok(status: number): boolean {
	return status >= 200 && status < 300;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textField(value: unknown, key: string): string {
	if (!isRecord(value)) return "";
	const field = value[key];
	return typeof field === "string" ? field : "";
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	const size = 0x4000;
	for (let index = 0; index < bytes.length; index += size) {
		const slice = bytes.subarray(index, index + size);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

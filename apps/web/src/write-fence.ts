// One tab id for this browser tab. sessionStorage keeps it across a reload.
// A duplicated tab copies that storage, hears the original tab, and takes a new id.
// The id is created on the first call. Module startup must not call crypto.
// A page without storage keeps the id in memory for this load. The server does not trust the value.

const storageKey = "tensquads.writeFence";
const channelName = "tensquads.writeFence";

let tab: string | null = null;
let seq = 0;
let startedAt = 0;
let bootedAt = 0;
let nonce = "";
let channel: BroadcastChannel | null = null;

interface StoredFence {
	readonly tab: string;
	readonly seq: number;
	readonly startedAt: number;
}

interface FenceMessage {
	readonly kind: "hello" | "have";
	readonly tab: string;
	readonly nonce: string;
	readonly bootedAt: number;
}

export function nextWriteFence(): { readonly tab: string; readonly seq: number } {
	ensureIdentity();
	seq += 1;
	const stamp = { tab: requiredTab(), seq };
	persist();
	return stamp;
}

function ensureIdentity(): void {
	if (tab !== null) return;
	const stored = readStored();
	if (stored) {
		tab = stored.tab;
		seq = stored.seq;
		startedAt = stored.startedAt;
		bootedAt = Date.now();
		listen();
		announce();
		return;
	}
	tab = createTabId();
	startedAt = Date.now();
	bootedAt = startedAt;
	listen();
	persist();
}

function requiredTab(): string {
	if (tab === null) {
		throw new Error("The write fence has no tab.");
	}
	return tab;
}

function listen(): void {
	if (channel || typeof BroadcastChannel !== "function") return;
	nonce = createTabId();
	channel = new BroadcastChannel(channelName);
	channel.onmessage = (event: MessageEvent<FenceMessage>) => {
		const data = event.data;
		if (!data || data.nonce === nonce || data.tab !== tab) return;
		if (data.kind !== "hello" && data.kind !== "have") return;
		if (data.kind === "have" || newerThan(data)) {
			claimNewTab();
			return;
		}
		channel?.postMessage({ kind: "have", tab, nonce, bootedAt } satisfies FenceMessage);
	};
}

function announce(): void {
	const current = requiredTab();
	channel?.postMessage({ kind: "hello", tab: current, nonce, bootedAt } satisfies FenceMessage);
}

function newerThan(data: FenceMessage): boolean {
	if (bootedAt !== data.bootedAt) return bootedAt > data.bootedAt;
	return nonce > data.nonce;
}

function claimNewTab(): void {
	tab = createTabId();
	seq = 0;
	startedAt = Date.now();
	bootedAt = startedAt;
	persist();
	announce();
}

function readStored(): StoredFence | null {
	const store = fenceStorage();
	if (!store) return null;
	try {
		const raw = store.getItem(storageKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<StoredFence>;
		if (!validTab(parsed.tab) || !validSeq(parsed.seq)) return null;
		const storedStart = typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now();
		return { tab: parsed.tab, seq: parsed.seq, startedAt: storedStart };
	} catch {
		return null;
	}
}

function persist(): void {
	const store = fenceStorage();
	if (!store || tab === null) return;
	try {
		store.setItem(storageKey, JSON.stringify({ tab, seq, startedAt } satisfies StoredFence));
	} catch {
		// Private mode and a blocked storage keep the id in memory for this load.
	}
}

function fenceStorage(): Storage | null {
	try {
		if (typeof sessionStorage === "undefined") return null;
		return sessionStorage;
	} catch {
		return null;
	}
}

function validTab(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && value === value.trim();
}

function validSeq(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function randomUuid(): string | null {
	const web = globalThis.crypto;
	if (!web || typeof web.randomUUID !== "function") return null;
	return web.randomUUID();
}

function createTabId(): string {
	const existing = randomUuid();
	if (existing) return existing;
	const web = globalThis.crypto;
	if (!web || typeof web.getRandomValues !== "function") {
		throw new Error("crypto.randomUUID is not available.");
	}
	const bytes = new Uint8Array(16);
	web.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (typeof window !== "undefined") {
	queueMicrotask(() => {
		ensureIdentity();
	});
}

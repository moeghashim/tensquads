// Each document load takes a new tab id and keeps it in memory.
// sessionStorage lists earlier ids from this tab that the server has not retired.
// A duplicated tab copies that list. Both loads retire the same old id and write with different new ids.
// A page without storage keeps one id for this load and retires nothing.
// The id is created on load. Module startup must not call crypto. The server does not trust the value.

const storageKey = "tensquads.writeFence";

interface StoredFence {
	readonly current: string;
	readonly pending: readonly string[];
}

let tab: string | null = null;
let seq = 0;
let pending: string[] = [];
let booted = false;

export function nextWriteFence(): {
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
} {
	ensureIdentity();
	seq += 1;
	return { tab: requiredTab(), seq, retires: pending.slice() };
}

export function confirmRetired(ids: readonly string[]): void {
	if (ids.length === 0 || pending.length === 0) return;
	const drop = new Set(ids);
	const next = pending.filter((id) => !drop.has(id));
	if (next.length === pending.length) return;
	pending = next;
	persist();
}

function ensureIdentity(): void {
	if (booted) return;
	booted = true;
	const stored = readStored();
	pending = stored ? [...stored.pending] : [];
	if (stored) addPending(stored.current);
	tab = createTabId();
	seq = 0;
	persist();
}

function requiredTab(): string {
	if (tab === null) {
		throw new Error("The write fence has no tab.");
	}
	return tab;
}

function addPending(id: string): void {
	if (!validTab(id) || pending.includes(id)) return;
	pending.push(id);
}

function readStored(): StoredFence | null {
	const store = fenceStorage();
	if (!store) return null;
	try {
		const raw = store.getItem(storageKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<StoredFence> & { tab?: unknown };
		const current = validTab(parsed.current) ? parsed.current : validTab(parsed.tab) ? parsed.tab : null;
		if (!current) return null;
		const listed = Array.isArray(parsed.pending) ? parsed.pending.filter(validTab) : [];
		return { current, pending: listed.filter((id, index) => listed.indexOf(id) === index && id !== current) };
	} catch {
		return null;
	}
}

function persist(): void {
	const store = fenceStorage();
	if (!store || tab === null) return;
	try {
		store.setItem(storageKey, JSON.stringify({ current: tab, pending } satisfies StoredFence));
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

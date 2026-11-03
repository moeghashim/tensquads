// Each document load takes a new tab id and keeps it in memory.
// sessionStorage lists earlier ids from this tab. The live id stays out of storage.
// pagehide adds the live id. A reload or navigation fires it. A duplicated tab does not.
// A restored page takes a fresh id, because the old one may already be retired.
// The list keeps the newest eight ids. A kill without pagehide leaves no entry.
// A page without storage keeps one id for this load and retires nothing.
// The id is created on load. Module startup must not call crypto. The server does not trust the value.

const storageKey = "tensquads.writeFence";
const pendingLimit = 8;

let tab: string | null = null;
let seq = 0;
let pending: string[] = [];
let booted = false;
let hiddenTab: string | null = null;

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
	pending = trimPending(readStoredIds());
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

function hideTab(): void {
	ensureIdentity();
	if (tab === null) return;
	hiddenTab = tab;
	addPending(tab);
	persist();
}

function showTab(event: PageTransitionEvent): void {
	if (event.persisted) {
		ensureIdentity();
		if (tab !== null) addPending(tab);
		tab = createTabId();
		seq = 0;
		hiddenTab = null;
		persist();
		return;
	}
	if (hiddenTab !== null && hiddenTab === tab) {
		pending = pending.filter((id) => id !== hiddenTab);
		hiddenTab = null;
		persist();
	}
}

function addPending(id: string): void {
	if (!validTab(id) || pending.includes(id)) return;
	pending.push(id);
	if (pending.length > pendingLimit) pending.splice(0, pending.length - pendingLimit);
}

function trimPending(ids: readonly string[]): string[] {
	const unique: string[] = [];
	for (const id of ids) {
		if (!validTab(id) || unique.includes(id)) continue;
		unique.push(id);
	}
	if (unique.length <= pendingLimit) return unique;
	return unique.slice(unique.length - pendingLimit);
}

function readStoredIds(): string[] {
	const store = fenceStorage();
	if (!store) return [];
	try {
		const raw = store.getItem(storageKey);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as { pending?: unknown; current?: unknown; tab?: unknown };
		const listed = Array.isArray(parsed.pending) ? parsed.pending.filter(validTab) : [];
		const previous = validTab(parsed.current) ? parsed.current : validTab(parsed.tab) ? parsed.tab : null;
		const ids = previous ? [...listed.filter((id) => id !== previous), previous] : listed;
		return ids.filter((id, index) => ids.indexOf(id) === index);
	} catch {
		return [];
	}
}

function persist(): void {
	const store = fenceStorage();
	if (!store) return;
	try {
		store.setItem(storageKey, JSON.stringify({ pending }));
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
	window.addEventListener("pagehide", () => {
		hideTab();
	});
	window.addEventListener("pageshow", (event) => {
		showTab(event);
	});
	queueMicrotask(() => {
		ensureIdentity();
	});
}

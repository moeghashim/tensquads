// One tab id for this page load. The sequence rises for every limit or rule switch.
// The id is created on the first write. Module startup must not call crypto.
// A page without crypto.randomUUID still gets one id. The server does not trust the value.
let tab: string | null = null;
let seq = 0;

export function nextWriteFence(): { readonly tab: string; readonly seq: number } {
	seq += 1;
	return { tab: pageTab(), seq };
}

function pageTab(): string {
	if (tab === null) tab = createTabId();
	return tab;
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

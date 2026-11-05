function encode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string): Uint8Array {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

async function sign(secret: string, payload: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function same(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
	return diff === 0;
}

export async function signMachineToken(
	secret: string,
	accountId: string,
	agentId: string,
	exp: number,
): Promise<string> {
	const payload = `${accountId}.${agentId}.${exp}`;
	const signature = await sign(secret, payload);
	return `${encode(new TextEncoder().encode(payload))}.${encode(signature)}`;
}

export async function verifyMachineToken(
	secret: string,
	token: string,
	accountId: string,
	agentId: string,
	now = Date.now(),
): Promise<boolean> {
	const split = token.lastIndexOf(".");
	if (split <= 0) return false;
	let payload = "";
	try {
		payload = new TextDecoder().decode(decode(token.slice(0, split)));
	} catch {
		return false;
	}
	const expAt = payload.lastIndexOf(".");
	const agentAt = payload.lastIndexOf(".", expAt - 1);
	if (expAt <= 0 || agentAt <= 0) return false;
	const tokenAccount = payload.slice(0, agentAt);
	const tokenAgent = payload.slice(agentAt + 1, expAt);
	const exp = Number(payload.slice(expAt + 1));
	if (tokenAccount !== accountId || tokenAgent !== agentId || !Number.isFinite(exp) || exp * 1000 <= now) return false;
	let signature: Uint8Array;
	try {
		signature = decode(token.slice(split + 1));
	} catch {
		return false;
	}
	return same(signature, await sign(secret, payload));
}

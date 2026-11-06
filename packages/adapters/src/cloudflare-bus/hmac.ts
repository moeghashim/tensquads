export async function hmacSign(secret: string, payload: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
	return diff === 0;
}

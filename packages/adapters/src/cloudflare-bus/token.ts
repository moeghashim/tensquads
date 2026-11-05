import { hmacSign, sameBytes } from "./hmac.ts";

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

export async function signMachineToken(
	secret: string,
	accountId: string,
	agentId: string,
	exp: number,
): Promise<string> {
	const payload = `${accountId}.${agentId}.${exp}`;
	const signature = await hmacSign(secret, payload);
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
	return sameBytes(signature, await hmacSign(secret, payload));
}

const TOKEN_TTL_SECONDS = 60 * 60;

export const MACHINE_TOKEN_ENV = "TENSQUADS_MACHINE_TOKEN";
export const MACHINE_TOKEN_BASE_URL_ENV = "TENSQUADS_MACHINE_TOKEN_BASE_URL";
export const MACHINE_TOKEN_PLACEHOLDER = "placeholder";

export interface MachineTokenDelivery {
	readonly authorization: string;
	readonly placeholderEnv: string;
	readonly placeholder: string;
	readonly baseUrlEnv: string;
}

async function issueMachineToken(secret: string, accountId: string, agentId: string, nowMs: number): Promise<string> {
	const exp = Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS;
	return signMachineToken(secret, accountId, agentId, exp);
}

// The machine receives the placeholder. Boat substitutes the signed token.
export async function machineTokenDelivery(
	env: { readonly MACHINE_TOKEN_KEY?: string },
	accountId: string,
	agentId: string,
	nowMs: number,
): Promise<MachineTokenDelivery> {
	if (!env.MACHINE_TOKEN_KEY) throw new Error("The machine service is not configured.");
	const token = await issueMachineToken(env.MACHINE_TOKEN_KEY, accountId, agentId, nowMs);
	if (token === MACHINE_TOKEN_PLACEHOLDER) throw new Error("The machine service is not configured.");
	return {
		authorization: `Bearer ${token}`,
		placeholderEnv: MACHINE_TOKEN_ENV,
		placeholder: MACHINE_TOKEN_PLACEHOLDER,
		baseUrlEnv: MACHINE_TOKEN_BASE_URL_ENV,
	};
}

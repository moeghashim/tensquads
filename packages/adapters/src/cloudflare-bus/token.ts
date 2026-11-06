import type { AccountMachine, AccountScope } from "@tensquads/kernel";

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

// A machine token lasts 30 days. The master rotates it during the last 7 days.
export const MACHINE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MACHINE_TOKEN_ROTATION_LEAD_SECONDS = 7 * 24 * 60 * 60;

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
	const exp = Math.floor(nowMs / 1000) + MACHINE_TOKEN_TTL_SECONDS;
	return signMachineToken(secret, accountId, agentId, exp);
}

export function machineTokenSubject(token: string): { readonly accountId: string; readonly agentId: string } | null {
	const split = token.lastIndexOf(".");
	if (split <= 0) return null;
	let payload = "";
	try {
		payload = new TextDecoder().decode(decode(token.slice(0, split)));
	} catch {
		return null;
	}
	const expAt = payload.lastIndexOf(".");
	const agentAt = payload.lastIndexOf(".", expAt - 1);
	if (expAt <= 0 || agentAt <= 0) return null;
	const accountId = payload.slice(0, agentAt);
	const agentId = payload.slice(agentAt + 1, expAt);
	if (accountId.length === 0 || agentId.length === 0) return null;
	return { accountId, agentId };
}

export function machineCredentialProfile(accountId: string, agentId: string): string {
	if (accountId.length === 0 || agentId.length === 0 || accountId.includes("/") || agentId.includes("/")) {
		throw new Error("The machine profile name is not valid.");
	}
	return `tensquads.${accountId.length}.${accountId}.${agentId.length}.${agentId}`;
}

function machineTokenRotationDue(expSeconds: number | undefined, nowMs: number): boolean {
	if (expSeconds === undefined || !Number.isFinite(expSeconds)) return true;
	return expSeconds - Math.floor(nowMs / 1000) <= MACHINE_TOKEN_ROTATION_LEAD_SECONDS;
}

export async function rotateMachineToken(
	machine: Pick<AccountMachine, "rotateToken">,
	input: {
		readonly scope: AccountScope;
		readonly agentId: string;
		readonly secret: string;
		readonly nowMs: number;
		readonly currentExp?: number;
	},
): Promise<{ readonly rotated: boolean; readonly profile: string; readonly exp: number }> {
	const profile = machineCredentialProfile(input.scope.accountId, input.agentId);
	if (!machineTokenRotationDue(input.currentExp, input.nowMs)) {
		return { rotated: false, profile, exp: input.currentExp ?? 0 };
	}
	const exp = Math.floor(input.nowMs / 1000) + MACHINE_TOKEN_TTL_SECONDS;
	const token = await signMachineToken(input.secret, input.scope.accountId, input.agentId, exp);
	await machine.rotateToken(input.scope, input.agentId, token);
	return { rotated: true, profile, exp };
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

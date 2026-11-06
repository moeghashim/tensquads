import type { PublishedEvent } from "@tensquads/kernel";

import { hmacSign, sameBytes } from "./hmac.ts";
import { isNonEmptyString, isObject } from "./message.ts";

const SKEW_SECONDS = 300;

function hexToBytes(hex: string): Uint8Array | null {
	if (!/^[0-9a-f]{64}$/.test(hex)) return null;
	const bytes = new Uint8Array(32);
	for (let index = 0; index < 32; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

function signatureParts(header: string): { t: string; v1: string } | null {
	let t = "";
	let v1 = "";
	for (const part of header.split(",")) {
		const eq = part.indexOf("=");
		if (eq <= 0) return null;
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (key === "t") t = value;
		if (key === "v1") v1 = value;
	}
	if (!/^\d+$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return null;
	return { t, v1 };
}

export async function verifyContextSignature(
	secret: string,
	header: string,
	rawBody: string,
	nowMs: number,
): Promise<boolean> {
	const parts = signatureParts(header);
	if (!parts) return false;
	const stamp = Number(parts.t);
	if (!Number.isFinite(stamp) || Math.abs(Math.floor(nowMs / 1000) - stamp) > SKEW_SECONDS) return false;
	const provided = hexToBytes(parts.v1);
	if (!provided) return false;
	const expected = await hmacSign(secret, `${parts.t}.${rawBody}`);
	return sameBytes(provided, expected);
}

function excerpts(value: unknown): string[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
	return value as string[];
}

export function changeEvent(body: unknown): PublishedEvent | null {
	if (!isObject(body) || body.event !== "change.detected") return null;
	if (!isNonEmptyString(body.id) || !isNonEmptyString(body.created_at) || !isObject(body.data)) return null;
	const change = body.data.change;
	if (!isObject(change)) return null;
	if (!isNonEmptyString(change.monitor_id) || !isNonEmptyString(change.url)) return null;
	if (!isNonEmptyString(change.title) || !isNonEmptyString(change.summary)) return null;
	const quotes = excerpts(change.excerpts);
	if (!quotes) return null;
	return {
		id: body.id,
		from: "context",
		to: "master",
		kind: "Request",
		skill: "change.detected",
		text: change.summary,
		payload: {
			monitorId: change.monitor_id,
			url: change.url,
			title: change.title,
			summary: change.summary,
			excerpts: quotes,
			createdAt: body.created_at,
		},
		writes: [],
	};
}

import type { WriteFence } from "@tensquads/domain";
import { sql } from "drizzle-orm";

const invalid = "The write fence is not valid.";

interface CheckedFence {
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
}

function parseWriteFence(input: unknown): CheckedFence {
	if (!isRecord(input)) {
		throw new Error(invalid);
	}
	const { tab, seq } = input;
	if (!validTab(tab)) {
		throw new Error(invalid);
	}
	if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
		throw new Error(invalid);
	}
	return { tab, seq, retires: parseRetires(input.retires) };
}

function parseRetires(input: unknown): readonly string[] {
	if (input === undefined) return [];
	if (!Array.isArray(input)) {
		throw new Error(invalid);
	}
	const retires: string[] = [];
	for (const id of input) {
		if (!validTab(id)) {
			throw new Error(invalid);
		}
		if (!retires.includes(id)) retires.push(id);
	}
	return retires;
}

function validTab(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 80 && value === value.trim();
}

// Empty return means the value write stays out. A retired tab loses before the sequence check.
export async function claimWriteFence(
	tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
	accountId: string,
	key: string,
	fence: WriteFence,
): Promise<boolean> {
	const checked = parseWriteFence(fence);
	await tx.execute(sql`
		DELETE FROM retired_tabs
		WHERE account_id = ${accountId}
			AND retired_at < now() - interval '24 hours'
	`);
	for (const id of checked.retires) {
		await tx.execute(sql`
			INSERT INTO retired_tabs (account_id, tab, retired_at)
			VALUES (${accountId}, ${id}, now())
			ON CONFLICT (account_id, tab) DO UPDATE SET retired_at = EXCLUDED.retired_at
		`);
	}
	const retired = await tx.execute(sql`
		SELECT tab FROM retired_tabs
		WHERE account_id = ${accountId} AND tab = ${checked.tab}
	`);
	if (rowsOf(retired).length > 0) return false;
	const result = await tx.execute(sql`
		INSERT INTO write_fences (account_id, key, tab, seq)
		VALUES (${accountId}, ${key}, ${checked.tab}, ${checked.seq})
		ON CONFLICT (account_id, key) DO UPDATE SET
			tab = EXCLUDED.tab,
			seq = EXCLUDED.seq
		WHERE NOT (write_fences.tab = EXCLUDED.tab AND write_fences.seq >= EXCLUDED.seq)
		RETURNING account_id
	`);
	return rowsOf(result).length > 0;
}

function rowsOf(result: unknown): readonly unknown[] {
	if (Array.isArray(result)) {
		return result;
	}
	if (isRecord(result) && Array.isArray(result.rows)) {
		return result.rows;
	}
	return [];
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}

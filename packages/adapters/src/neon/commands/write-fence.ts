import type { WriteFence } from "@tensquads/domain";
import { sql } from "drizzle-orm";

const invalid = "The write fence is not valid.";

function parseWriteFence(input: unknown): WriteFence {
	if (!isRecord(input)) {
		throw new Error(invalid);
	}
	const { tab, seq } = input;
	if (typeof tab !== "string" || tab.length === 0 || tab.length > 80 || tab !== tab.trim()) {
		throw new Error(invalid);
	}
	if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
		throw new Error(invalid);
	}
	return { tab, seq };
}

// Empty RETURNING means this tab already stored an equal or higher seq. The value write stays out.
export async function claimWriteFence(
	tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
	accountId: string,
	key: string,
	fence: WriteFence,
): Promise<boolean> {
	const checked = parseWriteFence(fence);
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

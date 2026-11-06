import type { PublishedEvent } from "@tensquads/kernel";

import { MASTER_DONE, MASTER_OPEN, MASTER_PHASE } from "./master-retry.ts";

export interface MasterPhase {
	readonly phase: string;
	readonly researchFails: number;
	readonly pageFails: number;
	readonly seq: number;
	readonly report?: unknown;
	readonly brief?: string;
	readonly previewHtml?: string;
	readonly previewUrl?: string;
}

interface CommitKv {
	put<T>(key: string, value: T): void;
	delete(key: string): boolean;
}

export function writeMasterCommit(
	kv: CommitKv,
	inputId: string,
	phase: MasterPhase,
	produced: readonly PublishedEvent[],
	commit: (event: PublishedEvent) => void,
): void {
	kv.put(MASTER_PHASE, phase);
	for (const event of produced) commit(event);
	kv.delete(`${MASTER_OPEN}${inputId}`);
	kv.put(`${MASTER_DONE}${inputId}`, true);
}

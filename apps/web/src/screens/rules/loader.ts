import { loadRulesPage } from "#/server/rules.ts";

import type { RulesSnapshotPage } from "./snapshot.ts";
import {
	bounded,
	markReadFailed,
	markReadSucceeded,
	rulesAccountEpoch,
	rulesRecoveryGeneration,
	rulesWriteCounter,
} from "./write-queue.ts";

export async function loadRulesSnapshot(): Promise<RulesSnapshotPage> {
	const readCounter = rulesWriteCounter();
	const generation = rulesRecoveryGeneration();
	const epoch = rulesAccountEpoch();
	try {
		const reading = loadRulesPage();
		const page = await (typeof window === "undefined" ? reading : bounded(() => reading));
		if (typeof window !== "undefined" && epoch !== rulesAccountEpoch()) {
			throw new Error("The signed-in account changed.");
		}
		markReadSucceeded(generation, epoch);
		return { ...page, readCounter };
	} catch (error) {
		markReadFailed(epoch);
		throw error;
	}
}

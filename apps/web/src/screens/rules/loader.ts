import { loadRulesPage } from "#/server/rules.ts";

import type { RulesSnapshotPage } from "./snapshot.ts";
import {
	bounded,
	markReadFailed,
	markReadSucceeded,
	rulesRecoveryGeneration,
	rulesWriteCounter,
} from "./write-queue.ts";

export async function loadRulesSnapshot(): Promise<RulesSnapshotPage> {
	const [readCounter, generation] = [rulesWriteCounter(), rulesRecoveryGeneration()];
	try {
		const reading = loadRulesPage();
		const page = await (typeof window === "undefined" ? reading : bounded(() => reading));
		markReadSucceeded(generation);
		return { ...page, readCounter };
	} catch (error) {
		markReadFailed();
		throw error;
	}
}

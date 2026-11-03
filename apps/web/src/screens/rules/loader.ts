import { loadRulesPage } from "#/server/rules.ts";

import type { RulesSnapshotPage } from "./snapshot.ts";
import {
	bounded,
	markReadFailed,
	markReadSucceeded,
	onRulesAccountReset,
	rulesAccountEpoch,
	rulesRecoveryGeneration,
	rulesWriteCounter,
} from "./write-queue.ts";

let held: { readonly epoch: number; readonly page: RulesSnapshotPage } | null = null;

onRulesAccountReset(() => {
	held = null;
});

export async function loadRulesSnapshot(): Promise<RulesSnapshotPage> {
	const readCounter = rulesWriteCounter();
	const generation = rulesRecoveryGeneration();
	const epoch = rulesAccountEpoch();
	try {
		const reading = loadRulesPage();
		const page = await (typeof window === "undefined" ? reading : bounded(() => reading));
		if (typeof window !== "undefined" && epoch !== rulesAccountEpoch()) {
			return currentHeld() ?? Promise.reject(new Error("The signed-in account changed."));
		}
		const snapshot = { ...page, readCounter };
		if (typeof window !== "undefined") held = { epoch, page: snapshot };
		markReadSucceeded(generation, epoch);
		return snapshot;
	} catch (error) {
		if (typeof window === "undefined") {
			markReadFailed(epoch);
			throw error;
		}
		if (epoch !== rulesAccountEpoch()) {
			return currentHeld() ?? Promise.reject(error);
		}
		markReadFailed(epoch);
		const page = heldPage(epoch);
		if (page) return page;
		throw error;
	}
}

function currentHeld(): RulesSnapshotPage | null {
	if (typeof window === "undefined") return null;
	return heldPage(rulesAccountEpoch());
}

function heldPage(epoch: number): RulesSnapshotPage | null {
	if (held?.epoch !== epoch) return null;
	return held.page;
}

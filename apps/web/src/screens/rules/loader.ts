import { isRedirect } from "@tanstack/react-router";
import { loadRulesPage } from "#/server/rules.ts";
import { isSessionRefreshNeeded } from "#/server/session-error.ts";

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
		// A write after this read started owns the screen. Keep and show the snapshot from before that write.
		const shown = retainSnapshot(epoch, readCounter, snapshot);
		markReadSucceeded(generation, epoch);
		return shown;
	} catch (error) {
		if ((typeof Response !== "undefined" && isRedirect(error)) || isSessionRefreshNeeded(error)) throw error;
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

function retainSnapshot(epoch: number, readCounter: number, snapshot: RulesSnapshotPage): RulesSnapshotPage {
	if (typeof window === "undefined") return snapshot;
	if (rulesWriteCounter() === readCounter) {
		held = { epoch, page: snapshot };
		return snapshot;
	}
	return heldPage(epoch) ?? snapshot;
}

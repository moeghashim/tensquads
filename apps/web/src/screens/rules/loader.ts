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
		const snapshot = await readRulesPage(readCounter, epoch);
		// A write after this read started owns the screen. Keep and show the snapshot from before that write.
		const shown = retainSnapshot(epoch, readCounter, snapshot);
		markReadSucceeded(generation, epoch);
		return shown;
	} catch (error) {
		return recoverRulesRead(error, epoch);
	}
}

function browserRead(): boolean {
	return typeof window !== "undefined";
}

async function readRulesPage(readCounter: number, epoch: number): Promise<RulesSnapshotPage> {
	const page = await readBoundedPage();
	if (staleEpoch(epoch)) return missingAccount();
	return { ...page, readCounter };
}

function readBoundedPage() {
	const reading = loadRulesPage();
	if (!browserRead()) return reading;
	return bounded(() => reading);
}

function staleEpoch(epoch: number): boolean {
	return browserRead() && epoch !== rulesAccountEpoch();
}

function missingAccount(): Promise<RulesSnapshotPage> {
	const kept = currentHeld();
	if (kept) return Promise.resolve(kept);
	return Promise.reject(new Error("The signed-in account changed."));
}

function recoverRulesRead(error: unknown, epoch: number): RulesSnapshotPage | Promise<RulesSnapshotPage> {
	if (passthrough(error)) throw error;
	if (!browserRead()) {
		markReadFailed(epoch);
		throw error;
	}
	return recoverBrowserRead(error, epoch);
}

function passthrough(error: unknown): boolean {
	if (typeof Response !== "undefined" && isRedirect(error)) return true;
	return isSessionRefreshNeeded(error);
}

function recoverBrowserRead(error: unknown, epoch: number): RulesSnapshotPage {
	if (epoch !== rulesAccountEpoch()) return keptOrThrow(error);
	markReadFailed(epoch);
	const page = heldPage(epoch);
	if (page) return page;
	throw error;
}

function keptOrThrow(error: unknown): RulesSnapshotPage {
	const kept = currentHeld();
	if (kept) return kept;
	throw error;
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

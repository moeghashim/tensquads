import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv, BusStorage } from "./account-bus.ts";
import type { MasterPhase } from "./master-commit.ts";
import { masterEvent } from "./master-retry.ts";

interface MasterHandle {
	accept(event: PublishedEvent): Promise<PublishedEvent[]>;
	snapshot(): MasterPhase;
	restore(phase: MasterPhase): void;
}

export interface MasterStep {
	readonly produced: PublishedEvent[];
	readonly phase: MasterPhase;
	restore(): void;
}

// One master per account. A failed step keeps this instance so the retry continues the same phase.
const masters = new Map<string, MasterHandle>();

async function masterFor(env: BusObjectEnv, accountId: string, storage: BusStorage): Promise<MasterHandle | null> {
	const cached = masters.get(accountId);
	if (cached) return cached;
	const loaded = await import("./master-live.ts");
	const opened = await loaded.openMaster(env, accountId, storage);
	if (!opened) return null;
	masters.set(accountId, opened);
	return opened;
}

function ready(event: PublishedEvent): PublishedEvent {
	return {
		id: event.id,
		time: event.time ?? "",
		from: event.from,
		to: event.to,
		kind: event.kind,
		skill: event.skill,
		text: event.text,
		payload: event.payload,
		writes: [...event.writes],
		trace: event.trace ?? "",
	};
}

export async function prepareMaster(
	env: BusObjectEnv,
	accountId: string,
	event: PublishedEvent,
	storage: BusStorage,
): Promise<MasterStep | null> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return null;
	if (!masterEvent(event)) return null;
	const master = await masterFor(env, accountId, storage);
	if (!master) return null;
	const before = master.snapshot();
	try {
		const produced = await master.accept(ready(event));
		return { produced, phase: master.snapshot(), restore: () => master.restore(before) };
	} catch (error) {
		master.restore(before);
		throw error;
	}
}

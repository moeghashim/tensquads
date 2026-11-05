import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv } from "./account-bus.ts";
import { masterEvent } from "./master-retry.ts";

interface MasterHandle {
	accept(event: PublishedEvent): Promise<PublishedEvent[]>;
}

// One master per account. A failed step keeps this instance so the retry continues the same phase.
const masters = new Map<string, MasterHandle>();

async function masterFor(env: BusObjectEnv, accountId: string): Promise<MasterHandle | null> {
	const cached = masters.get(accountId);
	if (cached) return cached;
	const loaded = await import("./master-live.ts");
	const opened = await loaded.openMaster(env, accountId);
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

export async function followMaster(
	env: BusObjectEnv,
	accountId: string,
	event: PublishedEvent,
): Promise<PublishedEvent[]> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return [];
	if (!masterEvent(event)) return [];
	const master = await masterFor(env, accountId);
	if (!master) return [];
	return master.accept(ready(event));
}

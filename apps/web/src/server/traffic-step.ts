import type { AppDatabase } from "@tensquads/adapters";
import { chooseAdapters, createCloudflareBus, nextEvent, trafficScript } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { BusEvent } from "@tensquads/domain";
import type { AccountEventBus, AccountScope, PublishedEvent } from "@tensquads/kernel";

import { workerEnv } from "./worker-env.ts";

const unfinished = "The workspace write did not finish.";
const unconfigured = "The machine service is not configured.";

export function realTrafficBus(env: {
	ACCOUNT_BUS?: Parameters<typeof createCloudflareBus>[0];
	BUS_QUEUE?: Parameters<typeof createCloudflareBus>[2];
}): AccountEventBus {
	if (!env.ACCOUNT_BUS) throw new Error(unconfigured);
	return createCloudflareBus(env.ACCOUNT_BUS, trafficScript(), env.BUS_QUEUE);
}

async function durableTrafficBus(): Promise<AccountEventBus> {
	const workers = await import("cloudflare:workers");
	const env = (workers.env ?? {}) as {
		ACCOUNT_BUS?: Parameters<typeof createCloudflareBus>[0];
		BUS_QUEUE?: Parameters<typeof createCloudflareBus>[2];
	};
	return realTrafficBus(env);
}

function recordedEvent(event: PublishedEvent): BusEvent {
	return {
		id: event.id,
		time: event.time ?? "",
		from: event.from,
		to: event.to,
		kind: event.kind as BusEvent["kind"],
		skill: event.skill,
		text: event.text,
		payload: event.payload,
		writes: event.writes,
		trace: event.trace ?? "",
		...(event.set === undefined ? {} : { set: event.set }),
	};
}

// startedAt is the server function's clock. The read and the write share it.
// Real mode returns the event the bus created. Test mode returns the event this write appended.
export async function advanceTrafficAccount(
	db: AppDatabase,
	scope: AccountScope,
	startedAt: number,
	bus?: AccountEventBus,
): Promise<BusEvent | null> {
	const deadlineAt = startedAt + PENDING_TASK_WINDOW_MS;
	if (chooseAdapters(await workerEnv("ADAPTERS")) === "real") {
		if (Date.now() >= deadlineAt) throw new Error(unfinished);
		const event = await (bus ?? (await durableTrafficBus())).nextEvent(scope, deadlineAt);
		return event === undefined ? null : recordedEvent(event);
	}
	if (Date.now() >= deadlineAt) throw new Error(unfinished);
	return (await nextEvent(db, scope, deadlineAt)) ?? null;
}

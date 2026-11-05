import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv } from "./account-bus.ts";
import { recordMonitor } from "./monitors.ts";

interface MasterHandle {
	accept(event: {
		readonly id: string;
		readonly time: string;
		readonly from: string;
		readonly to: string;
		readonly kind: string;
		readonly skill: string;
		readonly text: string;
		readonly payload: Readonly<Record<string, unknown>>;
		readonly writes: readonly string[];
		readonly trace: string;
	}): Promise<PublishedEvent[]>;
}

interface MasterModule {
	createMaster: (
		request: BusObjectEnv["masterRequest"],
		ports: {
			readonly readPage: NonNullable<BusObjectEnv["masterReadPage"]>;
			readonly audit: NonNullable<BusObjectEnv["masterAudit"]>;
			readonly model: { writeBrief: () => string | Promise<string> };
			readonly recordMonitor: (monitorId: string) => Promise<void>;
		},
	) => { accept: (event: unknown) => Promise<PublishedEvent[]> };
}

const masters = new Map<string, MasterHandle>();

async function loadMaster(): Promise<MasterModule> {
	const specifier = ["@tensquads", "domain/master"].join("/");
	return import(specifier) as Promise<MasterModule>;
}

async function masterFor(env: BusObjectEnv, accountId: string): Promise<MasterHandle | null> {
	const cached = masters.get(accountId);
	if (cached) return cached;
	const request = env.masterRequest;
	const readPage = env.masterReadPage;
	const audit = env.masterAudit;
	const writeBrief = env.masterWriteBrief;
	if (!request || !readPage || !audit || !writeBrief) return null;
	const loaded = await loadMaster();
	const master = loaded.createMaster(request, {
		readPage,
		audit,
		model: { writeBrief },
		recordMonitor: (monitorId) => recordMonitor(monitorId, accountId, env),
	});
	const handle: MasterHandle = {
		accept: (event) => master.accept(event),
	};
	masters.set(accountId, handle);
	return handle;
}

export async function followMaster(
	env: BusObjectEnv,
	accountId: string,
	event: PublishedEvent,
): Promise<PublishedEvent[]> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return [];
	if (event.kind !== "Result" || event.to !== "master") return [];
	const master = await masterFor(env, accountId);
	if (!master) return [];
	return master.accept({
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
	});
}

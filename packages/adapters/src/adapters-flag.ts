import type { AccountEventBus, AccountMachine } from "@tensquads/kernel";
import { MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "./adapter-choice.ts";
import { createBoatMachine } from "./boat-machine.ts";
import { type BusNamespace, createCloudflareBus, type QueueProducer } from "./cloudflare-bus/index.ts";
import { trafficScript } from "./traffic-script.ts";
import { workerTestBus, workerTestMachine } from "./worker-adapters.ts";

export interface AdapterEnv {
	readonly ADAPTERS?: string;
	readonly BOAT_TOKEN?: string;
	readonly BOAT_ADMIN_TOKEN?: string;
	readonly BOAT_PROFILE?: string;
	readonly BOAT_BASE_PATH?: string;
	readonly BOAT_SECRET_BASE_URL?: string;
	readonly DATABASE_URL?: string;
	readonly ACCOUNT_BUS?: BusNamespace;
	readonly BUS_QUEUE?: QueueProducer;
	readonly fetchApi?: typeof fetch;
}

export function pickWorkerAdapters(env: AdapterEnv): { machine: AccountMachine; bus: AccountEventBus } {
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		return { machine: workerTestMachine(), bus: workerTestBus() };
	}
	if (!env.BOAT_TOKEN || !env.BOAT_PROFILE) {
		throw new MachineFault("unavailable", "The machine service is not configured.");
	}
	if (!env.ACCOUNT_BUS || !env.DATABASE_URL || !env.BUS_QUEUE) {
		throw new MachineFault("unavailable", "The bus is not configured.");
	}
	return {
		machine: createBoatMachine({
			token: env.BOAT_TOKEN,
			adminToken: env.BOAT_ADMIN_TOKEN,
			profileName: env.BOAT_PROFILE,
			basePath: env.BOAT_BASE_PATH,
			secretBaseUrl: env.BOAT_SECRET_BASE_URL,
			fetchApi: env.fetchApi ?? fetch,
		}),
		bus: createCloudflareBus(env.ACCOUNT_BUS, trafficScript(), env.BUS_QUEUE),
	};
}

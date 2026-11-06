import { chooseAdapters } from "../adapter-choice.ts";
import { DELIVERY_GRACE_MS } from "../neon/commands/approval-delivery.ts";
import type { BusNamespace, WorkerBindings } from "./http.ts";
import { readStaleDeliveryAccounts } from "./neon-write.ts";

export type StaleDeliveryAccounts = (beforeMs: number) => Promise<string[]>;

async function poke(namespace: BusNamespace, accountId: string): Promise<boolean> {
	try {
		const response = await namespace.get(namespace.idFromName(accountId)).fetch("https://bus/deliveries/retry", {
			method: "POST",
			body: JSON.stringify({ accountId }),
		});
		return response.ok;
	} catch {
		return false;
	}
}

// The cron sweep arms the account alarm for each account with an old pending
// row. The alarm does the drain, with the stored event id.
export async function sweepDeliveryRetries(
	env: Pick<WorkerBindings, "ADAPTERS" | "DATABASE_URL" | "ACCOUNT_BUS" | "staleDeliveryAccounts">,
	nowMs: number,
	listAccounts?: StaleDeliveryAccounts,
): Promise<string[]> {
	if (chooseAdapters(env.ADAPTERS) !== "real" || !env.ACCOUNT_BUS) return [];
	const list =
		listAccounts ??
		env.staleDeliveryAccounts ??
		(env.DATABASE_URL ? (before: number) => readStaleDeliveryAccounts(env.DATABASE_URL as string, before) : null);
	if (!list) return [];
	const accounts = await list(nowMs - DELIVERY_GRACE_MS);
	const poked: string[] = [];
	for (const accountId of accounts) {
		if (await poke(env.ACCOUNT_BUS, accountId)) poked.push(accountId);
	}
	return poked;
}

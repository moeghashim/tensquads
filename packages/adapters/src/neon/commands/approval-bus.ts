import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../../adapter-choice.ts";
import { type BusNamespace, createCloudflareBus } from "../../cloudflare-bus/http.ts";

export interface UserMasterEvent {
	readonly id: string;
	readonly time: string;
	readonly from: "user";
	readonly to: "master";
	readonly kind: "Approval" | "Declined";
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, string>>;
}

export type DeliverUserEvent = (accountId: string, event: UserMasterEvent) => Promise<void>;

const missingBus = "The bus is not configured.";

export function userMasterEvent(input: {
	readonly id: string;
	readonly ok: boolean;
	readonly title: string;
	readonly by: string;
	readonly at: Date;
}): UserMasterEvent {
	const status = input.ok ? "approved" : "declined";
	return {
		id: `user-${input.id}`,
		time: input.at.toISOString(),
		from: "user",
		to: "master",
		kind: input.ok ? "Approval" : "Declined",
		skill: "-",
		text: `${input.ok ? "Approved: " : "Declined: "}${input.title}`,
		payload: { approval_id: input.id, approved: input.ok, by: input.by },
		writes: [`approvals.${input.id}`],
		set: { [`approvals.${input.id}`]: status },
	};
}

async function accountBus(): Promise<BusNamespace | undefined> {
	try {
		const workers = (await import("cloudflare:workers")) as { env?: { ACCOUNT_BUS?: BusNamespace } };
		return workers.env?.ACCOUNT_BUS;
	} catch {
		return undefined;
	}
}

export async function deliverUserToMaster(accountId: string, event: UserMasterEvent): Promise<void> {
	if (chooseAdapters(process.env.ADAPTERS) !== "real") return;
	const namespace = await accountBus();
	if (!namespace) throw new Error(missingBus);
	await createCloudflareBus(namespace).publish({ accountId, mode: "account" }, event as PublishedEvent);
}

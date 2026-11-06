import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../../adapter-choice.ts";
import { type BusNamespace, createCloudflareBus } from "../../cloudflare-bus/http.ts";
import { briefAsk, publishAsk } from "./master-ask.ts";

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

function skillForAsk(title: string): string {
	if (title === briefAsk) return "brief.write";
	if (title === publishAsk) return "approval.ask";
	return "-";
}

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
		skill: skillForAsk(input.title),
		text: `${input.ok ? "Approved: " : "Declined: "}${input.title}`,
		payload: { approval_id: input.id, approved: input.ok, by: input.by },
		writes: [`approvals.${input.id}`],
		set: { [`approvals.${input.id}`]: status },
	};
}

export type ScheduleDeliveryRetry = (accountId: string) => Promise<void>;

// A failed send arms the account alarm. The alarm drains the pending rows.
export async function scheduleDeliveryRetry(accountId: string, namespace?: BusNamespace): Promise<void> {
	if (chooseAdapters(process.env.ADAPTERS) !== "real") return;
	if (!namespace) throw new Error(missingBus);
	const id = namespace.idFromName(accountId);
	const response = await namespace.get(id).fetch("https://bus/deliveries/retry", {
		method: "POST",
		body: JSON.stringify({ accountId }),
	});
	if (!response.ok) throw new Error(missingBus);
}

export async function deliverUserToMaster(
	accountId: string,
	event: UserMasterEvent,
	namespace?: BusNamespace,
): Promise<void> {
	if (chooseAdapters(process.env.ADAPTERS) !== "real") return;
	if (!namespace) throw new Error(missingBus);
	await createCloudflareBus(namespace).publish({ accountId, mode: "account" }, event as PublishedEvent);
}

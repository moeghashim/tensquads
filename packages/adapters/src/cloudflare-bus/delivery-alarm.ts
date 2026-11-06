import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import { DELIVERY_GRACE_MS, deliveryBackoffMs } from "../neon/commands/approval-delivery.ts";
import { type AlarmStorage, clearDeadline, DELIVERY_ALARM, deadlineToken, setDeadline } from "./alarm.ts";
import type { BusNamespace } from "./http.ts";
import { readAccountId } from "./message.ts";
import { drainApprovalDeliveries } from "./neon-write.ts";
import { deliverProbe } from "./probe.ts";

interface DrainEnv {
	readonly ADAPTERS?: string;
	readonly now?: () => number;
	readonly DATABASE_URL?: string;
	readonly BUS_INSPECT?: string;
	readonly ACCOUNT_BUS?: BusNamespace;
	readonly retryDeliveries?: (accountId: string, beforeMs?: number) => Promise<number>;
}

type AcceptStored = (accountId: string, event: PublishedEvent) => Promise<unknown>;

// A failed first send arms this route. The alarm then drains the rows.
// A future deadline is stored again so its token changes. A due deadline
// moves forward, because a past alarm fires again and drops the schedule.
export async function armDeliveryRetry(storage: AlarmStorage, env: DrainEnv, request: Request): Promise<Response> {
	const accountId = await readAccountId(request);
	if (!accountId) {
		return new Response("The message was rejected.", { status: 400 });
	}
	const stored = await storage.get<string>("account");
	if (stored && stored !== accountId) return new Response("The message was rejected.", { status: 400 });
	await storage.put("account", accountId);
	const now = env.now?.() ?? Date.now();
	const armed = await storage.get<number>(DELIVERY_ALARM);
	// A future deadline stays where it is. A due one moves forward, or a past
	// alarm time would fire again and clear the schedule the retry just kept.
	if (typeof armed === "number" && armed > now) await setDeadline(storage, DELIVERY_ALARM, armed);
	else {
		const attempt = (await storage.get<number>("delivery-attempt")) ?? 0;
		if (typeof armed !== "number") await storage.put("delivery-attempt", 0);
		await setDeadline(storage, DELIVERY_ALARM, now + deliveryBackoffMs(attempt));
	}
	return Response.json({ ok: true });
}

export async function armDeliveryAlarm(storage: AlarmStorage, env: DrainEnv): Promise<void> {
	const attempt = (await storage.get<number>("delivery-attempt")) ?? 0;
	await storage.put("delivery-attempt", attempt + 1);
	const now = env.now?.() ?? Date.now();
	await setDeadline(storage, DELIVERY_ALARM, now + deliveryBackoffMs(attempt));
}

export async function drainDeliveries(
	storage: AlarmStorage,
	env: DrainEnv,
	acceptStored: AcceptStored,
	onlyOld = false,
): Promise<void> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return;
	const accountId = await storage.get<string>("account");
	if (!accountId) return;
	const token = await deadlineToken(storage, DELIVERY_ALARM);
	const remaining = await drainRemaining(storage, env, accountId, acceptStored, onlyOld);
	if (remaining === null || onlyOld) return;
	if (remaining > 0) await armDeliveryAlarm(storage, env);
	else if (await clearDeadline(storage, DELIVERY_ALARM, token)) await storage.delete("delivery-attempt");
}

// A missing source means there is nothing to drain. A failed drain counts as one row left.
async function drainRemaining(
	storage: AlarmStorage,
	env: DrainEnv,
	accountId: string,
	acceptStored: AcceptStored,
	onlyOld: boolean,
): Promise<number | null> {
	const now = env.now?.() ?? Date.now();
	const beforeMs = onlyOld ? now - DELIVERY_GRACE_MS : undefined;
	try {
		if (!onlyOld && (await deliverProbe(storage, env, accountId))) return 0;
		if (env.retryDeliveries) return await env.retryDeliveries(accountId, beforeMs);
		if (!env.DATABASE_URL) return null;
		return await drainApprovalDeliveries(
			env.DATABASE_URL,
			accountId,
			async (event) => {
				await acceptStored(accountId, event);
			},
			beforeMs,
		);
	} catch {
		return 1;
	}
}

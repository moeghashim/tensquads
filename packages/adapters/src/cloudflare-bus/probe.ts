import { type AlarmStorage, DELIVERY_ALARM } from "./alarm.ts";
import type { BusNamespace } from "./http.ts";
import { readAccountId } from "./message.ts";

interface ProbeEnv {
	readonly BUS_INSPECT?: string;
	readonly ACCOUNT_BUS?: BusNamespace;
}

// A workerd test fetches this during the drain. The fetch starts the retry,
// but does not wait for it: the object queue runs it after the drain ends.
export async function deliverProbe(storage: AlarmStorage, env: ProbeEnv, accountId: string): Promise<boolean> {
	if (env.BUS_INSPECT !== "1" || (await storage.get("probe-delivery")) !== true) return false;
	await storage.delete("probe-delivery");
	const namespace = env.ACCOUNT_BUS;
	if (!namespace) return false;
	void namespace
		.get(namespace.idFromName(accountId))
		.fetch("https://bus/deliveries/retry", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ accountId }),
		})
		.catch(() => undefined);
	return true;
}

export async function armProbe(storage: AlarmStorage, request: Request): Promise<Response> {
	const accountId = await readAccountId(request);
	if (!accountId) {
		return new Response("The message was rejected.", { status: 400 });
	}
	await storage.put("account", accountId);
	await storage.put("probe-delivery", true);
	// The key is due. rearm waits until the drain's retry stores a future time,
	// because a past alarm fires again and that second run deletes the key.
	await storage.put(DELIVERY_ALARM, 1);
	return Response.json({ ok: true });
}

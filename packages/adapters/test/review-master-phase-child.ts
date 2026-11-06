import { readFileSync } from "node:fs";
import type { PublishedEvent } from "@tensquads/kernel";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { Storage } from "./bus-storage.ts";

const storage = new Storage();
storage.rows = new Map(JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as [string, unknown][]);
const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, { ADAPTERS: "real" });
const event: PublishedEvent = {
	id: "phase-yes",
	time: "12:02",
	from: "user",
	to: "master",
	kind: "Approval",
	skill: "brief.write",
	text: "Yes.",
	payload: {},
	writes: [],
	trace: "tr_phase_yes",
};
await target.fetch(
	new Request("https://bus/accept", {
		method: "POST",
		body: JSON.stringify({ accountId: "phase-owner", event }),
	}),
);
const events = [...(await storage.list<PublishedEvent>({ prefix: "event:" })).values()];
const build = events.find((item) => item.text.startsWith("Build the page."));
const payload = build?.payload as { businessName?: string; items?: unknown[] } | undefined;
console.log(
	JSON.stringify({
		businessName: payload?.businessName ?? "",
		items: payload?.items?.length ?? 0,
	}),
);

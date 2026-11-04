import type { AccountEventBus, AccountMachine } from "@tensquads/kernel";

import { createAccountMemoryBus } from "./memory-bus.ts";
import { createAccountTestMachine } from "./test-machine.ts";

let machine: AccountMachine | undefined;
let bus: AccountEventBus | undefined;
const taken = new Set<string>();

export function workerTestMachine(): AccountMachine {
	machine ??= createAccountTestMachine();
	return machine;
}

export function workerTestBus(): AccountEventBus {
	bus ??= createAccountMemoryBus();
	return bus;
}

export function takeTestTask(
	accountId: string,
	agentId: string,
	events: readonly { id: string; to: string; kind: string }[],
) {
	const fresh = events.filter(
		(event) => event.kind === "Task" && event.to === agentId && !taken.has(`${accountId}:${event.id}`),
	);
	for (const event of fresh) taken.add(`${accountId}:${event.id}`);
	return fresh;
}

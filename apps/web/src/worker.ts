import start from "@tanstack/react-start/server-entry";
import type { BusBatch, WorkerBindings } from "@tensquads/adapters";
import { AccountBus, handleBusQueue, handleMachineRequest, pickWorkerAdapters } from "@tensquads/adapters";

export { AccountBus };

function selected(env: WorkerBindings) {
	return pickWorkerAdapters(env);
}

export default {
	async fetch(request: Request, env: WorkerBindings): Promise<Response> {
		const adapters = selected(env);
		if (!adapters.machine || !adapters.bus) {
			return new Response("The machine service is not configured.", { status: 503 });
		}
		const handled = await handleMachineRequest(request, env);
		if (handled) return handled;
		return start.fetch(request);
	},
	queue(batch: BusBatch, env: WorkerBindings): Promise<void> {
		const adapters = selected(env);
		if (!adapters.bus) return Promise.resolve();
		return handleBusQueue(batch, env);
	},
};

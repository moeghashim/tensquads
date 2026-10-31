import { Context } from "cordis";

import { emptyPlugins } from "./plugins.ts";
import {
	DECIDER_MISSING,
	type Decider,
	type EventBus,
	type IntegrationGateway,
	type MachineProvider,
	type Repositories,
} from "./ports.ts";

export class Kernel {
	readonly context: Context;
	machine: MachineProvider | null = null;
	bus: EventBus | null = null;
	gateway: IntegrationGateway | null = null;
	repositories: Repositories | null = null;
	readonly decider: Decider;

	constructor() {
		this.context = new Context();
		for (const plugin of emptyPlugins) {
			this.context.plugin(plugin);
		}
		this.decider = {
			decide(): never {
				throw new Error(DECIDER_MISSING);
			},
		};
	}

	pluginNames(): readonly string[] {
		const names: string[] = [];
		for (const plugin of this.context.registry.keys()) {
			if (plugin.name.length > 0) {
				names.push(plugin.name);
			}
		}
		return names;
	}
}

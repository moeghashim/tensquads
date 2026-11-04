import type { AccountMachine, AccountScope, MachineProvider, StartedMachine } from "@tensquads/kernel";
import { MachineFault } from "@tensquads/kernel";

export interface MachineRecord {
	readonly id: string;
	readonly on: boolean;
	readonly host: string;
	readonly region: string;
	readonly size: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly egress: readonly string[];
	readonly secrets: readonly string[];
}

// Off means CPU 0% and uptime "Paused". An on machine whose stored uptime is "Paused"
// reports "Just started" (Main.dc.html:1267). Version 1 does not roll out an image.
// makeTemplate and startFromTemplate only answer the MachineProvider methods.
interface LiveMachine extends MachineRecord {
	on: boolean;
}

export function createTestMachine(rows: readonly MachineRecord[]): MachineProvider {
	const byId = new Map<string, LiveMachine>(rows.map((row) => [row.id, { ...row }]));

	function row(agentId: string): LiveMachine {
		const found = byId.get(agentId);
		if (!found) {
			throw new Error(`No machine for ${agentId}.`);
		}
		return found;
	}

	return {
		host: (agentId) => row(agentId).host,
		region: (agentId) => row(agentId).region,
		size: (agentId) => row(agentId).size,
		cpu: (agentId) => (row(agentId).on ? row(agentId).cpu : "0%"),
		uptime: (agentId) => {
			const found = row(agentId);
			if (!found.on) {
				return "Paused";
			}
			return found.uptime === "Paused" ? "Just started" : found.uptime;
		},
		egress: (agentId) => row(agentId).egress,
		secrets: (agentId) => row(agentId).secrets,
		start(agentId) {
			row(agentId).on = true;
		},
		stop(agentId) {
			row(agentId).on = false;
		},
		makeTemplate: (imageId) => ({ id: `template-${imageId}` }),
		startFromTemplate: (templateId, agentId) => ({ templateId, agentId }),
	};
}

interface AccountLive {
	on: boolean;
	host: string;
	region: string;
	size: string;
	cpu: string;
	uptime: string;
	egress: string[];
	secrets: string[];
	templateId?: string;
}

function accountKey(scope: AccountScope, agentId: string): string {
	return `${scope.accountId}:${agentId}`;
}

function absent(): never {
	throw new MachineFault("unavailable", "No machine for this agent.");
}

// The account test machine answers the async port. Off still means CPU 0% and uptime "Paused".
export function createAccountTestMachine(): AccountMachine {
	const machines = new Map<string, AccountLive>();
	const templates = new Map<string, { readonly imageId: string; readonly version: string }>();
	const secretNames = new Map<string, string[]>();

	function live(scope: AccountScope, agentId: string): AccountLive {
		return machines.get(accountKey(scope, agentId)) ?? absent();
	}

	function names(accountId: string): string[] {
		const found = secretNames.get(accountId);
		if (found) return found;
		const created: string[] = [];
		secretNames.set(accountId, created);
		return created;
	}

	function shown(row: AccountLive): AccountLive {
		if (!row.on) return { ...row, cpu: "0%", uptime: "Paused" };
		return { ...row, uptime: row.uptime === "Paused" ? "Just started" : row.uptime };
	}

	return {
		async host(scope, agentId) {
			return shown(live(scope, agentId)).host;
		},
		async region(scope, agentId) {
			return shown(live(scope, agentId)).region;
		},
		async size(scope, agentId) {
			return shown(live(scope, agentId)).size;
		},
		async cpu(scope, agentId) {
			return shown(live(scope, agentId)).cpu;
		},
		async uptime(scope, agentId) {
			return shown(live(scope, agentId)).uptime;
		},
		async egress(scope, agentId) {
			return shown(live(scope, agentId)).egress;
		},
		async secrets(scope, agentId) {
			live(scope, agentId);
			return names(scope.accountId);
		},
		async start(scope, agentId) {
			const key = accountKey(scope, agentId);
			const existing = machines.get(key);
			if (existing) {
				existing.on = true;
				return;
			}
			machines.set(key, {
				on: true,
				host: `vps-${agentId}-01`,
				region: "EU",
				size: "2 vCPU · 4 GB",
				cpu: "0%",
				uptime: "Just started",
				egress: [],
				secrets: [],
			});
		},
		async stop(scope, agentId) {
			live(scope, agentId).on = false;
		},
		async resume(scope, agentId) {
			const row = live(scope, agentId);
			row.on = true;
			if (row.uptime === "Paused") row.uptime = "Just started";
		},
		async remove(scope, agentId) {
			if (!machines.delete(accountKey(scope, agentId))) absent();
		},
		async registerSecret(scope, name) {
			const list = names(scope.accountId);
			if (!list.includes(name)) list.push(name);
		},
		async removeSecret(scope, name) {
			const list = names(scope.accountId);
			const index = list.indexOf(name);
			if (index >= 0) list.splice(index, 1);
		},
		async makeTemplate(_scope, imageId, version) {
			const id = `tensquads-${imageId}-${version}`;
			templates.set(id, { imageId, version });
			return { id };
		},
		async startFromTemplate(scope, templateId, agentId) {
			if (!templates.has(templateId)) {
				throw new MachineFault("unavailable", "The template is not available.");
			}
			const key = accountKey(scope, agentId);
			const existing = machines.get(key);
			if (!existing) {
				machines.set(key, {
					on: true,
					host: `vps-${agentId}-01`,
					region: "EU",
					size: "2 vCPU · 4 GB",
					cpu: "0%",
					uptime: "Just started",
					egress: [],
					secrets: [],
					templateId,
				});
			} else {
				existing.on = true;
				existing.templateId = templateId;
			}
			const started: StartedMachine = { templateId, agentId };
			return started;
		},
		async removeTemplate(_scope, templateId) {
			templates.delete(templateId);
		},
	};
}

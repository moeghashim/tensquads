import type { MachineProvider } from "@tensquads/kernel";

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
export function createTestMachine(rows: readonly MachineRecord[]): MachineProvider {
	const byId = new Map(rows.map((row) => [row.id, row]));

	function row(agentId: string): MachineRecord {
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
		makeTemplate: (imageId) => ({ id: `template-${imageId}` }),
		startFromTemplate: (templateId, agentId) => ({ templateId, agentId }),
	};
}

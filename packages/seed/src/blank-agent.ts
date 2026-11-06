import type { Agent, OverviewTile, Skill } from "@tensquads/domain";

const delta = "\u00a0";
const deltaColor = "#5d5d5d";

export function emptyOverviewTiles(): OverviewTile[] {
	return [
		{ label: "Revenue", value: "—", delta, deltaColor },
		{ label: "Orders", value: "—", delta, deltaColor },
		{ label: "Average order", value: "$0", delta, deltaColor },
		{ label: "Profit margin", value: "0%", delta, deltaColor },
		{ label: "Hours saved", value: "0h", delta, deltaColor },
	];
}

export function emptyAgent(input: {
	readonly id: string;
	readonly role: string;
	readonly tint: string;
	readonly mission: string;
	readonly skills: readonly Skill[];
	readonly target: readonly [string, string, string];
	readonly last?: string;
	readonly host?: string;
	readonly region?: string;
	readonly size?: string;
	readonly cpu?: string;
	readonly uptime?: string;
}): Agent {
	return {
		id: input.id,
		name: input.role,
		role: input.role,
		tint: input.tint,
		on: true,
		autonomy: "Ask first",
		mission: input.mission,
		targets: [input.target],
		contribution: 0,
		tasks: 0,
		success: "0%",
		saved: "0h",
		last: input.last ?? "",
		host: input.host ?? "",
		region: input.region ?? "",
		size: input.size ?? "",
		cpu: input.cpu ?? "",
		uptime: input.uptime ?? "",
		egress: [],
		secrets: [],
		kpis: [["Tasks", "0"]],
		skills: input.skills,
	};
}

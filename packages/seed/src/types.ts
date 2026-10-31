import type {
	Account,
	Agent,
	AgentImage,
	Approval,
	BusEvent,
	MissionProposal,
	OverviewTile,
	Rule,
} from "@tensquads/domain";

export interface DesignAccount extends Omit<Account, "mission"> {}

export interface DesignFile {
	readonly seed: {
		readonly agents: readonly Agent[];
		readonly bus: readonly BusEvent[];
		readonly accounts: readonly DesignAccount[];
		readonly images: readonly AgentImage[];
		readonly approvals: readonly Omit<Approval, "status">[];
		readonly missionProposals: readonly MissionProposal[];
		readonly chat: readonly { id: string; from: "user" | "master" | "agent"; agent?: string; text: string }[];
		readonly store: Readonly<Record<string, unknown>>;
		readonly rules: readonly Rule[];
		readonly companyMission: string;
	};
	readonly companyMissions: Readonly<Record<string, string>>;
	readonly revenue: readonly {
		day: string;
		amount: number;
		h: number;
		fill: string;
		label: string;
		title: string;
	}[];
	readonly tiles: readonly OverviewTile[];
	readonly script: readonly {
		from: string;
		to: string;
		kind: BusEvent["kind"];
		skill: string;
		text: string;
		payload: Readonly<Record<string, unknown>>;
		writes?: readonly string[];
		set?: Readonly<Record<string, unknown>>;
	}[];
	readonly planPrice: Readonly<Record<string, number>>;
	readonly emptyInbox: string;
	readonly homepage: readonly { name: string; role: string; tint: string }[];
	readonly signup: {
		readonly new: readonly { id: string; name: string; role: string; tint: string; why: string }[];
		readonly existing: readonly { id: string; name: string; role: string; tint: string; why: string }[];
	};
	readonly defaultAgents: {
		readonly new: readonly string[];
		readonly existing: readonly string[];
	};
}

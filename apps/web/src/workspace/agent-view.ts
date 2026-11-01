import { pill } from "./styles.ts";

export interface MissionAgent {
	readonly mission?: string;
	readonly contribution?: number;
}

export function missionBits(agent: MissionAgent, masterName: string) {
	const mission = agent.mission ?? "";
	const contribution = agent.contribution ?? 0;
	const pending = mission.length === 0;
	return {
		missionLine: pending ? `Mission pending. ${masterName} has proposed one; approve it in the inbox.` : mission,
		missionColor: pending ? "#923b0f" : "#282828",
		contribution: pending ? 0 : contribution,
		contributionLabel: pending ? "Pending" : `${contribution}% done`,
		barColor: barColor(pending, contribution),
	};
}

function barColor(pending: boolean, contribution: number): string {
	if (pending) {
		return "#cdcdcd";
	}
	if (contribution >= 75) {
		return "#00a240";
	}
	if (contribution >= 50) {
		return "#181818";
	}
	return "#fb6a22";
}

export function agentStatus(on: boolean) {
	return {
		dot: on ? "#00a240" : "#cdcdcd",
		statusLabel: on ? "Running" : "Paused",
		statusStyle: on ? pill("#04b84c14", "#00692a") : pill("rgba(13,13,13,.06)", "#5d5d5d"),
	};
}

export function skillChips(skills: readonly { readonly id: string; readonly on: boolean }[]): readonly string[] {
	return skills
		.filter((skill) => skill.on)
		.slice(0, 3)
		.map((skill) => skill.id);
}

export function initials(owner: string): string {
	if (owner.includes("@")) {
		const local = owner.split("@")[0] ?? "";
		return local.slice(0, 2).toUpperCase();
	}
	const words = owner
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	const first = words[0] ?? "";
	const second = words[1];
	if (second) {
		return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
	}
	return first.slice(0, 2).toUpperCase();
}

export function masterInitial(masterName: string): string {
	return masterName.charAt(0).toUpperCase();
}

export function squadLine(agentCount: number, accountName: string): string {
	return `Runs ${agentCount} squads · ${accountName}`;
}

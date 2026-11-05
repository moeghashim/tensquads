import type { Autonomy, SkillGate } from "@tensquads/domain";

import { agentStatus, missionBits } from "#/workspace/agent-view.ts";
import { decorate } from "#/workspace/event-view.ts";
import { gateStyle, pill, switchParts } from "#/workspace/styles.ts";

export const AUTONOMY_OPTIONS = ["Ask first", "Auto under limit", "Full auto"] as const;

const blankMark = "—";

export function blank(value: string): string {
	return value.length === 0 ? blankMark : value;
}

interface AgentDetailEvent {
	readonly id: string;
	readonly time: string;
	readonly kind: string;
	readonly from: string;
	readonly to: string;
	readonly text: string;
}

export interface AgentDetailSource {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly on: boolean;
	readonly autonomy: Autonomy;
	readonly mission: string;
	readonly targets: readonly (readonly [string, string, string])[];
	readonly contribution: number;
	readonly kpis: readonly (readonly [string, string])[];
	readonly skills: readonly {
		readonly id: string;
		readonly desc: string;
		readonly gate: SkillGate;
		readonly runs: number;
		readonly on: boolean;
	}[];
	readonly host: string;
	readonly region: string;
	readonly size: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly storedCpu: string;
	readonly storedUptime: string;
	readonly egress: readonly string[];
	readonly secrets: readonly string[];
	readonly events: readonly AgentDetailEvent[];
	readonly masterName: string;
	readonly companyMission: string;
	readonly names: Readonly<Record<string, string>>;
}

interface SwitchView {
	readonly switchBg: string;
	readonly switchJustify: string;
	readonly onStr: string;
}

export interface AgentDetailView {
	readonly accountId?: string;
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly on: boolean;
	readonly switchBg: string;
	readonly switchJustify: string;
	readonly onStr: string;
	readonly statusLabel: string;
	readonly statusStyle: string;
	readonly vmState: string;
	readonly missionText: string;
	readonly missionStatus: string;
	readonly missionStatusStyle: string;
	readonly contribution: number;
	readonly contributionLabel: string;
	readonly barColor: string;
	readonly companyMission: string;
	readonly masterName: string;
	readonly names: Readonly<Record<string, string>>;
	readonly askLabel: string;
	readonly targets: readonly { readonly label: string; readonly now: string; readonly goal: string }[];
	readonly noTargets: boolean;
	readonly kpis: readonly { readonly label: string; readonly value: string }[];
	readonly skills: readonly (SwitchView & {
		readonly id: string;
		readonly desc: string;
		readonly gate: string;
		readonly gateStyle: string;
		readonly runs: number;
	})[];
	readonly autonomyOpts: readonly { readonly label: Autonomy; readonly onStr: string; readonly style: string }[];
	readonly host: string;
	readonly region: string;
	readonly size: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly storedCpu: string;
	readonly storedUptime: string;
	readonly egress: readonly string[];
	readonly secrets: readonly string[];
	readonly sandboxNote: string;
	readonly skillsIntro: string;
	readonly messagesTitle: string;
	readonly events: readonly {
		readonly id: string;
		readonly time: string;
		readonly kind: string;
		readonly kindStyle: string;
		readonly from: string;
		readonly to: string;
		readonly route: string;
		readonly text: string;
	}[];
}

export function autonomyStyle(on: boolean): string {
	const color = on ? "#0d0d0d" : "#5d5d5d";
	const background = on ? "#fff" : "transparent";
	const shadow = on ? "0 1px 2px rgba(0,0,0,.12)" : "none";
	return `height: 28px; padding: 0 12px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 500; color: ${color}; background: ${background}; box-shadow: ${shadow}`;
}

function missionCopy(source: AgentDetailSource) {
	const pending = source.mission.length === 0;
	return {
		missionText: pending
			? `No mission yet. ${source.masterName} has proposed one; approve it in the inbox on the Overview.`
			: source.mission,
		missionStatus: pending ? "Pending approval" : "Approved by you",
		missionStatusStyle: pending ? pill("#fb6a2214", "#923b0f") : pill("#04b84c14", "#00692a"),
	};
}

export function agentDetailView(source: AgentDetailSource): AgentDetailView {
	const status = agentStatus(source.on);
	const bits = missionBits({ mission: source.mission, contribution: source.contribution }, source.masterName);
	const mission = missionCopy(source);
	return {
		id: source.id,
		name: source.name,
		role: source.role,
		tint: source.tint,
		on: source.on,
		...switchParts(source.on),
		statusLabel: status.statusLabel,
		statusStyle: status.statusStyle,
		vmState: source.on ? "Isolated · running" : "Isolated · stopped",
		...mission,
		contribution: bits.contribution,
		contributionLabel: bits.contributionLabel,
		barColor: bits.barColor,
		companyMission: blank(source.companyMission),
		masterName: source.masterName,
		names: source.names,
		askLabel: `Ask ${source.masterName} to revise`,
		targets: source.targets.map(([label, now, goal]) => ({
			label: blank(label),
			now: blank(now),
			goal: blank(goal),
		})),
		noTargets: source.targets.length === 0,
		kpis: source.kpis.map(([label, value]) => ({ label: blank(label), value: blank(value) })),
		skills: source.skills.map((skill) => ({
			id: skill.id,
			desc: blank(skill.desc.replaceAll("the master", source.masterName)),
			gate: skill.gate,
			gateStyle: gateStyle(skill.gate),
			runs: skill.runs,
			...switchParts(skill.on),
		})),
		autonomyOpts: AUTONOMY_OPTIONS.map((label) => {
			const selected = source.autonomy === label;
			return { label, onStr: selected ? "true" : "false", style: autonomyStyle(selected) };
		}),
		host: blank(source.host),
		region: blank(source.region),
		size: blank(source.size),
		cpu: blank(source.cpu),
		uptime: blank(source.uptime),
		storedCpu: source.storedCpu,
		storedUptime: source.storedUptime,
		egress: source.egress.map((item) => blank(item)),
		secrets: source.secrets.map((item) => blank(item)),
		sandboxNote: `No direct link to other squads. It sends and receives only through ${source.masterName}, and only the state keys listed in each message. Every run also gets the company mission, the squad mission and its targets.`,
		skillsIntro: `What this squad can do. ${source.masterName} can only ask it for a skill that is turned on.`,
		messagesTitle: `Messages with ${source.masterName}`,
		events: source.events.map((event) => {
			const view = decorate(event, "", source.masterName, source.names);
			return {
				id: event.id,
				time: event.time,
				kind: event.kind,
				kindStyle: view.kindStyle,
				from: event.from,
				to: event.to,
				route: view.route,
				text: event.text,
			};
		}),
	};
}

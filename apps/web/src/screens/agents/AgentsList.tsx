import { useNavigate } from "@tanstack/react-router";

import { css } from "#/screens/css.ts";
import { agentStatus, missionBits, ownerText, skillChips } from "#/workspace/agent-view.ts";

import type { AgentCardData } from "./types.ts";

const column = "display: flex; flex-direction: column; gap: 20px";
const heading =
	"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d";
const intro = "margin: 4px 0 0; color: #5d5d5d";
const grid = "display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px";
const card =
	"text-align: left; border: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 18px; display: flex; flex-direction: column; gap: 12px; color: #282828";
const titleRow = "display: flex; gap: 10px; align-items: center; width: 100%";
const swatch = "width: 32px; height: 32px; border-radius: 8px";
const nameColumn = "display: flex; flex-direction: column; flex: 1";
const nameText = "font-weight: 600; font-size: 15px; color: #0d0d0d";
const roleText = "font-size: 12px; color: #5d5d5d";
const missionBlock = "display: flex; flex-direction: column; gap: 6px; width: 100%";
const missionText = "font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis";
const barRow = "display: flex; align-items: center; gap: 8px";
const track = "flex: 1; height: 6px; border-radius: 999px; background: rgba(13,13,13,.06); overflow: hidden";
const label = "font-size: 12px; font-weight: 600; color: #0d0d0d; width: 64px; text-align: right";
const hostRow =
	"display: flex; gap: 6px; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #5d5d5d";
const chips = "display: flex; flex-wrap: wrap; gap: 6px";
const chip =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.06); font-family: 'JetBrains Mono', monospace; font-size: 11px; display: inline-flex; align-items: center; color: #414141";
const stats = "display: flex; gap: 14px; font-size: 12px; color: #5d5d5d";
const statValue = "color: #0d0d0d";

export function AgentsList({
	masterName,
	agents,
}: {
	readonly masterName: string;
	readonly agents: readonly AgentCardData[];
}) {
	return (
		<div data-if="isAgentList" style={css("display: contents")}>
			<div style={css(column)}>
				<header>
					<h1 style={css(heading)}>Squads</h1>
					<p style={css(intro)}>{introLine(masterName)}</p>
				</header>
				<div style={css(grid)}>
					<div data-loop="agents" data-loop-as="a" style={css("display: contents")}>
						{agents.map((agent, index) => (
							<AgentCard key={agent.id} agent={agent} masterName={masterName} first={index === 0} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function introLine(masterName: string): string {
	return `Each squad is one agent with its own tools. It runs alone in its own sandbox server, with only its own skills, keys and network access. Squads work together only through ${masterName}, and each one has a mission it is scored on.`;
}

function AgentCard({
	agent,
	masterName,
	first,
}: {
	readonly agent: AgentCardData;
	readonly masterName: string;
	readonly first: boolean;
}) {
	const navigate = useNavigate();
	const mission = missionBits(agent, masterName);
	const status = agentStatus(agent.on);
	const chipsOn = skillChips(agent.skills);
	return (
		<button
			type="button"
			data-handler="a.open"
			data-event="onClick"
			onClick={() => void navigate({ to: "/agents/$id", params: { id: agent.id } })}
			style={css(card)}
		>
			<div style={css(titleRow)}>
				<span style={css(`${swatch}; background: ${agent.tint}`)} />
				<div style={css(nameColumn)}>
					<span style={css(nameText)}>{agent.name}</span>
					<span style={css(roleText)}>{agent.role}</span>
				</div>
				<span style={css(status.statusStyle)}>{status.statusLabel}</span>
			</div>
			<div style={css(missionBlock)}>
				<span style={css(`${missionText}; color: ${mission.missionColor}`)}>{mission.missionLine}</span>
				<div style={css(barRow)}>
					<div style={css(track)}>
						<div style={css(fillStyle(mission.contribution, mission.barColor))} />
					</div>
					<span style={css(label)}>{mission.contributionLabel}</span>
				</div>
			</div>
			<div style={css(hostRow)}>
				<HostIcon />
				{hostLine(agent.host, agent.region)}
			</div>
			<div style={css(chips)}>
				<SkillChips first={first} chips={chipsOn} />
			</div>
			<div style={css(stats)}>
				<Stat value={String(agent.tasks)} label="tasks" />
				<Stat value={ownerText(agent.success)} label="success" />
				<Stat value={agent.autonomy} label="" />
			</div>
		</button>
	);
}

function Stat({ value, label }: { readonly value: string; readonly label: string }) {
	return (
		<span>
			<strong style={css(statValue)}>{value}</strong>
			{label.length > 0 ? ` ${label}` : ""}
		</span>
	);
}

function SkillChips({ first, chips: names }: { readonly first: boolean; readonly chips: readonly string[] }) {
	return (
		<div
			data-loop={first ? "a.skillChips" : undefined}
			data-loop-as={first ? "sk" : undefined}
			style={css("display: contents")}
		>
			{names.map((name) => (
				<span key={name} style={css(chip)}>
					{name}
				</span>
			))}
		</div>
	);
}

function fillStyle(contribution: number, color: string): string {
	return `height: 100%; width: ${contribution}%; background: ${color}; border-radius: 999px`;
}

function hostLine(host: string, region: string): string {
	return `${ownerText(host)} · ${ownerText(region)}`;
}

function HostIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<rect x="2" y="3" width="12" height="4" rx="1" />
			<rect x="2" y="9" width="12" height="4" rx="1" />
			<path d="M5 5h0M5 11h0" />
		</svg>
	);
}

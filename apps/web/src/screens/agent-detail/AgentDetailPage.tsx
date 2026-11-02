import type { Autonomy } from "@tensquads/domain";
import type { ReactNode } from "react";

import { css } from "#/screens/css.ts";

import { BackIcon, SquadIcon } from "./icons.tsx";
import type { AgentDetailView } from "./model.ts";

const column = "display: flex; flex-direction: column; gap: 20px";
const card =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 4px";
const missionCard =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start";
const knob = "border-radius: 999px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2)";
const mono = "font-family: 'JetBrains Mono', monospace";

interface AgentDetailPageProps {
	readonly view: AgentDetailView;
	readonly onAgents: () => void;
	readonly onToggle: () => void;
	readonly onAsk: () => void;
	readonly onSkill: (skillId: string, on: boolean) => void;
	readonly onAutonomy: (autonomy: Autonomy) => void;
	readonly onInspect: (eventId: string) => void;
}

function Loop({ name, as, children }: { readonly name: string; readonly as: string; readonly children: ReactNode }) {
	return (
		<div data-loop={name} data-loop-as={as} style={css("display: contents")}>
			{children}
		</div>
	);
}

function Shown({ value, children }: { readonly value: string; readonly children: ReactNode }) {
	return (
		<div data-if={value} style={css("display: contents")}>
			{children}
		</div>
	);
}

export function AgentDetailPage({
	view,
	onAgents,
	onToggle,
	onAsk,
	onSkill,
	onAutonomy,
	onInspect,
}: AgentDetailPageProps) {
	return (
		<Shown value="isAgentDetail">
			<div style={css(column)}>
				<div>
					<button
						type="button"
						className="row-btn"
						data-handler="goAgents"
						data-event="onClick"
						onClick={onAgents}
						style={css(
							"height: 28px; padding: 0 10px 0 6px; border: 0; border-radius: 999px; background: transparent; color: #5d5d5d; font-size: 13px; display: inline-flex; align-items: center; gap: 4px",
						)}
					>
						<BackIcon />
						All squads
					</button>
				</div>
				<DetailHeader view={view} onToggle={onToggle} />
				<Mission view={view} onAsk={onAsk} />
				<Numbers view={view} />
				<Work view={view} onSkill={onSkill} onAutonomy={onAutonomy} />
				<Messages view={view} onInspect={onInspect} />
			</div>
		</Shown>
	);
}

function DetailHeader({ view, onToggle }: { readonly view: AgentDetailView; readonly onToggle: () => void }) {
	return (
		<header style={css("display: flex; flex-wrap: wrap; gap: 16px; align-items: center")}>
			<span
				style={css(
					`width: 48px; height: 48px; border-radius: 12px; background: ${view.tint}; display: flex; align-items: center; justify-content: center`,
				)}
			>
				<SquadIcon />
			</span>
			<div style={css("flex: 1; min-width: 200px")}>
				<h1
					style={css(
						"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
					)}
				>
					{view.name} squad
				</h1>
				<p style={css("margin: 2px 0 0; color: #5d5d5d")}>{view.role}</p>
			</div>
			<div style={css("display: flex; align-items: center; gap: 10px")}>
				<span style={css("font-size: 13px; color: #5d5d5d")}>{view.statusLabel}</span>
				<button
					type="button"
					data-handler="sel.toggle"
					data-event="onClick"
					aria-pressed={view.onStr === "true"}
					aria-label="Squad running"
					onClick={onToggle}
					style={css(
						`width: 40px; height: 24px; border: 0; border-radius: 999px; background: ${view.switchBg}; padding: 2px; display: flex; justify-content: ${view.switchJustify}`,
					)}
				>
					<span style={css(`width: 20px; height: 20px; ${knob}`)} />
				</button>
			</div>
		</header>
	);
}

function Mission({ view, onAsk }: { readonly view: AgentDetailView; readonly onAsk: () => void }) {
	return (
		<section aria-label="Mission" style={css(missionCard)}>
			<div style={css("flex: 2 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 10px")}>
				<div style={css("display: flex; align-items: center; gap: 8px")}>
					<span
						style={css(
							"height: 20px; padding: 0 8px; border-radius: 999px; background: #181818; color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center",
						)}
					>
						Mission
					</span>
					<span style={css(view.missionStatusStyle)}>{view.missionStatus}</span>
				</div>
				<p
					style={css(
						"margin: 0; font-size: 17px; line-height: 25px; font-weight: 500; letter-spacing: -0.01em; color: #0d0d0d",
					)}
				>
					{view.missionText}
				</p>
				<p style={css("margin: 0; font-size: 12px; color: #5d5d5d")}>
					Rolls up to the company mission: {view.companyMission}
				</p>
				<Contribution view={view} />
				<div>
					<button
						type="button"
						className="soft-btn"
						data-handler="sel.askRevise"
						data-event="onClick"
						onClick={onAsk}
						style={css(
							"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 13px; font-weight: 500",
						)}
					>
						{view.askLabel}
					</button>
				</div>
			</div>
			<Targets view={view} />
		</section>
	);
}

function Contribution({ view }: { readonly view: AgentDetailView }) {
	return (
		<div style={css("display: flex; align-items: center; gap: 10px; padding-top: 4px")}>
			<span style={css("font-size: 12px; color: #5d5d5d; width: 90px")}>Contribution</span>
			<div
				style={css("flex: 1; height: 8px; border-radius: 999px; background: rgba(13,13,13,.06); overflow: hidden")}
			>
				<div
					style={css(
						`height: 100%; width: ${view.contribution}%; background: ${view.barColor}; border-radius: 999px`,
					)}
				/>
			</div>
			<span style={css("font-size: 14px; font-weight: 600; color: #0d0d0d; width: 48px; text-align: right")}>
				{view.contributionLabel}
			</span>
		</div>
	);
}

function Targets({ view }: { readonly view: AgentDetailView }) {
	return (
		<div style={css("flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 4px")}>
			<span style={css("font-size: 12px; font-weight: 500; color: #5d5d5d")}>Targets</span>
			<Loop name="sel.targets" as="t">
				{view.targets.map((target) => (
					<div
						key={`${target.label}-${target.goal}`}
						style={css(
							"display: flex; gap: 10px; align-items: baseline; padding: 8px 0; border-top: 1px solid rgba(13,13,13,.06); font-size: 13px",
						)}
					>
						<span style={css("flex: 1; color: #282828")}>{target.label}</span>
						<span style={css("font-weight: 600; color: #0d0d0d")}>{target.now}</span>
						<span style={css("font-size: 12px; color: #5d5d5d")}>goal {target.goal}</span>
					</div>
				))}
			</Loop>
			{view.noTargets ? (
				<Shown value="sel.noTargets">
					<span style={css("font-size: 13px; color: #5d5d5d; padding: 8px 0")}>
						No targets until the mission is approved.
					</span>
				</Shown>
			) : null}
		</div>
	);
}

function Numbers({ view }: { readonly view: AgentDetailView }) {
	return (
		<section
			aria-label="Squad numbers"
			style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px")}
		>
			<Loop name="sel.kpis" as="k">
				{view.kpis.map((kpi) => (
					<div
						key={kpi.label}
						style={css(
							"background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px",
						)}
					>
						<span style={css("font-size: 12px; color: #5d5d5d")}>{kpi.label}</span>
						<span
							style={css(
								"font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
							)}
						>
							{kpi.value}
						</span>
					</div>
				))}
			</Loop>
		</section>
	);
}

function Work({
	view,
	onSkill,
	onAutonomy,
}: {
	readonly view: AgentDetailView;
	readonly onSkill: (skillId: string, on: boolean) => void;
	readonly onAutonomy: (autonomy: Autonomy) => void;
}) {
	return (
		<div style={css("display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start")}>
			<Skills view={view} onSkill={onSkill} onAutonomy={onAutonomy} />
			<Sandbox view={view} />
		</div>
	);
}

function Skills({
	view,
	onSkill,
	onAutonomy,
}: {
	readonly view: AgentDetailView;
	readonly onSkill: (skillId: string, on: boolean) => void;
	readonly onAutonomy: (autonomy: Autonomy) => void;
}) {
	return (
		<section aria-label="Skills" style={css(`flex: 3 1 380px; min-width: 0; ${card}`)}>
			<h2 style={css("margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #0d0d0d")}>Skills</h2>
			<p style={css("margin: 0 0 8px; font-size: 13px; color: #5d5d5d")}>{view.skillsIntro}</p>
			<Loop name="sel.skills" as="sk">
				{view.skills.map((skill) => (
					<div
						key={skill.id}
						style={css(
							"display: flex; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid rgba(13,13,13,.06)",
						)}
					>
						<div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px")}>
							<span style={css(`${mono}; font-size: 13px; color: #0d0d0d`)}>{skill.id}</span>
							<span style={css("font-size: 13px; color: #5d5d5d")}>{skill.desc}</span>
						</div>
						<span style={css(skill.gateStyle)}>{skill.gate}</span>
						<span style={css("font-size: 12px; color: #5d5d5d; width: 56px; text-align: right")}>
							{skill.runs} runs
						</span>
						<button
							type="button"
							data-handler="sk.toggle"
							data-event="onClick"
							aria-pressed={skill.onStr === "true"}
							aria-label="Skill enabled"
							onClick={() => onSkill(skill.id, skill.onStr !== "true")}
							style={css(
								`width: 34px; height: 20px; border: 0; border-radius: 999px; background: ${skill.switchBg}; padding: 2px; display: flex; justify-content: ${skill.switchJustify}; flex: none`,
							)}
						>
							<span style={css(`width: 16px; height: 16px; ${knob}`)} />
						</button>
					</div>
				))}
			</Loop>
			<h2 style={css("margin: 16px 0 4px; font-size: 16px; font-weight: 600; color: #0d0d0d")}>
				How much it can do alone
			</h2>
			{/* biome-ignore lint/a11y/useSemanticElements: The design marks this control as a group. */}
			<div
				role="group"
				aria-label="Autonomy"
				style={css(
					"display: inline-flex; align-self: flex-start; flex-wrap: wrap; background: #ededed; border-radius: 999px; padding: 2px; gap: 2px",
				)}
			>
				<Loop name="sel.autonomyOpts" as="o">
					{view.autonomyOpts.map((option) => (
						<button
							key={option.label}
							type="button"
							data-handler="o.pick"
							data-event="onClick"
							aria-pressed={option.onStr === "true"}
							onClick={() => onAutonomy(option.label)}
							style={css(option.style)}
						>
							{option.label}
						</button>
					))}
				</Loop>
			</div>
		</section>
	);
}

function Sandbox({ view }: { readonly view: AgentDetailView }) {
	return (
		<section aria-label="Sandbox" style={css(`flex: 2 1 280px; min-width: 0; ${card}; gap: 12px`)}>
			<div style={css("display: flex; align-items: center; justify-content: space-between")}>
				<h2 style={css("margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d")}>Sandbox</h2>
				<span style={css(view.statusStyle)}>{view.vmState}</span>
			</div>
			<dl style={css("margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px")}>
				<dt style={css("color: #5d5d5d")}>Server</dt>
				<dd style={css(`margin: 0; ${mono}; font-size: 12px; color: #0d0d0d`)}>{view.host}</dd>
				<dt style={css("color: #5d5d5d")}>Region</dt>
				<dd style={css("margin: 0; color: #0d0d0d")}>{view.region}</dd>
				<dt style={css("color: #5d5d5d")}>Size</dt>
				<dd style={css("margin: 0; color: #0d0d0d")}>{view.size}</dd>
				<dt style={css("color: #5d5d5d")}>CPU now</dt>
				<dd style={css("margin: 0; color: #0d0d0d")}>{view.cpu}</dd>
				<dt style={css("color: #5d5d5d")}>Uptime</dt>
				<dd style={css("margin: 0; color: #0d0d0d")}>{view.uptime}</dd>
			</dl>
			<div style={css("font-size: 12px; font-weight: 500; color: #5d5d5d; margin-top: 4px")}>Can reach</div>
			<div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
				<Loop name="sel.egress" as="h">
					{view.egress.map((host) => (
						<span
							key={host}
							style={css(
								`height: 22px; padding: 0 8px; border-radius: 999px; background: #0285ff0a; box-shadow: inset 0 0 0 1px #0169cc33; color: #004f99; ${mono}; font-size: 11px; display: inline-flex; align-items: center`,
							)}
						>
							{host}
						</span>
					))}
				</Loop>
			</div>
			<div style={css("font-size: 12px; font-weight: 500; color: #5d5d5d")}>Its own keys</div>
			<div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
				<Loop name="sel.secrets" as="s">
					{view.secrets.map((secret) => (
						<span
							key={secret}
							style={css(
								`height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.06); ${mono}; font-size: 11px; display: inline-flex; align-items: center; color: #414141`,
							)}
						>
							{secret}
						</span>
					))}
				</Loop>
			</div>
			<p
				style={css(
					"margin: 0; font-size: 12px; color: #5d5d5d; background: #f9f9f9; border-radius: 8px; padding: 10px",
				)}
			>
				{view.sandboxNote}
			</p>
		</section>
	);
}

function Messages({
	view,
	onInspect,
}: {
	readonly view: AgentDetailView;
	readonly onInspect: (eventId: string) => void;
}) {
	return (
		<section aria-label="Messages" style={css(card)}>
			<h2 style={css("margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #0d0d0d")}>{view.messagesTitle}</h2>
			<Loop name="sel.bus" as="e">
				{view.events.map((event) => (
					<button
						key={event.id}
						type="button"
						className="row-btn"
						data-handler="e.inspect"
						data-event="onClick"
						onClick={() => onInspect(event.id)}
						style={css(
							"text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 8px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; color: #282828",
						)}
					>
						<span style={css(`${mono}; font-size: 12px; color: #5d5d5d; width: 44px`)}>{event.time}</span>
						<span style={css(event.kindStyle)}>{event.kind}</span>
						<span style={css("font-size: 12px; color: #5d5d5d; width: 150px")}>{event.route}</span>
						<span style={css("flex: 1; min-width: 200px; font-size: 13px")}>{event.text}</span>
					</button>
				))}
			</Loop>
		</section>
	);
}

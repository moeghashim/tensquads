import { useNavigate } from "@tanstack/react-router";
import { blankText, revisingLine } from "@tensquads/domain";
import { useRef } from "react";

import { css } from "#/screens/css.ts";
import { decideMissionOverview, decideOverview } from "#/server/overview.ts";
import { missionBits } from "#/workspace/agent-view.ts";
import { useRefresh } from "#/workspace/context.ts";

import { runDecision } from "./actions.ts";
import type { OverviewAgentView, OverviewData } from "./types.ts";

const column = "display: flex; flex-direction: column; gap: 24px";
const header = "display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between";
const heading =
	"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d";
const sub = "margin: 4px 0 0; color: #5d5d5d";
const missionPill =
	"margin: 12px 0 0; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(13,13,13,.08); font-size: 13px; color: #0d0d0d";
const missionMark =
	"height: 20px; padding: 0 8px; border-radius: 999px; background: #181818; color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center";
const pillRow = "display: flex; gap: 8px; flex-wrap: wrap";
const demoPill =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.08); font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; color: #5d5d5d";
const onlinePill =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: #04b84c14; color: #008635; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center";
const tiles = "display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px";
const tile =
	"background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 6px";
const tileLabel = "font-size: 12px; color: #5d5d5d";
const tileValue = "font-size: 24px; line-height: 30px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d";
const split = "display: flex; flex-wrap: wrap; gap: 16px; align-items: stretch";
const revenue =
	"flex: 3 1 420px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 16px";
const between = "display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px";
const h2 = "margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d";
const hint = "font-size: 12px; color: #5d5d5d";
const track =
	"height: 200px; display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid rgba(13,13,13,.08)";
const labels = "display: flex; gap: 6px";
const dayLabel = "flex: 1; text-align: center; font-size: 11px; color: #5d5d5d";
const legend = "display: flex; gap: 16px; font-size: 12px; color: #5d5d5d";
const legendItem = "display: inline-flex; align-items: center; gap: 6px";
const inbox =
	"flex: 2 1 300px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 12px";
const inboxHead = "display: flex; justify-content: space-between; align-items: center";
const count =
	"min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #fb6a2212; color: #923b0f; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center";
const proposal =
	"border-radius: 12px; background: #f9f9f9; box-shadow: inset 0 0 0 1px rgba(13,13,13,.06); padding: 12px; display: flex; flex-direction: column; gap: 8px";
const approval =
	"border-radius: 12px; background: #f9f9f9; padding: 12px; display: flex; flex-direction: column; gap: 8px";
const row = "display: flex; gap: 8px; align-items: center";
const squad = "font-size: 12px; color: #5d5d5d";
const badge =
	"margin-left: auto; height: 20px; padding: 0 8px; border-radius: 999px; background: #181818; color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center";
const title = "font-weight: 500; color: #0d0d0d";
const missionBody = "font-size: 13px; color: #282828";
const chips = "display: flex; flex-wrap: wrap; gap: 6px";
const chip =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(13,13,13,.1); font-size: 11px; display: inline-flex; align-items: center; color: #414141";
const actions = "display: flex; gap: 8px";
const approveButton =
	"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 13px; font-weight: 500";
const softButton =
	"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 13px; font-weight: 500";
const revising = "font-size: 12px; color: #5d5d5d; display: inline-flex; align-items: center; gap: 6px";
const orangeDot = "width: 8px; height: 8px; border-radius: 999px; background: #fb6a22";
const amount = "margin-left: auto; font-weight: 600; color: #0d0d0d";
const detail = "font-size: 13px; color: #5d5d5d";
const empty = "padding: 24px 8px; text-align: center; color: #5d5d5d";
const agents = "display: flex; flex-direction: column; gap: 12px";
const agentHead = "display: flex; justify-content: space-between; align-items: baseline";
const trafficButton =
	"height: 32px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: #0169cc; font-size: 13px; font-weight: 500";
const grid = "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px";
const card =
	"text-align: left; border: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 10px; color: #282828";
const cardHead = "display: flex; gap: 10px; align-items: center; width: 100%";
const nameCol = "display: flex; flex-direction: column; flex: 1";
const nameStyle = "font-weight: 600; color: #0d0d0d";
const roleStyle = "font-size: 12px; color: #5d5d5d";
const lastStyle = "font-size: 13px; color: #5d5d5d";
const missionBlock =
	"display: flex; flex-direction: column; gap: 6px; width: 100%; padding-top: 4px; border-top: 1px solid rgba(13,13,13,.06)";
const barRow = "display: flex; align-items: center; gap: 8px";
const barTrack = "flex: 1; height: 6px; border-radius: 999px; background: rgba(13,13,13,.06); overflow: hidden";
const contrib = "font-size: 12px; font-weight: 600; color: #0d0d0d; width: 64px; text-align: right";
const stats = "display: flex; gap: 14px; font-size: 12px; color: #5d5d5d";
const strong = "color: #0d0d0d";
const contents = "display: contents";

export function OverviewPage({ data }: { readonly data: OverviewData }) {
	const navigate = useNavigate();
	const refresh = useRefresh();
	const pending = useRef(false);
	const decide = (id: string, ok: boolean) => {
		void runDecision(pending, (signal) => decideOverview({ data: { id, ok }, signal }), refresh);
	};
	const decideMission = (id: string, ok: boolean) => {
		void runDecision(pending, (signal) => decideMissionOverview({ data: { id, ok }, signal }), refresh);
	};
	return (
		<div data-if="isOverview" style={css(contents)}>
			<div style={css(column)}>
				<header style={css(header)}>
					<div>
						<h1 style={css(heading)}>{data.greeting}</h1>
						<p style={css(sub)}>Last 7 days across the store and your squads. Figures are demo data.</p>
						<p style={css(missionPill)}>
							<span style={css(missionMark)}>Mission</span>
							{data.mission}
						</p>
					</div>
					<div style={css(pillRow)}>
						<span style={css(demoPill)}>Demo data</span>
						<span data-design-contrast="overview-online-pill" style={css(onlinePill)}>
							{data.online}
						</span>
					</div>
				</header>
				<section aria-label="Key numbers" style={css(tiles)}>
					<div data-loop="kpis" data-loop-as="k" style={css(contents)}>
						{data.tiles.map((item) => (
							<div key={item.label} style={css(tile)}>
								<span style={css(tileLabel)}>{item.label}</span>
								<span style={css(tileValue)}>{item.value}</span>
								<span style={css(`font-size: 12px; color: ${item.deltaColor}`)}>{item.delta}</span>
							</div>
						))}
					</div>
				</section>
				<div style={css(split)}>
					<section aria-label="Revenue" style={css(revenue)}>
						<div style={css(between)}>
							<h2 style={css(h2)}>Revenue, last 14 days</h2>
							<span style={css(hint)}>Hover a bar for the day's total</span>
						</div>
						<div style={css(track)}>
							<div data-loop="bars" data-loop-as="b" style={css(contents)}>
								{data.bars.map((bar) => (
									<div
										key={bar.title}
										title={bar.title}
										style={css(
											`flex: 1; height: ${bar.h}%; background: ${bar.fill}; border-radius: 4px 4px 0 0`,
										)}
									/>
								))}
							</div>
						</div>
						<div style={css(labels)}>
							<div data-loop="bars" data-loop-as="b" style={css(contents)}>
								{data.bars.map((bar) => (
									<span key={bar.title} style={css(dayLabel)}>
										{bar.label}
									</span>
								))}
							</div>
							{data.bars.length === 0 ? <span style={css(dayLabel)}>{"\u00a0"}</span> : null}
						</div>
						<div style={css(legend)}>
							<span style={css(legendItem)}>
								<span style={css("width: 10px; height: 10px; border-radius: 2px; background: #c9c9c9")} />
								Previous week
							</span>
							<span style={css(legendItem)}>
								<span style={css("width: 10px; height: 10px; border-radius: 2px; background: #181818")} />
								This week
							</span>
						</div>
					</section>
					<section aria-label="Needs you" style={css(inbox)}>
						<div style={css(inboxHead)}>
							<h2 style={css(h2)}>Needs your approval</h2>
							<span style={css(count)}>{data.count}</span>
						</div>
						<div data-loop="missionProposals" data-loop-as="mp" style={css(contents)}>
							{data.proposals.map((item, index) => (
								<div key={item.id} style={css(proposal)}>
									<div style={css(row)}>
										<span style={css(tint(item.tint))} />
										<span style={css(squad)}>{item.agentName} squad</span>
										<span style={css(badge)}>Mission</span>
									</div>
									<div style={css(title)}>{item.title}</div>
									<div style={css(missionBody)}>{item.mission}</div>
									<div style={css(chips)}>
										<div
											data-loop={index === 0 ? "mp.targetChips" : undefined}
											data-loop-as={index === 0 ? "t" : undefined}
											style={css(contents)}
										>
											{item.chips.map((chipText) => (
												<span key={chipText} style={css(chip)}>
													{chipText}
												</span>
											))}
										</div>
									</div>
									{item.proposed ? (
										<div data-if="mp.isProposed" style={css(contents)}>
											<div style={css(actions)}>
												<button
													type="button"
													data-handler="mp.approve"
													data-event="onClick"
													onClick={() => decideMission(item.id, true)}
													style={css(approveButton)}
												>
													Approve mission
												</button>
												<button
													type="button"
													className="soft-btn"
													data-handler="mp.decline"
													data-event="onClick"
													onClick={() => decideMission(item.id, false)}
													style={css(softButton)}
												>
													Ask for another
												</button>
											</div>
										</div>
									) : null}
									{item.revising ? (
										<div data-if="mp.isRevising" style={css(contents)}>
											<div style={css(revising)}>
												<span style={css(orangeDot)} />
												{revisingLine(data.masterName)}
											</div>
										</div>
									) : null}
								</div>
							))}
						</div>
						<div data-loop="approvals" data-loop-as="ap" style={css(contents)}>
							{data.approvals.map((item) => (
								<div key={item.id} style={css(approval)}>
									<div style={css(row)}>
										<span style={css(tint(item.tint))} />
										<span style={css(squad)}>{item.agentName} squad</span>
										<span style={css(amount)}>{item.amount}</span>
									</div>
									<div style={css(title)}>{item.title}</div>
									<div style={css(detail)}>{item.detail}</div>
									<div style={css(actions)}>
										<button
											type="button"
											data-handler="ap.approve"
											data-event="onClick"
											onClick={() => decide(item.id, true)}
											style={css(approveButton)}
										>
											Approve
										</button>
										<button
											type="button"
											className="soft-btn"
											data-handler="ap.decline"
											data-event="onClick"
											onClick={() => decide(item.id, false)}
											style={css(softButton)}
										>
											Decline
										</button>
									</div>
								</div>
							))}
						</div>
						{data.empty ? (
							<div data-if="noApprovals" style={css(contents)}>
								<div style={css(empty)}>{data.emptyText}</div>
							</div>
						) : null}
					</section>
				</div>
				<section aria-label="Agents at a glance" style={css(agents)}>
					<div style={css(agentHead)}>
						<h2 style={css(h2)}>Squads and their missions</h2>
						<button
							type="button"
							className="row-btn"
							data-handler="goFlow"
							data-event="onClick"
							onClick={() => void navigate({ to: "/traffic" })}
							style={css(trafficButton)}
						>
							See squad traffic
						</button>
					</div>
					<div style={css(grid)}>
						<div data-loop="agents" data-loop-as="a" style={css(contents)}>
							{data.agents.map((agent) => (
								<AgentCard
									key={agent.id}
									agent={agent}
									masterName={data.masterName}
									onOpen={() => void navigate({ to: "/agents/$id", params: { id: agent.id } })}
								/>
							))}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

function AgentCard({
	agent,
	masterName,
	onOpen,
}: {
	readonly agent: OverviewAgentView;
	readonly masterName: string;
	readonly onOpen: () => void;
}) {
	const mission = missionBits(agent, masterName);
	return (
		<button type="button" data-handler="a.open" data-event="onClick" onClick={onOpen} style={css(card)}>
			<div style={css(cardHead)}>
				<span style={css(icon(agent.tint))}>
					<AgentIcon />
				</span>
				<div style={css(nameCol)}>
					<span style={css(nameStyle)}>{agent.name}</span>
					<span style={css(roleStyle)}>{agent.role}</span>
				</div>
			</div>
			<div style={css(lastStyle)}>{blankText(agent.last)}</div>
			<div style={css(missionBlock)}>
				<span style={css(missionLine(mission.missionColor))}>{mission.missionLine}</span>
				<div style={css(barRow)}>
					<div style={css(barTrack)}>
						<div style={css(barFill(mission.contribution, mission.barColor))} />
					</div>
					<span style={css(contrib)}>{mission.contributionLabel}</span>
				</div>
			</div>
			<div style={css(stats)}>
				<span>
					<strong style={css(strong)}>{agent.tasks}</strong> tasks
				</span>
				<span>
					<strong style={css(strong)}>{blankText(agent.success)}</strong> success
				</span>
				<span>
					<strong style={css(strong)}>{blankText(agent.saved)}</strong> saved
				</span>
			</div>
		</button>
	);
}

function AgentIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="#0d0d0d"
			strokeWidth="1.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<rect x="3" y="5" width="10" height="8" rx="2" />
			<path d="M8 2.5V5M6 9h0M10 9h0" />
		</svg>
	);
}

function tint(color: string) {
	return `width: 18px; height: 18px; border-radius: 5px; background: ${color}`;
}

function icon(color: string) {
	return `width: 28px; height: 28px; border-radius: 8px; background: ${color}; display: flex; align-items: center; justify-content: center`;
}

function missionLine(color: string) {
	return `font-size: 12px; color: ${color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`;
}

function barFill(width: number, color: string) {
	return `height: 100%; width: ${width}%; background: ${color}; border-radius: 999px`;
}

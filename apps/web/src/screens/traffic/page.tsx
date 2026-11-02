import { createElement, Fragment, useEffect, useRef } from "react";

import { css } from "#/screens/css.ts";
import { useRefresh, useWorkspace } from "#/workspace/context.ts";
import { decorate } from "#/workspace/event-view.ts";
import { consumeQueuedEvent, sendNextEvent } from "#/workspace/live.ts";
import { kindStyle } from "#/workspace/styles.ts";

import {
	filterStyle,
	hubCounts,
	hubLine,
	hubStyle,
	liveDot,
	liveStyle,
	messagingRules,
	missionDelta,
	payloadText,
	selectedEventId,
	stateRows,
	type TrafficAgent,
	type TrafficData,
	type TrafficEvent,
	visibleEvents,
} from "./view.ts";

const column = "display: flex; flex-direction: column; gap: 20px";
const headerStyle = "display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between";
const controls = "display: flex; gap: 8px; align-items: center";
const sendStyle =
	"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 13px; font-weight: 500";
const rulesGrid = "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px";
const ruleCard =
	"background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px";
const hubSection =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 24px 20px; display: flex; flex-direction: column; align-items: center";
const masterCard =
	"background: #181818; color: #fff; border-radius: 16px; padding: 12px 18px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 220px";
const hubGrid = "width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px";
const split = "display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start";
const logSection =
	"flex: 3 1 440px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 6px";
const chipRow = "display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 6px";
const listScroller = "overflow-x: auto";
const listColumn = "min-width: 520px; display: flex; flex-direction: column; gap: 2px";
const details = "flex: 2 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 16px";
const card =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 10px";
const stateCard =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 8px";
const writeChip =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: #924ff70f; color: #532d8d; font-family: 'JetBrains Mono', monospace; font-size: 11px; display: inline-flex; align-items: center";
const contents = "display: contents";

export function TrafficPage({ data }: { readonly data: TrafficData }) {
	const { selEvent, setSelEvent, busFilter, setBusFilter, live, setLive } = useWorkspace();
	const refresh = useRefresh();
	useTrafficSelection(data.events, selEvent, setSelEvent);
	const selectedId = selectedEventId(data.events, selEvent);
	const names = agentNames(data.agents);
	const selected = data.events.find((event) => event.id === selectedId);
	const rows = visibleEvents(data.events, busFilter);
	const rules = messagingRules(data.masterName);
	const filters = filterChips(data.agents);
	const delta = missionDelta(selected?.kind, selected?.skill);
	const inspected = selected ? decorate(selected, selectedId, data.masterName, names) : undefined;

	return (
		<div data-if="isFlow" style={css(contents)}>
			<div style={css(column)}>
				<header style={css(headerStyle)}>
					<div>
						<h1
							style={css(
								"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
							)}
						>
							Squad traffic
						</h1>
						<p style={css("margin: 4px 0 0; color: #5d5d5d")}>
							Every task, result and relay between {data.masterName} and the squads, with the payload, the state
							it changed and the mission target it moved.
						</p>
					</div>
					<div style={css(controls)}>
						<button
							type="button"
							data-handler="toggleLive"
							data-event="onClick"
							aria-pressed={live}
							onClick={() => setLive(!live)}
							style={css(liveStyle(live))}
						>
							{liveControl(live)}
						</button>
						<button
							type="button"
							className="soft-btn"
							data-handler="simulate"
							data-event="onClick"
							onClick={() => void sendNextEvent(refresh)}
							style={css(sendStyle)}
						>
							Send next event
						</button>
					</div>
				</header>
				<section aria-label="How messaging works" style={css(rulesGrid)}>
					<div data-loop="messagingRules" data-loop-as="m" style={css(contents)}>
						{rules.map((rule) => (
							<div key={rule.tag} style={css(ruleCard)}>
								<span style={css(rule.style)}>{rule.tag}</span>
								<span style={css("font-weight: 600; color: #0d0d0d; font-size: 14px")}>{rule.title}</span>
								<span style={css("font-size: 12px; line-height: 18px; color: #5d5d5d")}>{rule.body}</span>
							</div>
						))}
					</div>
				</section>
				<section aria-label="Squad map" style={css(hubSection)}>
					<div style={css(masterCard)}>
						<span style={css("font-weight: 600")}>{data.masterName} squad</span>
						<span style={css("font-size: 12px; color: #cdcdcd")}>
							Routes every message · holds shared state · scores missions · checks rules
						</span>
					</div>
					<div style={css("width: 1px; height: 20px; background: rgba(13,13,13,.2)")} />
					<div style={css("width: 80%; height: 1px; background: rgba(13,13,13,.2)")} />
					<div style={css(hubGrid)}>
						<div data-loop="hub" data-loop-as="h" style={css(contents)}>
							{data.agents.map((agent) => (
								<HubNode
									key={agent.id}
									agent={agent}
									events={data.events}
									selected={busFilter === agent.id}
									onPick={() => setBusFilter(busFilter === agent.id ? "all" : agent.id)}
								/>
							))}
						</div>
					</div>
				</section>
				<div style={css(split)}>
					<section aria-label="Message log" style={css(logSection)}>
						<div style={css(chipRow)}>
							<div data-loop="filters" data-loop-as="f" style={css(contents)}>
								{filters.map((filter) => (
									<button
										key={filter.id}
										type="button"
										data-handler="f.pick"
										data-event="onClick"
										aria-pressed={busFilter === filter.id}
										onClick={() => setBusFilter(filter.id)}
										style={css(filterStyle(busFilter === filter.id))}
									>
										{filter.label}
									</button>
								))}
							</div>
						</div>
						<div style={css(listScroller)}>
							<div style={css(listColumn)}>
								<div data-loop="busView" data-loop-as="e" style={css(contents)}>
									{rows.map((event) => {
										const view = decorate(event, selectedId, data.masterName, names);
										return (
											<button
												key={event.id}
												type="button"
												className="row-btn"
												data-handler="e.inspect"
												data-event="onClick"
												data-event-id={event.id}
												onClick={() => setSelEvent(event.id)}
												style={css(view.rowStyle)}
											>
												<span
													style={css(
														"font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #5d5d5d; width: 44px; flex: none",
													)}
												>
													{event.time}
												</span>
												<span style={css(view.kindStyle)}>{event.kind}</span>
												<span style={css("font-size: 12px; color: #414141; width: 150px; flex: none")}>
													{view.route}
												</span>
												<span style={css("flex: 1; font-size: 13px")}>{event.text}</span>
											</button>
										);
									})}
								</div>
							</div>
						</div>
					</section>
					<aside aria-label="Message details" style={css(details)}>
						<section style={css(card)}>
							<div style={css("display: flex; gap: 8px; align-items: center")}>
								<h2 style={css("margin: 0; font-size: 14px; font-weight: 600; color: #0d0d0d; flex: 1")}>
									Message
								</h2>
								{selected ? <span style={css(kindStyle(selected.kind))}>{selected.kind}</span> : null}
							</div>
							<div style={css("font-size: 13px; color: #0d0d0d")}>{selected?.text ?? ""}</div>
							<dl
								style={css(
									"margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 12px",
								)}
							>
								<dt style={css("color: #5d5d5d")}>Route</dt>
								<dd style={css("margin: 0")}>{inspected?.route ?? ""}</dd>
								<dt style={css("color: #5d5d5d")}>Skill</dt>
								<dd style={css("margin: 0; font-family: 'JetBrains Mono', monospace")}>
									{selected?.skill ?? ""}
								</dd>
								<dt style={css("color: #5d5d5d")}>Trace</dt>
								<dd style={css("margin: 0; font-family: 'JetBrains Mono', monospace")}>
									{selected?.trace ?? ""}
								</dd>
								<dt style={css("color: #5d5d5d")}>Time</dt>
								<dd style={css("margin: 0")}>{selected?.time ?? ""}</dd>
								<dt style={css("color: #5d5d5d")}>Mission delta</dt>
								<dd style={css(`margin: 0; color: ${delta.color}`)}>{delta.text}</dd>
							</dl>
							<div style={css("font-size: 12px; font-weight: 500; color: #5d5d5d")}>Payload</div>
							{payloadPre(payloadText(selected))}
							<div style={css("font-size: 12px; font-weight: 500; color: #5d5d5d")}>State it wrote</div>
							<div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
								<div data-loop="ins.writes" data-loop-as="w" style={css(contents)}>
									{(selected?.writes ?? []).map((write) => (
										<span key={write} style={css(writeChip)}>
											{write}
										</span>
									))}
								</div>
								{showNone(selected) ? (
									<div data-if="ins.noWrites" style={css(contents)}>
										<span style={css("font-size: 12px; color: #5d5d5d")}>None</span>
									</div>
								) : null}
							</div>
						</section>
						<section style={css(stateCard)}>
							<h2 style={css("margin: 0; font-size: 14px; font-weight: 600; color: #0d0d0d")}>
								Shared state held by {data.masterName}
							</h2>
							<p style={css("margin: 0; font-size: 12px; color: #5d5d5d")}>{stateCopy(data.masterName)}</p>
							<div data-loop="stateRows" data-loop-as="r" style={css(contents)}>
								{stateRows(data.store).map((row) => (
									<div
										key={row.key}
										style={css(
											"display: flex; gap: 10px; align-items: baseline; padding: 6px 0; border-top: 1px solid rgba(13,13,13,.06); font-family: 'JetBrains Mono', monospace; font-size: 12px",
										)}
									>
										<span style={css("color: #532d8d; flex: 1; min-width: 0; word-break: break-all")}>
											{row.key}
										</span>
										<span
											style={css(
												"color: #0d0d0d; text-align: right; max-width: 55%; word-break: break-word",
											)}
										>
											{row.value}
										</span>
									</div>
								))}
							</div>
						</section>
					</aside>
				</div>
			</div>
		</div>
	);
}

function HubNode({
	agent,
	events,
	selected,
	onPick,
}: {
	readonly agent: TrafficAgent;
	readonly events: readonly TrafficEvent[];
	readonly selected: boolean;
	readonly onPick: () => void;
}) {
	const counts = hubCounts(events, agent.id);
	const line = hubLine(selected);
	return (
		<div style={css("display: flex; flex-direction: column; align-items: center")}>
			<div style={css(`width: 1px; height: 20px; background: ${line}`)} />
			<button
				type="button"
				data-handler="h.pick"
				data-event="onClick"
				aria-pressed={selected}
				onClick={onPick}
				style={css(hubStyle(agent.on, selected))}
			>
				<span style={css("display: flex; gap: 8px; align-items: center")}>
					<span style={css(`width: 14px; height: 14px; border-radius: 4px; background: ${agent.tint}`)} />
					<strong style={css("color: #0d0d0d")}>{agent.name}</strong>
				</span>
				<span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #5d5d5d")}>
					{agent.host}
				</span>
				<span style={css("font-size: 12px; color: #5d5d5d")}>
					{counts.inCount} in · {counts.outCount} out
				</span>
			</button>
		</div>
	);
}

const payloadPreStyle =
	"margin: 0; background: #181818; color: #ededed; border-radius: 8px; padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 18px; white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow: auto";

// JSX would put a newline inside the pre. pre-wrap would show that newline.
function payloadPre(text: string) {
	return createElement("pre", { style: css(payloadPreStyle) }, text);
}

function liveLabel(live: boolean): string {
	return live ? "Live" : "Paused";
}

function liveControl(live: boolean) {
	return createElement(
		Fragment,
		null,
		createElement("span", {
			style: css(`width: 8px; height: 8px; border-radius: 999px; background: ${liveDot(live)}`),
		}),
		liveLabel(live),
	);
}

function stateCopy(masterName: string): string {
	return `Squads read this store, but never write it directly. Every write travels on the bus, so ${masterName} sees each change and passes a task only the keys it needs.`;
}

function showNone(selected: TrafficEvent | undefined): boolean {
	return !selected || selected.writes.length === 0;
}

function filterChips(agents: readonly TrafficAgent[]) {
	return [{ id: "all", label: "All agents" }, ...agents.map((agent) => ({ id: agent.id, label: agent.name }))];
}

function agentNames(agents: readonly TrafficAgent[]): Readonly<Record<string, string>> {
	const names: Record<string, string> = {};
	for (const agent of agents) names[agent.id] = agent.name;
	return names;
}

function useTrafficSelection(
	events: readonly { readonly id: string }[],
	selEvent: string,
	setSelEvent: (id: string) => void,
) {
	const seen = useRef<string | null>(null);
	useEffect(() => {
		const idKey = events.map((event) => event.id).join("\n");
		if (seen.current === null) {
			seen.current = idKey;
			const queued = consumeQueuedEvent();
			if (queued.length > 0 && events.some((event) => event.id === queued) && queued !== selEvent) {
				setSelEvent(queued);
			}
			return;
		}
		if (seen.current === idKey) return;
		const previous = new Set(seen.current.split("\n").filter((id) => id.length > 0));
		const added = events.filter((event) => !previous.has(event.id));
		seen.current = idKey;
		consumeQueuedEvent();
		const newest = added.at(-1);
		if (newest && newest.id !== selEvent) setSelEvent(newest.id);
	}, [events, selEvent, setSelEvent]);
}

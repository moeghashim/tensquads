import { pill } from "#/workspace/styles.ts";

export type Json = null | string | number | boolean | readonly Json[] | JsonObject;

export interface JsonObject {
	readonly [key: string]: Json;
}

export interface TrafficEvent {
	readonly id: string;
	readonly time: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: JsonObject;
	readonly writes: readonly string[];
	readonly trace: string;
}

export interface TrafficAgent {
	readonly id: string;
	readonly name: string;
	readonly host: string;
	readonly tint: string;
	readonly on: boolean;
}

export interface TrafficStoreRow {
	readonly key: string;
	readonly value: Json;
}

export interface TrafficData {
	readonly events: readonly TrafficEvent[];
	readonly store: readonly TrafficStoreRow[];
	readonly agents: readonly TrafficAgent[];
	readonly masterName: string;
}

export interface MessagingRule {
	readonly tag: string;
	readonly style: string;
	readonly title: string;
	readonly body: string;
}

const deltaBySkill: Record<string, string> = {
	"shopify.add_tracking": "Fulfilment time −0.3 days (Orders)",
	"printify.get_shipment": "No target moved; ETA recorded",
	"quickbooks.pnl": "Margin 31%, target 30% met (Finance)",
	"inbox.draft_reply": "First reply 4 min (Support)",
};

export function messagingRules(masterName: string): readonly MessagingRule[] {
	return [
		{
			tag: "Hub and spoke",
			style: pill("#0285ff14", "#004f99"),
			title: `Squads talk only to ${masterName}`,
			body: `A squad sends Task, Result, Request and Escalation events to ${masterName} only. ${masterName} decides, then emits Relay or Task events to the target squad. Squads never address each other.`,
		},
		{
			tag: "Mission delta",
			style: pill("#04b84c14", "#00692a"),
			title: "Every Result moves a target",
			body: `Each Result carries which mission target it moved and by how much. ${masterName} adds these up to score every squad. No separate reports.`,
		},
		{
			tag: "Shared state",
			style: pill("#924ff714", "#532d8d"),
			title: "Facts live in one store",
			body: `Squads read the shared state freely. Writes travel on the bus, so ${masterName} sees each change and the traffic log shows it.`,
		},
		{
			tag: "Review",
			style: pill("#fb6a2214", "#923b0f"),
			title: `${masterName} reviews daily and on every escalation`,
			body: "It re-scores each squad from the deltas and does one of three things: nothing, re-route work, or propose a mission change. Only a mission change comes to your inbox.",
		},
	];
}

export function missionDelta(kind: string | undefined, skill: string | undefined): { text: string; color: string } {
	if (!kind) return { text: "None", color: "#5d5d5d" };
	if (kind !== "Result") return { text: "None. Only Result events carry a delta.", color: "#5d5d5d" };
	const known = skill !== undefined && Object.hasOwn(deltaBySkill, skill);
	return { text: known ? deltaBySkill[skill] : "No target moved", color: known ? "#00692a" : "#5d5d5d" };
}

export function selectedEventId(events: readonly { readonly id: string }[], selEvent: string): string {
	if (selEvent === "") return events[1]?.id ?? events.at(-1)?.id ?? "";
	return events.find((event) => event.id === selEvent)?.id ?? events.at(-1)?.id ?? "";
}

export function visibleEvents<T extends { readonly from: string; readonly to: string }>(
	events: readonly T[],
	filter: string,
): T[] {
	return events.filter((event) => filter === "all" || event.from === filter || event.to === filter).reverse();
}

export function hubCounts(events: readonly { readonly from: string; readonly to: string }[], id: string) {
	return {
		inCount: events.filter((event) => event.to === id).length,
		outCount: events.filter((event) => event.from === id).length,
	};
}

export function payloadText(event: TrafficEvent | undefined): string {
	if (!event) return "";
	return JSON.stringify(
		{
			trace_id: event.trace,
			from: event.from,
			to: event.to,
			kind: event.kind.toLowerCase(),
			skill: event.skill,
			body: event.payload,
		},
		null,
		2,
	);
}

export function stateRows(store: readonly TrafficStoreRow[]): { key: string; value: string }[] {
	return store.map((entry) => ({ key: entry.key, value: String(entry.value) }));
}

export function liveStyle(live: boolean): string {
	const background = live ? "#04b84c14" : "rgba(13,13,13,.08)";
	const color = live ? "#00692a" : "#282828";
	return `height: 32px; padding: 0 14px; border: 0; border-radius: 999px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; background: ${background}; color: ${color}`;
}

export function liveDot(live: boolean): string {
	return live ? "#00a240" : "#8f8f8f";
}

export function filterStyle(on: boolean): string {
	const background = on ? "#181818" : "rgba(13,13,13,.06)";
	const color = on ? "#fff" : "#282828";
	return `height: 28px; padding: 0 12px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 500; background: ${background}; color: ${color}`;
}

export function hubLine(selected: boolean): string {
	return selected ? "#0169cc" : "rgba(13,13,13,.2)";
}

export function hubStyle(on: boolean, selected: boolean): string {
	const background = on ? "#fff" : "#f3f3f3";
	const shadow = selected ? "2px #0169cc" : "1px rgba(13,13,13,.1)";
	const opacity = on ? "1" : ".6";
	return `width: 100%; border: 0; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: ${background}; box-shadow: 0 0 0 ${shadow}; color: #282828; opacity: ${opacity}`;
}

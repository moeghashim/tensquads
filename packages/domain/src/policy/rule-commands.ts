import type { AccountScope } from "../scope.ts";
import type { RuleDraft } from "./repository.ts";

export type SetRuleOnCommand = (scope: AccountScope, id: string, on: boolean) => Promise<void>;

export type AddRuleCommand = (scope: AccountScope, draft: RuleDraft) => Promise<void>;

export type SetLimitCommand = (scope: AccountScope, key: string, value: number) => Promise<void>;

export interface LimitDefinition {
	readonly id: string;
	readonly key: string;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
}

// Main.dc.html:1313-1315. The screen and the traffic table read these keys.
export const limitDefinitions: readonly LimitDefinition[] = [
	{
		id: "lim-refund",
		key: "policy.refund_auto_limit",
		label: "Refund without asking, up to",
		min: 0,
		max: 200,
		step: 5,
	},
	{
		id: "lim-ads",
		key: "policy.daily_ad_cap",
		label: "Total ad spend per day",
		min: 0,
		max: 1000,
		step: 10,
	},
	{
		id: "lim-reorder",
		key: "policy.reorder_limit",
		label: "Reorder without asking, up to",
		min: 0,
		max: 2000,
		step: 50,
	},
];

export interface PreparedRule {
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
	readonly on: true;
}

// Main.dc.html:1453-1457. A blank action does nothing. The first letter becomes lower case.
export function preparedRule(draft: RuleDraft): PreparedRule | null {
	const action = draft.action.trim();
	if (action.length === 0) {
		return null;
	}
	return {
		when: draft.when.charAt(0).toLowerCase() + draft.when.slice(1),
		agent: draft.agent,
		action,
		approval: draft.approval,
		on: true,
	};
}

// The design sequence starts at 100. Seed rules stay r1 to r5, so the next id is at least r100.
const ruleIdFloor = 99;

export function nextRuleId(ids: readonly string[]): string {
	let highest = ruleIdFloor;
	for (const id of ids) {
		const match = /^r(\d+)$/.exec(id);
		const value = match?.[1] ? Number(match[1]) : 0;
		if (value > highest) {
			highest = value;
		}
	}
	return `r${highest + 1}`;
}

export function limitWrite(key: string, value: number): { readonly key: string; readonly value: number } | null {
	const definition = limitDefinitions.find((item) => item.key === key);
	if (!definition || !Number.isInteger(value)) {
		return null;
	}
	if (value < definition.min || value > definition.max) {
		return null;
	}
	if ((value - definition.min) % definition.step !== 0) {
		return null;
	}
	return { key, value };
}

export function limitDisplay(value: number): string {
	return `$${value}`;
}

import type { AccountScope, ConversationTransaction, SendResult } from "@tensquads/domain";
import { chatSource, chatTrigger, evalChatTrigger, requireScope } from "@tensquads/domain";
import type { Repositories } from "../ports.ts";
import type { BusCommands } from "./bus.ts";

export interface ConversationCommands {
	beginSend(scope: AccountScope, text: string): Promise<SendResult>;
	finishSend(scope: AccountScope, taskId: string): Promise<SendResult>;
}

export function conversation(
	context: { provide(name: string, service: ConversationCommands): unknown },
	config: { repositories: () => Repositories; bus: () => BusCommands },
): void {
	context.provide("workspaceConversation", {
		async beginSend(scope, text) {
			const checked = requireScope(scope);
			const value = text.trim();
			if (checked.mode !== "account" || value.length === 0) return { kind: "ignored" };
			const trigger = chatTrigger(checked.accountId, value);
			// Decision 19: the Decider has no adapter in version 1, so a chat Trigger has no judgement step.
			const evaluation = evalChatTrigger(trigger, checked.accountId);
			if (trigger.source.name !== chatSource.name || !evaluation.gate) return { kind: "ignored" };
			return config.repositories().conversation.transaction(checked, async (commands) => {
				if (await commands.pendingTask()) return { kind: "ignored" };
				return send(commands, value, route(value), config.bus());
			});
		},
		async finishSend(scope, taskId) {
			const checked = requireScope(scope);
			if (checked.mode !== "account") return { kind: "ignored" };
			return config.repositories().conversation.transaction(checked, async (commands) => {
				const pending = await commands.pendingTask();
				if (!pending || pending.id !== taskId) return { kind: "ignored" };
				const planned = resultFor(pending.toAgent);
				if (!planned) return { kind: "ignored" };
				await commands.message("agent", planned.text, pending.toAgent);
				await config.bus().append(commands, {
					from: pending.toAgent,
					to: "master",
					kind: "Result",
					skill: pending.skill,
					text: planned.text,
					payload: planned.payload,
					writes: planned.writes,
				});
				await commands.completeAgent(pending.toAgent, planned.text);
				return { kind: "replied", messages: await commands.messages() };
			});
		},
	});
}

async function send(
	commands: ConversationTransaction,
	value: string,
	agentId: string | null,
	bus: BusCommands,
): Promise<SendResult> {
	const agent = agentId ? await commands.agent(agentId) : null;
	await commands.message("user", value);
	if (!agent?.isOn) {
		await commands.message("master", agent ? pausedReply(agent.name) : noAgentReply());
		return { kind: "answered", messages: await commands.messages() };
	}
	const skill = skillFor(await commands.skills(agent.id));
	await commands.message("master", workingReply(agent.name));
	const written = await bus.append(commands, {
		from: "master",
		to: agent.id,
		kind: "Task",
		skill,
		text: value,
		payload: taskPayload(value, await commands.store()),
	});
	return {
		kind: "working",
		taskId: written.id,
		task: { id: written.id, time: written.time, from: "master", to: agent.id, kind: "Task", text: value },
		agentId: agent.id,
		agentName: agent.name,
		skill,
		text: value,
		messages: await commands.messages(),
	};
}

const routes: readonly (readonly [string, RegExp])[] = [
	["support", /refund|return|complain|customer|ticket|email/],
	["orders", /order|tracking|ship|deliver|printify/],
	["marketing", /\bads?\b|campaign|instagram|post|promo|discount|marketing/],
	["finance", /profit|revenue|cost|payout|money|margin|sales/],
	["inventory", /stock|inventory|reorder|supplier|hoodie/],
];

export function route(text: string): string | null {
	const lower = text.toLowerCase();
	const hit = routes.find(([, pattern]) => pattern.test(lower));
	return hit ? hit[0] : null;
}

export function skillFor(skills: readonly { readonly id: string; readonly on: boolean }[]): string {
	const selected = skills.find((skill) => skill.on) ?? skills[0];
	return selected?.id ?? "-";
}

export function noAgentReply(): string {
	return "That one I can answer myself, no agent needed. Ask me about orders, refunds, ads, profit or stock and I will hand it to the right agent.";
}

export function pausedReply(name: string): string {
	return `That is a job for the ${name} agent, but it is paused. Turn it on in Agents and ask me again.`;
}

export function workingReply(name: string): string {
	return `Passing this to the ${name} agent. I will report back here.`;
}

export interface PlannedResult {
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
}

const results: Readonly<Record<string, PlannedResult>> = {
	orders: {
		text: "3 orders were waiting on tracking. All three now have tracking in Shopify and the customers have their links.",
		payload: { synced: ["A-1015", "A-1016", "A-1019"] },
		writes: ["order.A-1019.tracking"],
	},
	support: {
		text: "2 refund requests are open. One was under the limit and is done; the other is in your approvals.",
		payload: { refunded: [{ order: "A-1014", amount: 18 }], escalated: ["A-1012"] },
		writes: [],
	},
	marketing: {
		text: "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.",
		payload: { spend_7d: 262, roas_7d: 3.4, best: "Prints · lookalike" },
		writes: ["marketing.roas_7d"],
	},
	finance: {
		text: "Last 7 days: $8,420 revenue and $2,610 profit, a 31% margin. Printify costs are up 4%.",
		payload: { revenue: 8420, profit: 2610, margin: 0.31 },
		writes: ["finance.profit_7d"],
	},
	inventory: {
		text: "2 products are under 10: Black hoodie M and A3 frame. A reorder draft is in your approvals.",
		payload: { low: ["HD-BLK-M", "FR-A3"] },
		writes: ["inventory.low_stock"],
	},
};

export function resultFor(agentId: string): PlannedResult | null {
	return results[agentId] ?? null;
}

export function taskPayload(text: string, store: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	return {
		intent: "user_request",
		user_text: text,
		from: "chat",
		limits: {
			refund_auto_limit: limitOrNull(store, "policy.refund_auto_limit"),
			daily_ad_cap: limitOrNull(store, "policy.daily_ad_cap"),
		},
	};
}

function limitOrNull(store: Readonly<Record<string, unknown>>, key: string): number | null {
	const value = store[key];
	return typeof value === "number" ? value : null;
}

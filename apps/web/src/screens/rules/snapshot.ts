import { useRef, useState } from "react";

import type { RulesLimitValue, RulesPageData, RulesRule } from "#/server/rules.ts";

import { bindRuleWrites, bounded } from "./write-queue.ts";

interface Refresh {
	readonly rules: Map<string, RulesRule>;
	readonly limits: Map<string, RulesLimitValue>;
	readonly finish: () => void;
	readonly done: Promise<void>;
}

export function useRulesSnapshot(page: RulesPageData, read: () => Promise<void>) {
	const [snapshot, setSnapshot] = useState(page);
	const [seenPage, setSeenPage] = useState(page);
	const waiting = useRef<Refresh | null>(null);
	if (page !== seenPage) {
		setSeenPage(page);
		const refresh = waiting.current;
		let incoming = page;
		if (refresh) {
			for (const rule of refresh.rules.values()) incoming = withRule(incoming, rule);
			for (const limit of refresh.limits.values()) incoming = withLimit(incoming, limit);
			waiting.current = null;
			refresh.finish();
		}
		setSnapshot(incoming);
	}
	bindRuleWrites({
		rule: (rule) => {
			waiting.current?.rules.set(rule.id, rule);
			setSnapshot((current) => withRule(current, rule));
		},
		limit: (row) => {
			waiting.current?.limits.set(row.key, row);
			setSnapshot((current) => withLimit(current, row));
		},
	});
	const refresh = (): Promise<void> => {
		if (waiting.current) return waiting.current.done;
		let finish = () => {};
		const arrived = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const next: Refresh = {
			rules: new Map(),
			limits: new Map(),
			finish,
			done: bounded(() => Promise.race([read(), arrived])).finally(() => {
				if (waiting.current === next) waiting.current = null;
			}),
		};
		waiting.current = next;
		return next.done;
	};
	return { snapshot, refresh };
}

function withRule(page: RulesPageData, rule: RulesRule): RulesPageData {
	const rules = [...page.rules.filter((item) => item.id !== rule.id), rule].sort(
		(left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
	);
	return { ...page, rules };
}

function withLimit(page: RulesPageData, row: RulesLimitValue): RulesPageData {
	return {
		...page,
		limits: page.limits.map((limit) => (limit.key === row.key ? { ...limit, value: row.value } : limit)),
	};
}

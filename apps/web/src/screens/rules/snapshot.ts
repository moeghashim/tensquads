import { useRef, useState } from "react";

import type { RulesLimit, RulesLimitValue, RulesPageData, RulesRule } from "#/server/rules.ts";

import { bindRuleWrites, bounded, markReadFailed, markReadSucceeded, readNeeded } from "./write-queue.ts";

let writeCounter = 0;

export function rulesWriteCounter(): number {
	return writeCounter;
}

export interface RulesSnapshotPage extends RulesPageData {
	readonly readCounter: number;
}

interface Refresh {
	readonly finish: () => void;
	done: Promise<void>;
}

// A read keeps the number it started with, so a later page cannot replace a newer write.
export function useRulesSnapshot(page: RulesSnapshotPage, read: () => Promise<void>) {
	const [snapshot, setSnapshot] = useState(page);
	const [seenPage, setSeenPage] = useState(page);
	const ruleStamps = useRef(new Map<string, number>());
	const limitStamps = useRef(new Map<string, number>());
	const waiting = useRef<Refresh | null>(null);
	const recovered = useRef(false);
	if (page !== seenPage) {
		setSeenPage(page);
		setSnapshot(mergePage(snapshot, page, page.readCounter, ruleStamps.current, limitStamps.current));
		waiting.current?.finish();
	}
	bindRuleWrites({
		rule: (rule) => {
			writeCounter += 1;
			ruleStamps.current.set(rule.id, writeCounter);
			setSnapshot((current) => withRule(current, rule));
		},
		limit: (row) => {
			writeCounter += 1;
			limitStamps.current.set(row.key, writeCounter);
			setSnapshot((current) => withLimit(current, row));
		},
	});
	const refresh = (): Promise<void> => {
		const current = waiting.current;
		if (current) return current.done;
		let finish = () => {};
		const arrived = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const next: Refresh = { finish, done: Promise.resolve() };
		waiting.current = next;
		const reading = read().then(
			() => "ok" as const,
			() => "fail" as const,
		);
		next.done = bounded(() => Promise.race([reading, arrived.then(() => "page" as const)]))
			.then(
				(result) => {
					if (result === "fail") markReadFailed();
					else markReadSucceeded();
				},
				() => {
					markReadFailed();
				},
			)
			.finally(() => {
				if (waiting.current === next) waiting.current = null;
			});
		return next.done;
	};
	if (!recovered.current) {
		recovered.current = true;
		if (readNeeded()) void refresh();
	}
	return { snapshot, refresh };
}

function mergePage(
	current: RulesSnapshotPage,
	page: RulesSnapshotPage,
	started: number,
	ruleStamps: ReadonlyMap<string, number>,
	limitStamps: ReadonlyMap<string, number>,
): RulesSnapshotPage {
	return {
		...page,
		rules: mergeRules(current.rules, page.rules, started, ruleStamps),
		limits: page.limits.map((limit) => keptLimit(current.limits, limit, started, limitStamps)),
	};
}

function mergeRules(
	current: readonly RulesRule[],
	pageRules: readonly RulesRule[],
	started: number,
	stamps: ReadonlyMap<string, number>,
): RulesRule[] {
	const kept = current.filter((rule) => (stamps.get(rule.id) ?? 0) > started);
	const keptIds = new Set(kept.map((rule) => rule.id));
	const merged = [...pageRules.filter((rule) => !keptIds.has(rule.id)), ...kept];
	return merged.sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));
}

function keptLimit(
	current: readonly RulesLimit[],
	limit: RulesLimit,
	started: number,
	stamps: ReadonlyMap<string, number>,
): RulesLimit {
	if ((stamps.get(limit.key) ?? 0) <= started) return limit;
	const saved = current.find((item) => item.key === limit.key);
	return saved ? { ...limit, value: saved.value } : limit;
}

function withRule(page: RulesSnapshotPage, rule: RulesRule): RulesSnapshotPage {
	const rules = [...page.rules.filter((item) => item.id !== rule.id), rule].sort(
		(left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
	);
	return { ...page, rules };
}

function withLimit(page: RulesSnapshotPage, row: RulesLimitValue): RulesSnapshotPage {
	return {
		...page,
		limits: page.limits.map((limit) => (limit.key === row.key ? { ...limit, value: row.value } : limit)),
	};
}

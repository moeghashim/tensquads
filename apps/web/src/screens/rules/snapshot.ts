import { useRef } from "react";

import type { RulesPageData } from "#/server/rules.ts";

import { bounded, readNeeded, rulesRecoveryGeneration, rulesWrittenSince } from "./write-queue.ts";

export interface RulesSnapshotPage extends RulesPageData {
	readonly readCounter: number;
}

interface Refresh {
	readonly generation: number;
	done: Promise<void>;
}

// A read keeps the number it started with, so a later page cannot replace a newer write.
export function useRulesSnapshot(page: RulesSnapshotPage, read: () => Promise<void>) {
	const snapshot = mergePage(page);
	const waiting = useRef<Refresh | null>(null);
	const recovered = useRef(false);
	const refresh = (): Promise<void> => {
		const generation = rulesRecoveryGeneration();
		const current = waiting.current;
		if (current?.generation === generation) return current.done;
		const next: Refresh = { generation, done: Promise.resolve() };
		waiting.current = next;
		next.done = bounded(() => read())
			.catch(() => undefined)
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

function mergePage(page: RulesSnapshotPage): RulesSnapshotPage {
	const written = rulesWrittenSince(page.readCounter);
	const ruleIds = new Set(written.rules.map((rule) => rule.id));
	const rules = [...page.rules.filter((rule) => !ruleIds.has(rule.id)), ...written.rules].sort(
		(left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
	);
	const limits = new Map(written.limits.map((row) => [row.key, row.value]));
	return {
		...page,
		rules,
		limits: page.limits.map((limit) => ({ ...limit, value: limits.get(limit.key) ?? limit.value })),
	};
}

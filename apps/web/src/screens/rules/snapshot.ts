import { useRef, useState } from "react";

import type { RulesPageData } from "#/server/rules.ts";

import { bounded, markReadFailed, markReadSucceeded, readNeeded, rulesWrittenSince } from "./write-queue.ts";

export interface RulesSnapshotPage extends RulesPageData {
	readonly readCounter: number;
}

interface Refresh {
	readonly finish: () => void;
	done: Promise<void>;
}

// A read keeps the number it started with, so a later page cannot replace a newer write.
export function useRulesSnapshot(page: RulesSnapshotPage, read: () => Promise<void>) {
	const snapshot = mergePage(page);
	const [seenPage, setSeenPage] = useState(page);
	const waiting = useRef<Refresh | null>(null);
	const recovered = useRef(false);
	if (page !== seenPage) {
		setSeenPage(page);
		waiting.current?.finish();
	}
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

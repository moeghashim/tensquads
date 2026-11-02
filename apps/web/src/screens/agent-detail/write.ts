import { useNavigate } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { Autonomy } from "@tensquads/domain";
import { useRef } from "react";
import { askAgentRevise, setAgentAutonomy, setAgentRunning, setSkillEnabled } from "#/server/agent-detail.ts";
import { useRefresh } from "#/workspace/context.ts";

function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, PENDING_TASK_WINDOW_MS);
	});
	const work = Promise.resolve().then(() => run(controller.signal));
	void work.then(
		() => undefined,
		() => undefined,
	);
	return Promise.race([work, timeout]).finally(() => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	});
}

export function useAgentWrites(agentId: string) {
	const refresh = useRefresh();
	const navigate = useNavigate();
	const busy = useRef(false);

	async function run(work: (signal: AbortSignal) => Promise<void>, next?: () => Promise<void>) {
		if (busy.current) {
			return;
		}
		busy.current = true;
		try {
			await bounded(work);
			await refresh();
			if (next) {
				await next();
			}
		} catch {
			await refresh().catch(() => undefined);
		} finally {
			busy.current = false;
		}
	}

	return {
		toggleAgent(on: boolean) {
			void run((signal) => setAgentRunning({ data: { agentId, on }, signal }));
		},
		toggleSkill(skillId: string, on: boolean) {
			void run((signal) => setSkillEnabled({ data: { agentId, skillId, on }, signal }));
		},
		pickAutonomy(autonomy: Autonomy) {
			void run((signal) => setAgentAutonomy({ data: { agentId, autonomy }, signal }));
		},
		askRevise() {
			void run(
				(signal) => askAgentRevise({ data: agentId, signal }),
				async () => {
					await navigate({ to: "/overview" });
				},
			);
		},
	};
}

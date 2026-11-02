import { useNavigate } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { Autonomy } from "@tensquads/domain";
import { useRef, useState } from "react";
import { askAgentRevise, setAgentAutonomy, setAgentRunning, setSkillEnabled } from "#/server/agent-detail.ts";
import { useRefresh } from "#/workspace/context.ts";
import { switchParts } from "#/workspace/styles.ts";
import { type AgentDetailView, autonomyStyle } from "./model.ts";

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

interface Write {
	readonly key: string;
	readonly work: (signal: AbortSignal) => Promise<void>;
	readonly apply: (view: AgentDetailView) => AgentDetailView;
}

export function useAgentWrites(serverView: AgentDetailView) {
	const agentId = serverView.id;
	const refresh = useRefresh();
	const navigate = useNavigate();
	const queue = useRef<Write[]>([]);
	const busy = useRef(false);
	const [pending, setPending] = useState<readonly Write[]>([]);

	async function run(work: Write["work"]) {
		await bounded(work).catch(() => undefined);
		await refresh().catch(() => undefined);
	}

	async function drain() {
		if (busy.current) return;
		busy.current = true;
		try {
			let write = queue.current.shift();
			while (write) {
				const current = write;
				await run(current.work);
				setPending((values) => values.filter((value) => value !== current));
				write = queue.current.shift();
			}
		} finally {
			busy.current = false;
		}
	}

	function enqueue(write: Write) {
		setPending((values) => [...values.filter((value) => value.key !== write.key), write]);
		const index = queue.current.findIndex((value) => value.key === write.key);
		if (index === -1) queue.current.push(write);
		else queue.current[index] = write;
		void drain();
	}

	return {
		view: pending.reduce((view, write) => write.apply(view), serverView),
		toggleAgent(on: boolean) {
			enqueue({
				key: "running",
				work: (signal) => setAgentRunning({ data: { agentId, on }, signal }),
				apply: (view) => ({ ...view, on, ...switchParts(on) }),
			});
		},
		toggleSkill(skillId: string, on: boolean) {
			enqueue({
				key: `skill:${skillId}`,
				work: (signal) => setSkillEnabled({ data: { agentId, skillId, on }, signal }),
				apply: (view) => ({
					...view,
					skills: view.skills.map((skill) => (skill.id === skillId ? { ...skill, ...switchParts(on) } : skill)),
				}),
			});
		},
		pickAutonomy(autonomy: Autonomy) {
			enqueue({
				key: "autonomy",
				work: (signal) => setAgentAutonomy({ data: { agentId, autonomy }, signal }),
				apply: (view) => ({
					...view,
					autonomyOpts: view.autonomyOpts.map((option) => ({
						...option,
						onStr: option.label === autonomy ? "true" : "false",
						style: autonomyStyle(option.label === autonomy),
					})),
				}),
			});
		},
		askRevise() {
			void run((signal) => askAgentRevise({ data: agentId, signal }));
			void navigate({ to: "/overview" });
		},
	};
}

import { useNavigate } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { Autonomy } from "@tensquads/domain";
import { useSyncExternalStore } from "react";
import { askAgentRevise, setAgentAutonomy, setAgentRunning, setSkillEnabled } from "#/server/agent-detail.ts";
import { agentStatus } from "#/workspace/agent-view.ts";
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

function createQueue(refresh: () => Promise<void>) {
	const queue: Write[] = [];
	let busy = false;
	let pending: readonly Write[] = [];
	const listeners = new Set<() => void>();

	function publish(values: readonly Write[]) {
		pending = values;
		for (const listener of listeners) listener();
	}

	function clear(write: Write) {
		publish(pending.filter((value) => value !== write));
	}

	function stillPending(write: Write) {
		return pending.includes(write);
	}

	async function read() {
		await bounded(() => refresh()).catch(() => undefined);
	}

	async function confirm(write: Write) {
		if (!stillPending(write)) {
			return;
		}
		try {
			await bounded(() => refresh());
		} catch {
			await pause(PENDING_TASK_WINDOW_MS);
			void confirm(write);
			return;
		}
		clear(write);
	}

	async function drain() {
		if (busy) return;
		busy = true;
		try {
			let write = queue.shift();
			while (write) {
				try {
					await bounded(write.work);
				} catch {
					clear(write);
					void read();
					write = queue.shift();
					continue;
				}
				const sent = write;
				void confirm(sent);
				write = queue.shift();
			}
		} finally {
			busy = false;
		}
	}

	return {
		snapshot: () => pending,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enqueue(write: Write) {
			publish([...pending.filter((value) => value.key !== write.key), write]);
			const index = queue.findIndex((value) => value.key === write.key);
			if (index === -1) queue.push(write);
			else queue[index] = write;
			void drain();
		},
	};
}

function pause(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

function runningFace(view: AgentDetailView, on: boolean): AgentDetailView {
	const status = agentStatus(on);
	const storedUptime = view.storedUptime;
	return {
		...view,
		on,
		...switchParts(on),
		statusLabel: status.statusLabel,
		statusStyle: status.statusStyle,
		vmState: on ? "Isolated · running" : "Isolated · stopped",
		cpu: on ? view.storedCpu : "0%",
		uptime: on ? (storedUptime === "Paused" ? "Just started" : storedUptime) : "Paused",
	};
}

const queues = new WeakMap<() => Promise<void>, Map<string, ReturnType<typeof createQueue>>>();
const noPending: readonly Write[] = [];
const serverSnapshot = () => noPending;

function agentQueue(refresh: () => Promise<void>, agentId: string) {
	let agents = queues.get(refresh);
	if (!agents) {
		agents = new Map();
		queues.set(refresh, agents);
	}
	let queue = agents.get(agentId);
	if (!queue) {
		queue = createQueue(refresh);
		agents.set(agentId, queue);
	}
	return queue;
}

export function useAgentWrites(serverView: AgentDetailView) {
	const agentId = serverView.id;
	const refresh = useRefresh();
	const navigate = useNavigate();
	const { enqueue, snapshot, subscribe } = agentQueue(refresh, agentId);
	const pending = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

	return {
		view: pending.reduce((view, write) => write.apply(view), serverView),
		toggleAgent(on: boolean) {
			enqueue({
				key: "running",
				work: (signal) => setAgentRunning({ data: { agentId, on }, signal }),
				apply: (view) => runningFace(view, on),
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
			enqueue({
				key: "revise",
				work: (signal) => askAgentRevise({ data: agentId, signal }),
				apply: (view) => view,
			});
			void navigate({ to: "/overview" });
		},
	};
}

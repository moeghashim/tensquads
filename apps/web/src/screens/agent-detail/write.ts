import { useMatch, useNavigate, useRouter } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { Autonomy } from "@tensquads/domain";
import { useSyncExternalStore } from "react";
import {
	askAgentRevise,
	loadAgentDetail,
	setAgentAutonomy,
	setAgentRunning,
	setSkillEnabled,
} from "#/server/agent-detail.ts";
import { agentStatus } from "#/workspace/agent-view.ts";
import { switchParts } from "#/workspace/styles.ts";
import { type AgentDetailView, autonomyStyle, blank } from "./model.ts";

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
	readonly work: (signal: AbortSignal) => Promise<AgentDetailView>;
	readonly apply: (view: AgentDetailView) => AgentDetailView;
}

interface Snapshot {
	readonly view: AgentDetailView;
	readonly pending: readonly Write[];
}

function createQueue(agentId: string, initialView: AgentDetailView) {
	const queue: Write[] = [];
	let busy = false;
	let reading = false;
	let state: Snapshot = { view: initialView, pending: [] };
	let loaderView = initialView;
	const listeners = new Set<() => void>();

	function publish(next: Snapshot) {
		state = next;
		for (const listener of listeners) listener();
	}

	async function read() {
		if (reading) return;
		reading = true;
		const previous = state.view;
		try {
			const view = await bounded((signal) => loadAgentDetail({ data: agentId, signal }));
			if (state.view === previous) publish({ ...state, view });
		} catch {
			return;
		} finally {
			reading = false;
		}
	}

	async function drain() {
		if (busy) return;
		busy = true;
		try {
			let write = queue.shift();
			while (write) {
				try {
					const view = await bounded(write.work);
					publish({ view, pending: state.pending.filter((value) => value !== write) });
				} catch {
					publish({ ...state, pending: state.pending.filter((value) => value !== write) });
					void read();
				}
				write = queue.shift();
			}
		} finally {
			busy = false;
		}
	}

	return {
		snapshot: () => state,
		load(view: AgentDetailView) {
			if (view !== loaderView) {
				loaderView = view;
				publish({ ...state, view });
			}
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enqueue(write: Write) {
			const index = queue.findIndex((value) => value.key === write.key);
			if (index === -1) {
				queue.push(write);
				publish({ ...state, pending: [...state.pending, write] });
			} else {
				const replaced = queue[index];
				queue[index] = write;
				publish({ ...state, pending: state.pending.map((value) => (value === replaced ? write : value)) });
			}
			void drain();
		},
	};
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
		cpu: on ? blank(view.storedCpu) : "0%",
		uptime: on ? (storedUptime === "Paused" ? "Just started" : blank(storedUptime)) : "Paused",
	};
}

const queues = new WeakMap<object, Map<string, ReturnType<typeof createQueue>>>();

function agentQueue(owner: object, agentId: string, initialView: AgentDetailView) {
	let agents = queues.get(owner);
	if (!agents) {
		agents = new Map();
		queues.set(owner, agents);
	}
	let queue = agents.get(agentId);
	if (!queue) {
		queue = createQueue(agentId, initialView);
		agents.set(agentId, queue);
	}
	return queue;
}

export function useAgentWrites(serverView: AgentDetailView) {
	const agentId = serverView.id;
	const router = useRouter();
	const navigate = useNavigate();
	const match = useMatch({ from: "/_workspace/agents/$id" });
	const { enqueue, snapshot, subscribe, load } = agentQueue(router, agentId, serverView);
	if (match.status === "success") load(serverView);
	const state = useSyncExternalStore(subscribe, snapshot, snapshot);

	return {
		view: state.pending.reduce((view, write) => write.apply(view), state.view),
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

import { useMatch, useNavigate, useRouter } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { Autonomy } from "@tensquads/domain";
import { useEffect, useSyncExternalStore } from "react";
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
	readonly work: (signal: AbortSignal) => Promise<void>;
	readonly apply: (view: AgentDetailView) => AgentDetailView;
	readonly matches: (view: AgentDetailView) => boolean;
}

interface Snapshot {
	readonly base: AgentDetailView | null;
	readonly loaderUpdatedAt: number;
	readonly pending: readonly Write[];
}

const emptySnapshot: Snapshot = { base: null, loaderUpdatedAt: 0, pending: [] };

function createQueue(agentId: string, currentLoad: () => number) {
	const queue: Write[] = [];
	let busy = false;
	let state = emptySnapshot;
	let readNumber = 0;
	let storedRead = 0;
	const listeners = new Set<() => void>();

	function publish(next: Snapshot) {
		state = next;
		for (const listener of listeners) listener();
	}

	function clear(write: Write) {
		publish({ ...state, pending: state.pending.filter((value) => value !== write) });
	}

	function stillPending(write: Write) {
		return state.pending.includes(write);
	}

	async function load() {
		const number = ++readNumber;
		const view = await bounded((signal) => loadAgentDetail({ data: agentId, signal }));
		return { number, view };
	}

	function store(result: { readonly number: number; readonly view: AgentDetailView }) {
		if (result.number > storedRead) {
			storedRead = result.number;
			publish({ ...state, base: result.view, loaderUpdatedAt: Math.max(state.loaderUpdatedAt, currentLoad()) });
		}
	}

	async function read() {
		try {
			store(await load());
		} catch {
			await pause(PENDING_TASK_WINDOW_MS);
			void read();
		}
	}

	async function confirm(write: Write) {
		if (!stillPending(write)) {
			return;
		}
		try {
			const result = await load();
			if (!stillPending(write)) return;
			if (!write.matches(result.view)) {
				await pause(PENDING_TASK_WINDOW_MS);
				void confirm(write);
				return;
			}
			store(result);
			if (!state.base || !write.matches(state.base)) {
				await pause(PENDING_TASK_WINDOW_MS);
				void confirm(write);
				return;
			}
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
		snapshot: () => state,
		reconcile(view: AgentDetailView, updatedAt: number) {
			if (updatedAt > state.loaderUpdatedAt) {
				storedRead = ++readNumber;
				publish({ ...state, base: view, loaderUpdatedAt: updatedAt });
			}
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enqueue(write: Write) {
			publish({ ...state, pending: [...state.pending.filter((value) => value.key !== write.key), write] });
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
		cpu: on ? blank(view.storedCpu) : "0%",
		uptime: on ? (storedUptime === "Paused" ? "Just started" : blank(storedUptime)) : "Paused",
	};
}

const queues = new WeakMap<object, Map<string, ReturnType<typeof createQueue>>>();
const serverSnapshot = () => emptySnapshot;

function agentQueue(owner: object, agentId: string, currentLoad: () => number) {
	let agents = queues.get(owner);
	if (!agents) {
		agents = new Map();
		queues.set(owner, agents);
	}
	let queue = agents.get(agentId);
	if (!queue) {
		queue = createQueue(agentId, currentLoad);
		agents.set(agentId, queue);
	}
	return queue;
}

export function useAgentWrites(serverView: AgentDetailView) {
	const agentId = serverView.id;
	const router = useRouter();
	const navigate = useNavigate();
	const match = useMatch({ from: "/_workspace/agents/$id" });
	const { enqueue, snapshot, subscribe, reconcile } = agentQueue(router, agentId, () => {
		const current = router.state.matches.find(
			(value) => value.routeId === "/_workspace/agents/$id" && "id" in value.params && value.params.id === agentId,
		);
		return current?.status === "success" ? current.updatedAt : 0;
	});
	const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
	useEffect(() => {
		if (match.status === "success") reconcile(serverView, match.updatedAt);
	}, [match.status, match.updatedAt, reconcile, serverView]);
	const base =
		match.status === "success" && match.updatedAt > state.loaderUpdatedAt ? serverView : (state.base ?? serverView);

	return {
		view: state.pending.reduce((view, write) => write.apply(view), base),
		toggleAgent(on: boolean) {
			enqueue({
				key: "running",
				work: (signal) => setAgentRunning({ data: { agentId, on }, signal }),
				apply: (view) => runningFace(view, on),
				matches: (view) => view.on === on,
			});
		},
		toggleSkill(skillId: string, on: boolean) {
			enqueue({
				key: `skill:${skillId}`,
				matches: (view) => view.skills.some((skill) => skill.id === skillId && skill.onStr === String(on)),
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
				matches: (view) => view.autonomyOpts.some((option) => option.label === autonomy && option.onStr === "true"),
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
				matches: () => true,
			});
			void navigate({ to: "/overview" });
		},
	};
}

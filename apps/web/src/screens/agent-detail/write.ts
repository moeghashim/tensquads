import { useMatch, useNavigate, useRouter } from "@tanstack/react-router";
import type { Autonomy } from "@tensquads/domain";
import { useSyncExternalStore } from "react";
import { onAgentAccountReset } from "#/screens/agent-detail/account-reset.ts";
import {
	askAgentRevise,
	loadAgentDetail,
	setAgentAutonomy,
	setAgentRunning,
	setSkillEnabled,
} from "#/server/agent-detail.ts";
import {
	agentSession,
	clearPublishedAgentOn,
	noteAgentWrite,
	onAgentClientReset,
	publishAgentOn,
	stampAgentRead,
	subscribeAgentSession,
} from "#/workspace/agent-on.ts";
import { agentStatus } from "#/workspace/agent-view.ts";
import { bounded } from "#/workspace/bounded.ts";
import { frameAccountId, onFrameAccountReset } from "#/workspace/frame-load.ts";
import { switchParts } from "#/workspace/styles.ts";
import { settleWrite } from "#/workspace/write-result.ts";
import { confirmRetired, nextWriteFence } from "#/write-fence.ts";
import { type AgentDetailView, autonomyStyle, blank } from "./model.ts";

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
	let again = false;
	let needsRead = false;
	let bound = agentSession();
	let state: Snapshot = { view: initialView, pending: [] };
	let loaderView = initialView;
	const listeners = new Set<() => void>();

	function current(): boolean {
		return bound === agentSession();
	}

	function sameFrame(view: AgentDetailView): boolean {
		return view.accountId === undefined || view.accountId === frameAccountId();
	}

	function publish(next: Snapshot) {
		state = next;
		for (const listener of listeners) listener();
	}

	function accept(view: AgentDetailView, pending: readonly Write[]) {
		publish({ view, pending });
		publishAgentOn(view.id, view.on);
	}

	async function read() {
		if (!current()) return;
		if (reading) {
			again = true;
			return;
		}
		reading = true;
		needsRead = false;
		const startedSession = agentSession();
		try {
			const started = stampAgentRead(agentId);
			const previous = state.view;
			try {
				const view = await bounded((signal) => loadAgentDetail({ data: agentId, signal }));
				// A read keeps the version from when it started. It ends recovery only
				// when that start is still after the latest write or read failure.
				if (startedSession !== agentSession() || !current() || !sameFrame(view)) return;
				if (started === stampAgentRead(agentId) && state.view === previous) {
					needsRead = false;
					accept(view, state.pending);
				}
			} catch {
				// A failed read records the same point a failed write does, then stops.
				if (startedSession === agentSession() && current()) {
					noteAgentWrite(agentId);
					needsRead = true;
				}
			}
		} finally {
			reading = false;
			if (startedSession === agentSession() && current() && again) {
				again = false;
				void read();
			}
		}
	}

	function sessionMatches(startedSession: number): boolean {
		return startedSession === agentSession() && current();
	}

	function pendingWithout(write: Write): readonly Write[] {
		const pending: Write[] = [];
		for (const value of state.pending) {
			if (value !== write) pending.push(value);
		}
		return pending;
	}

	function recordAccepted(write: Write, view: AgentDetailView): void {
		noteAgentWrite(agentId);
		accept(view, pendingWithout(write));
	}

	function recordFailed(write: Write): void {
		noteAgentWrite(agentId);
		publish({ ...state, pending: pendingWithout(write) });
		void read();
	}

	async function keptResponse(write: Write, startedSession: number): Promise<boolean> {
		const view = await bounded(write.work);
		if (!sessionMatches(startedSession)) return false;
		if (!sameFrame(view)) return false;
		recordAccepted(write, view);
		return true;
	}

	function failedResponse(write: Write, startedSession: number): boolean {
		if (!sessionMatches(startedSession)) return false;
		recordFailed(write);
		return true;
	}

	async function finishWrite(write: Write): Promise<boolean> {
		const startedSession = agentSession();
		const settled = await settleWrite(() => keptResponse(write, startedSession));
		if (!settled.ok) {
			if (settled.left) return false;
			return failedResponse(write, startedSession);
		}
		return settled.value;
	}

	async function drainQueued(): Promise<void> {
		let write = queue.shift();
		while (write) {
			if (!(await finishWrite(write))) return;
			write = queue.shift();
		}
	}

	async function drain() {
		if (busy || !current()) return;
		busy = true;
		try {
			await drainQueued();
		} finally {
			busy = false;
		}
	}

	return {
		session: () => bound,
		abandon() {
			queue.length = 0;
			reading = false;
			again = false;
			needsRead = false;
			bound = -1;
			if (state.pending.length > 0) publish({ view: state.view, pending: [] });
		},
		snapshot: () => state,
		failRead(): AgentDetailView | null {
			if (!current()) return null;
			noteAgentWrite(agentId);
			needsRead = true;
			return state.view;
		},
		load(view: AgentDetailView, readAt: number) {
			if (!current()) return;
			// A read stamped at the current counter started after the latest failure.
			if (readAt !== stampAgentRead(agentId) || view === loaderView) return;
			loaderView = view;
			needsRead = false;
			accept(view, state.pending);
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enqueue(write: Write) {
			if (!current()) return;
			noteAgentWrite(agentId);
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
			if (needsRead) void read();
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

let queues = new WeakMap<object, Map<string, ReturnType<typeof createQueue>>>();
const liveQueues = new Set<ReturnType<typeof createQueue>>();
const openReads = new Map<string, ReturnType<typeof createQueue>>();

function abandonAgentQueues(): void {
	const open = [...liveQueues];
	liveQueues.clear();
	openReads.clear();
	queues = new WeakMap();
	for (const queue of open) queue.abandon();
	clearPublishedAgentOn();
}

onAgentClientReset(abandonAgentQueues);
onFrameAccountReset(abandonAgentQueues);
onAgentAccountReset(abandonAgentQueues);

export function keepFailedAgentRead(agentId: string, session: number): AgentDetailView | null {
	if (typeof window === "undefined") return null;
	const queue = openReads.get(agentId);
	if (!queue || queue.session() !== session) return null;
	return queue.failRead();
}

function agentQueue(owner: object, agentId: string, initialView: AgentDetailView, session: number) {
	if (typeof window === "undefined") return createQueue(agentId, initialView);
	let agents = queues.get(owner);
	if (!agents) {
		agents = new Map();
		queues.set(owner, agents);
	}
	let queue = agents.get(agentId);
	if (!queue || queue.session() !== session) {
		queue = createQueue(agentId, initialView);
		agents.set(agentId, queue);
		liveQueues.add(queue);
	}
	openReads.set(agentId, queue);
	return queue;
}

const absentSnapshot = () => undefined;
const absentSubscribe = () => () => undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isWrite(value: unknown): value is { status: "written" | "superseded"; row: unknown } {
	return isRecord(value) && (value.status === "written" || value.status === "superseded");
}

function commanded<T extends object>(accountId: string | undefined, data: T): T & { accountId?: string } {
	if (accountId === undefined) return data;
	return { accountId, ...data };
}

function isDetail(value: unknown): value is AgentDetailView {
	return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.on === "boolean";
}

function acceptedDetail(body: unknown, agentId: string): AgentDetailView | null {
	if (!isWrite(body) || !isDetail(body.row) || body.row.id !== agentId) return null;
	return body.row;
}

async function sendControl(
	agentId: string,
	send: (fence: { tab: string; seq: number; retires: readonly string[] }) => Promise<unknown>,
): Promise<AgentDetailView> {
	const fence = nextWriteFence();
	const body = await send(fence);
	const row = acceptedDetail(body, agentId);
	// A validation error is a 200 with an error payload. The server wrote nothing.
	if (row) confirmRetired(fence.retires);
	if (!row) throw new Error("The agent write was not accepted.");
	return row;
}

export function useAgentWrites(serverView: AgentDetailView, readAt: number, loaderSession: number, kept = false) {
	const agentId = serverView.id;
	const session = useSyncExternalStore(subscribeAgentSession, agentSession, agentSession);
	const router = useRouter();
	const navigate = useNavigate();
	const match = useMatch({ from: "/_workspace/agents/$id" });
	const queue = loaderSession === session ? agentQueue(router, agentId, serverView, session) : undefined;
	if (match.status === "success" && !kept) queue?.load(serverView, readAt);
	const snapshot = queue?.snapshot ?? absentSnapshot;
	const state = useSyncExternalStore(queue?.subscribe ?? absentSubscribe, snapshot, snapshot);
	if (!queue || !state) return null;
	const { enqueue } = queue;

	return {
		view: state.pending.reduce((view, write) => write.apply(view), state.view),
		toggleAgent(on: boolean) {
			const accountId = state.view.accountId;
			enqueue({
				key: "running",
				work: (signal) =>
					sendControl(agentId, (fence) =>
						setAgentRunning({
							data: commanded(accountId, {
								agentId,
								on,
								tab: fence.tab,
								seq: fence.seq,
								retires: fence.retires,
							}),
							signal,
						}),
					),
				apply: (view) => runningFace(view, on),
			});
		},
		toggleSkill(skillId: string, on: boolean) {
			const accountId = state.view.accountId;
			enqueue({
				key: `skill:${skillId}`,
				work: (signal) =>
					sendControl(agentId, (fence) =>
						setSkillEnabled({
							data: commanded(accountId, {
								agentId,
								skillId,
								on,
								tab: fence.tab,
								seq: fence.seq,
								retires: fence.retires,
							}),
							signal,
						}),
					),
				apply: (view) => ({
					...view,
					skills: view.skills.map((skill) => (skill.id === skillId ? { ...skill, ...switchParts(on) } : skill)),
				}),
			});
		},
		pickAutonomy(autonomy: Autonomy) {
			const accountId = state.view.accountId;
			enqueue({
				key: "autonomy",
				work: (signal) =>
					sendControl(agentId, (fence) =>
						setAgentAutonomy({
							data: commanded(accountId, {
								agentId,
								autonomy,
								tab: fence.tab,
								seq: fence.seq,
								retires: fence.retires,
							}),
							signal,
						}),
					),
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
			const accountId = state.view.accountId;
			enqueue({
				key: "revise",
				work: (signal) =>
					askAgentRevise({
						data: accountId === undefined ? agentId : { agentId, accountId },
						signal,
					}),
				apply: (view) => view,
			});
			void navigate({ to: "/overview" });
		},
	};
}

import { useAuth } from "@clerk/tanstack-react-start";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	// The frame and a signed-in account change the approval counter after commit.
	// biome-ignore lint/style/noRestrictedImports: rendering must not change that module state
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import { resetDecisions, watchServerCount } from "#/screens/overview/actions.ts";
import { refreshTraffic } from "#/screens/traffic/refresh.ts";
import { beginWorkspaceSend, finishWorkspaceSend } from "#/server/workspace.ts";

import { agentOnSnapshot, applyAgentOn, subscribeAgentOn } from "./agent-on.ts";
import { missionBits } from "./agent-view.ts";
import {
	currentWrites,
	noteDecisionCount,
	noteOverviewCount,
	overviewMatchStamp,
	overviewReadFromStamp,
	sameCount,
	seedApprovalCount,
} from "./approval-count.ts";
import { bounded } from "./bounded.ts";
import { type StartedTask, useRefresh, useWorkspace, WorkspaceContext } from "./context.ts";
import { decorate, useInspect } from "./event-view.ts";
import { rememberFrame } from "./frame-load.ts";
import { runLiveTick } from "./live.ts";
import { gateStyle, kindStyle, navStyle, pill, switchParts } from "./styles.ts";
import type { RuleForm, WorkspaceFrameData } from "./types.ts";
import { settleWrite } from "./write-result.ts";

const replyWaitMs = 1400;

export function WorkspaceProvider({
	frame,
	readAt,
	children,
}: {
	readonly frame: WorkspaceFrameData & { readonly writeAt: number };
	readonly readAt: Readonly<Record<string, number>>;
	readonly children: ReactNode;
}) {
	const router = useRouter();
	const [draft, setDraft] = useState("");
	const [dockOpen, setDockOpen] = useState(false);
	const [thinking, setThinking] = useState(false);
	const [thinkingAgent, setThinkingAgent] = useState("");
	const [pending, setPending] = useState(false);
	const {
		selEvent,
		setSelEvent,
		busFilter,
		setBusFilter,
		live,
		setLive,
		ruleForm,
		setRuleForm,
		startedTask,
		setStartedTask,
	} = useWorkspaceControls(frame);
	const sending = useRef(false);
	const { messages, setMessages, applyFrame, approvalCount, noteDecision, shownFrame } = useFrameAndCount(
		frame,
		readAt,
		sending,
	);

	const mounted = useRef(true);
	const refresh = useCallback(() => router.invalidate({ sync: true }), [router]);
	const refreshFrame = useFrameRefresh(router, refresh);
	useMountedFlag(mounted);

	const submit = useSubmit(draft, thinking, {
		accountId: frame.accountId,
		mounted,
		setDraft,
		setMessages,
		setThinking,
		setThinkingAgent,
		setStartedTask,
		setPending,
		refreshFrame,
		sending,
		applyFrame,
	});

	const value = useMemo(
		() => ({
			frame: shownFrame,
			draft,
			setDraft,
			dockOpen,
			toggleDock: () => setDockOpen((open) => !open),
			thinking,
			thinkingAgent,
			startedTask,
			pending,
			messages,
			approvalCount,
			noteDecision,
			submit,
			selEvent,
			setSelEvent,
			busFilter,
			setBusFilter,
			live,
			setLive,
			ruleForm,
			setRuleForm,
			refresh,
			inspect: (id: string) => setSelEvent(id),
			helpers: { pill, kindStyle, gateStyle, navStyle, switchParts, missionBits, decorate },
		}),
		[
			approvalCount,
			busFilter,
			dockOpen,
			draft,
			live,
			shownFrame,
			messages,
			noteDecision,
			pending,
			refresh,
			ruleForm,
			selEvent,
			setBusFilter,
			setLive,
			setRuleForm,
			setSelEvent,
			startedTask,
			submit,
			thinking,
			thinkingAgent,
		],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			<InspectBridge>{children}</InspectBridge>
		</WorkspaceContext.Provider>
	);
}

function taskAcknowledged(state: ReturnType<typeof useRouter>["state"], startedTask: StartedTask | null) {
	return state.matches.some(
		(match) =>
			match.routeId === "/_workspace/chat" &&
			match.status === "success" &&
			match.loaderData?.events.some((event) => event.id === startedTask?.id),
	);
}

function useWorkspaceControls(frame: WorkspaceFrameData) {
	const [startedTask, setStartedTask] = useState<StartedTask | null>(null);
	const acknowledged = useRouterState({
		select: (state) => taskAcknowledged(state, startedTask),
	});
	if (startedTask !== null && acknowledged) setStartedTask(null);
	const [selEvent, setSelEvent] = useState("");
	const [busFilter, setBusFilter] = useState("all");
	const [live, setLive] = useState(false);
	const [ruleForm, setRuleForm] = useState<RuleForm>({
		when: "A new order arrives",
		agent: frame.agents[0]?.id ?? "orders",
		action: "",
		approval: "Ask first",
	});
	return {
		selEvent,
		setSelEvent,
		busFilter,
		setBusFilter,
		live,
		setLive,
		ruleForm,
		setRuleForm,
		startedTask,
		setStartedTask,
	};
}

function useSubmit(draft: string, thinking: boolean, hooks: SendHooks) {
	const { sending, setPending, setDraft } = hooks;
	return useCallback(
		(text?: string) => {
			if (sendBlocked(sending.current, thinking)) return;
			const value = draftValue(text, draft);
			if (value.length === 0) return;
			sending.current = true;
			setPending(true);
			setDraft("");
			void sendDraft(value, hooks);
		},
		[draft, hooks, sending, setDraft, setPending, thinking],
	);
}

function useFrameRefresh(router: ReturnType<typeof useRouter>, refresh: () => Promise<void>) {
	return useCallback(async (): Promise<WorkspaceFrameData> => {
		await bounded(() => refresh());
		const match = router.state.matches.find((item) => item.routeId === "/_workspace");
		if (match?.status !== "success" || !match.loaderData) throw new Error("The workspace frame did not load.");
		return match.loaderData.frame;
	}, [refresh, router]);
}

function sendBlocked(sending: boolean, thinking: boolean): boolean {
	return sending || thinking;
}

function draftValue(text: string | undefined, draft: string): string {
	return (text ?? draft).trim();
}

function useFrameAndCount(
	frame: WorkspaceFrameData & { readonly writeAt: number },
	readAt: Readonly<Record<string, number>>,
	sending: { current: boolean },
) {
	useEffect(() => {
		rememberFrame(frame);
	}, [frame]);
	const shownFrame = useShownAgents(frame, readAt);
	const messages = useFrameMessages(frame, sending);
	const count = useApprovalCount(frame);
	useAccountBoundary();
	return { ...messages, ...count, shownFrame };
}

function useShownAgents(frame: WorkspaceFrameData, readAt: Readonly<Record<string, number>>): WorkspaceFrameData {
	const published = useSyncExternalStore(subscribeAgentOn, agentOnSnapshot, agentOnSnapshot);
	const agents = applyAgentOn(frame.agents, published, readAt);
	return agents === frame.agents ? frame : { ...frame, agents };
}

function useFrameMessages(frame: WorkspaceFrameData, sending: { current: boolean }) {
	const [messages, setMessages] = useState(frame.messages);
	const applyFrame = useCallback((loaded: WorkspaceFrameData) => {
		setMessages(loaded.messages);
	}, []);
	// A loader that arrives during a send must not replace the bubbles from that send.
	const [seenFrame, setSeenFrame] = useState(frame);
	if (frame !== seenFrame) {
		setSeenFrame(frame);
		if (!sending.current) {
			setMessages(frame.messages);
		}
	}

	return { messages, setMessages, applyFrame };
}

function useApprovalCount(frame: WorkspaceFrameData & { readonly writeAt: number }) {
	const overviewStamp = useRouterState({ select: (state) => overviewStampOf(state, frame.accountId) });
	const [clock, setClock] = useState(() => seedApprovalCount(frame.approvalCount));
	const noteDecision = useCallback((count: number) => {
		const writeAt = currentWrites();
		setClock((current) => noteDecisionCount(current, count, writeAt));
	}, []);
	useEffect(() => {
		const live = currentWrites();
		// This effect runs after the overview page effect. A frame from the same
		// counter can be an older server snapshot, so the page count stays.
		const overview = overviewReadFromStamp(overviewStamp, live);
		if (live === frame.writeAt) {
			watchServerCount(frame.approvalCount, frame, frame.writeAt);
		}
		setClock((current) => {
			const next = noteOverviewCount(current, frame.approvalCount, frame.writeAt, live, overview);
			return sameCount(current, next) ? current : next;
		});
	}, [frame, overviewStamp]);
	return { approvalCount: clock.value, noteDecision };
}

function overviewStampOf(
	state: { matches: readonly { routeId: string; loaderData?: unknown }[] },
	accountId: string,
): string | null {
	const match = state.matches.find((item) => item.routeId === "/_workspace/overview");
	return overviewMatchStamp(match?.loaderData, accountId);
}

// The first signed-in id is the account that rendered this document. A later
// id, including sign-out, drops the previous account's queue before the next paint.
function useAccountBoundary() {
	const { userId, isLoaded } = useAuth();
	const router = useRouter();
	const seen = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		const next = userId ?? null;
		if (seen.current === undefined) {
			seen.current = next;
			return;
		}
		if (seen.current === next) {
			return;
		}
		seen.current = next;
		resetDecisions();
		void router.invalidate({ sync: true });
	}, [isLoaded, router, userId]);
}

function InspectBridge({ children }: { readonly children: ReactNode }) {
	const current = useWorkspace();
	const inspect = useInspect();
	const value = { ...current, inspect };
	return (
		<WorkspaceContext.Provider value={value}>
			<LiveTimer />
			{children}
		</WorkspaceContext.Provider>
	);
}

function LiveTimer() {
	const { frame, live, setSelEvent } = useWorkspace();
	const refresh = useRefresh();
	useLiveClock(frame.accountId, live, refreshTraffic(refresh, setSelEvent));
	return null;
}

function idleSnapshot(): null {
	return null;
}

function useMountedFlag(mounted: { current: boolean }) {
	const subscribe = useCallback(
		(_onStoreChange: () => void) => {
			mounted.current = true;
			return () => {
				mounted.current = false;
			};
		},
		[mounted],
	);
	useSyncExternalStore(subscribe, idleSnapshot, idleSnapshot);
}

function useLiveClock(accountId: string, live: boolean, refresh: () => Promise<void>) {
	const tick = useRef({ accountId, live, refresh });
	tick.current = { accountId, live, refresh };
	// The clock must not notify React. A render here would move the screenshot.
	const subscribe = useCallback((_onStoreChange: () => void) => {
		const timer = setInterval(() => {
			void runLiveTick(tick.current);
		}, 3500);
		return () => {
			clearInterval(timer);
		};
	}, []);
	useSyncExternalStore(subscribe, idleSnapshot, idleSnapshot);
}

interface SendHooks {
	readonly accountId: string;
	readonly mounted: { current: boolean };
	readonly setDraft: Dispatch<SetStateAction<string>>;
	readonly setMessages: (messages: WorkspaceFrameData["messages"]) => void;
	readonly setThinking: (value: boolean) => void;
	readonly setThinkingAgent: (value: string) => void;
	readonly setStartedTask: (task: StartedTask | null) => void;
	readonly setPending: (value: boolean) => void;
	readonly refreshFrame: () => Promise<WorkspaceFrameData>;
	readonly sending: { current: boolean };
	readonly applyFrame: (frame: WorkspaceFrameData) => void;
}

type SendOutcome = "left" | "refresh" | "settle";

async function sendDraft(value: string, hooks: SendHooks) {
	let refreshed: WorkspaceFrameData | undefined;
	let outcome: SendOutcome = "settle";
	try {
		outcome = await performSend(value, hooks);
	} catch {
		// Finish settled with an error after begin. The draft stays cleared.
	}
	try {
		// A refresh-needed begin already invalidated the router on the shared path.
		if (outcome === "settle" && hooks.mounted.current) refreshed = await hooks.refreshFrame();
	} catch {
		// Refresh settled with an error. The guard still clears.
	} finally {
		hooks.sending.current = false;
	}
	if (!hooks.mounted.current) return;
	if (outcome === "left") {
		hooks.setPending(false);
		hooks.setThinking(false);
		hooks.setThinkingAgent("");
		return;
	}
	completeSend(hooks, refreshed);
}

function sendFailure(settled: { readonly left: boolean; readonly refreshNeeded: boolean }): SendOutcome {
	if (settled.left) return "left";
	if (settled.refreshNeeded) return "refresh";
	return "settle";
}

async function performSend(value: string, hooks: SendHooks): Promise<SendOutcome> {
	const started = await settleWrite(() =>
		bounded((signal) => beginWorkspaceSend({ data: { accountId: hooks.accountId, text: value }, signal })),
	);
	if (!started.ok) {
		if (started.refreshNeeded && hooks.mounted.current) restoreDraft(value, hooks);
		return sendFailure(started);
	}
	if (!hooks.mounted.current) return "settle";
	const body = started.value;
	if (body.kind === "ignored") {
		restoreDraft(value, hooks);
		return "settle";
	}
	showStartedMessages(body, hooks);
	if (body.kind !== "working") return "settle";
	return finishWorkingSend(body, hooks);
}

function restoreDraft(value: string, hooks: SendHooks): void {
	hooks.setDraft((draft) => (draft.length === 0 ? value : draft));
}

function showStartedMessages(started: Awaited<ReturnType<typeof beginWorkspaceSend>>, hooks: SendHooks) {
	if (started.kind === "answered" || started.kind === "working") {
		hooks.setMessages(started.messages);
	}
}

async function finishWorkingSend(
	started: Extract<Awaited<ReturnType<typeof beginWorkspaceSend>>, { kind: "working" }>,
	hooks: SendHooks,
): Promise<SendOutcome> {
	hooks.setThinking(true);
	hooks.setThinkingAgent(started.agentName);
	hooks.setStartedTask(started.task);
	await delay(replyWaitMs);
	if (!hooks.mounted.current) return "settle";
	const finished = await settleWrite(() =>
		bounded((signal) => finishWorkspaceSend({ data: { accountId: hooks.accountId, text: started.taskId }, signal })),
	);
	if (!finished.ok) return sendFailure(finished);
	if (hooks.mounted.current && finished.value.kind === "replied") {
		hooks.setMessages(finished.value.messages);
	}
	return "settle";
}

function completeSend(hooks: SendHooks, refreshed: WorkspaceFrameData | undefined) {
	if (!hooks.mounted.current) return;
	if (refreshed) hooks.applyFrame(refreshed);
	hooks.setPending(false);
	hooks.setThinking(false);
	hooks.setThinkingAgent("");
}

function delay(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

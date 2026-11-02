import { useRouter } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import { type ReactNode, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { beginWorkspaceSend, finishWorkspaceSend } from "#/server/workspace.ts";

import { missionBits } from "./agent-view.ts";
import { useRefresh, useWorkspace, WorkspaceContext } from "./context.ts";
import { decorate, useInspect } from "./event-view.ts";
import { runLiveTick } from "./live.ts";
import { gateStyle, kindStyle, navStyle, pill, switchParts } from "./styles.ts";
import type { RuleForm, WorkspaceFrameData } from "./types.ts";

const replyWaitMs = 1400;

export function WorkspaceProvider({
	frame,
	children,
}: {
	readonly frame: WorkspaceFrameData;
	readonly children: ReactNode;
}) {
	const router = useRouter();
	const [draft, setDraft] = useState("");
	const [dockOpen, setDockOpen] = useState(false);
	const [thinking, setThinking] = useState(false);
	const [thinkingAgent, setThinkingAgent] = useState("");
	const [pending, setPending] = useState(false);
	const { selEvent, setSelEvent, busFilter, setBusFilter, live, setLive, ruleForm, setRuleForm } =
		useWorkspaceControls(frame);
	const sending = useRef(false);
	const { messages, setMessages, approvalCount, applyFrame } = useFrameMessages(frame, sending);

	const mounted = useRef(true);
	const refresh = useCallback(() => router.invalidate({ sync: true }), [router]);
	const refreshFrame = useFrameRefresh(router, refresh);
	useMountedFlag(mounted);

	const submit = useSubmit(draft, thinking, setDraft, {
		mounted,
		setMessages,
		setThinking,
		setThinkingAgent,
		setPending,
		refreshFrame,
		sending,
		applyFrame,
	});

	const value = useMemo(
		() => ({
			frame,
			draft,
			setDraft,
			dockOpen,
			toggleDock: () => setDockOpen((open) => !open),
			thinking,
			thinkingAgent,
			pending,
			messages,
			approvalCount,
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
			frame,
			live,
			messages,
			pending,
			refresh,
			ruleForm,
			selEvent,
			setBusFilter,
			setLive,
			setRuleForm,
			setSelEvent,
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

function useWorkspaceControls(frame: WorkspaceFrameData) {
	const [selEvent, setSelEvent] = useState("");
	const [busFilter, setBusFilter] = useState("all");
	const [live, setLive] = useState(false);
	const [ruleForm, setRuleForm] = useState<RuleForm>({
		when: "A new order arrives",
		agent: frame.agents[0]?.id ?? "orders",
		action: "",
		approval: "Ask first",
	});
	return { selEvent, setSelEvent, busFilter, setBusFilter, live, setLive, ruleForm, setRuleForm };
}

function useSubmit(draft: string, thinking: boolean, setDraft: (value: string) => void, hooks: SendHooks) {
	const { sending, setPending } = hooks;
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
		await refresh();
		const match = router.state.matches.find((item) => item.routeId === "/_workspace");
		if (!match || match.status !== "success" || !match.loaderData)
			throw new Error("The workspace frame did not load.");
		return match.loaderData;
	}, [refresh, router]);
}

function sendBlocked(sending: boolean, thinking: boolean): boolean {
	return sending || thinking;
}

function draftValue(text: string | undefined, draft: string): string {
	return (text ?? draft).trim();
}

function useFrameMessages(frame: WorkspaceFrameData, sending: { current: boolean }) {
	const [messages, setMessages] = useState(frame.messages);
	const [approvalCount, setApprovalCount] = useState(frame.approvalCount);
	const applyFrame = useCallback((loaded: WorkspaceFrameData) => {
		setMessages(loaded.messages);
		setApprovalCount(loaded.approvalCount);
	}, []);
	// A loader that arrives during a send must not replace the bubbles from that send.
	const [seenFrame, setSeenFrame] = useState(frame);
	if (frame !== seenFrame) {
		setSeenFrame(frame);
		if (!sending.current) {
			setMessages(frame.messages);
			setApprovalCount(frame.approvalCount);
		}
	}

	return { messages, setMessages, approvalCount, applyFrame };
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
	const live = useWorkspace().live;
	const refresh = useRefresh();
	useLiveClock(live, refresh);
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

function useLiveClock(live: boolean, refresh: () => Promise<void>) {
	const tick = useRef({ live, refresh });
	tick.current = { live, refresh };
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
	readonly mounted: { current: boolean };
	readonly setMessages: (messages: WorkspaceFrameData["messages"]) => void;
	readonly setThinking: (value: boolean) => void;
	readonly setThinkingAgent: (value: string) => void;
	readonly setPending: (value: boolean) => void;
	readonly refreshFrame: () => Promise<WorkspaceFrameData>;
	readonly sending: { current: boolean };
	readonly applyFrame: (frame: WorkspaceFrameData) => void;
}

async function sendDraft(value: string, hooks: SendHooks) {
	try {
		await performSend(value, hooks);
	} catch {
		// Refresh below loads the thread the server kept. No local bubble remains.
	} finally {
		await refreshAfterSend(hooks);
	}
}

async function performSend(value: string, hooks: SendHooks) {
	const started = await beginWorkspaceSend({ data: value });
	if (!hooks.mounted.current) {
		return;
	}
	showStartedMessages(started, hooks);
	if (started.kind !== "working") {
		return;
	}
	await finishWorkingSend(started, hooks);
}

function showStartedMessages(started: Awaited<ReturnType<typeof beginWorkspaceSend>>, hooks: SendHooks) {
	if (started.kind === "answered" || started.kind === "working") {
		hooks.setMessages(started.messages);
	}
}

async function finishWorkingSend(
	started: Extract<Awaited<ReturnType<typeof beginWorkspaceSend>>, { kind: "working" }>,
	hooks: SendHooks,
) {
	hooks.setThinking(true);
	hooks.setThinkingAgent(started.agentName);
	await delay(replyWaitMs);
	if (!hooks.mounted.current) {
		return;
	}
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, PENDING_TASK_WINDOW_MS);
	try {
		const finished = await finishWorkspaceSend({ data: started.taskId, signal: controller.signal });
		if (hooks.mounted.current && finished.kind === "replied") {
			hooks.setMessages(finished.messages);
		}
	} finally {
		clearTimeout(timer);
	}
}

async function refreshAfterSend(hooks: SendHooks) {
	let refreshed: WorkspaceFrameData | undefined;
	try {
		if (hooks.mounted.current) refreshed = await hooks.refreshFrame();
	} catch {
	} finally {
		hooks.sending.current = false;
		completeSend(hooks, refreshed);
	}
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

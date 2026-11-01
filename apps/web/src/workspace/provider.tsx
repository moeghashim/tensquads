import { useRouter } from "@tanstack/react-router";
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
	const [selEvent, setSelEvent] = useState("");
	const [busFilter, setBusFilter] = useState("all");
	const [live, setLive] = useState(false);
	const [messages, setMessages] = useState(frame.messages);
	const [approvalCount, setApprovalCount] = useState(frame.approvalCount);
	const [ruleForm, setRuleForm] = useState<RuleForm>({
		when: "A new order arrives",
		agent: frame.agents[0]?.id ?? "orders",
		action: "",
		approval: "Ask first",
	});
	const sending = useRef(false);
	const mounted = useRef(true);
	const refresh = useCallback(() => router.invalidate(), [router]);
	useMountedFlag(mounted);
	// A loader that arrives during a send must not replace the bubbles from that send.
	const [seenFrame, setSeenFrame] = useState<WorkspaceFrameData | null>(frame);
	if (frame !== seenFrame) {
		setSeenFrame(frame);
		if (!sending.current) {
			setMessages(frame.messages);
			setApprovalCount(frame.approvalCount);
		}
	}

	const submit = useCallback(
		(text?: string) => {
			if (sending.current || thinking) {
				return;
			}
			const value = (text ?? draft).trim();
			if (value.length === 0) {
				return;
			}
			sending.current = true;
			setPending(true);
			setDraft("");
			void sendDraft(value, {
				mounted,
				setMessages,
				setThinking,
				setThinkingAgent,
				setPending,
				refresh,
				sending,
				resetFrame: () => setSeenFrame(null),
			});
		},
		[draft, refresh, thinking],
	);

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
	readonly refresh: () => Promise<void>;
	readonly sending: { current: boolean };
	readonly resetFrame: () => void;
}

async function sendDraft(value: string, hooks: SendHooks) {
	try {
		const started = await beginWorkspaceSend({ data: value });
		if (!hooks.mounted.current) {
			return;
		}
		if (started.kind === "answered" || started.kind === "working") {
			hooks.setMessages(started.messages);
		}
		if (started.kind !== "working") {
			return;
		}
		hooks.setThinking(true);
		hooks.setThinkingAgent(started.agentName);
		await delay(replyWaitMs);
		if (!hooks.mounted.current) {
			return;
		}
		const finished = await finishWorkspaceSend({ data: started.taskId });
		if (hooks.mounted.current && finished.kind === "replied") {
			hooks.setMessages(finished.messages);
		}
	} catch {
		// Refresh below loads the thread the server kept. No local bubble remains.
	} finally {
		try {
			if (hooks.mounted.current) await hooks.refresh();
		} catch {
		} finally {
			hooks.sending.current = false;
			if (hooks.mounted.current) {
				hooks.resetFrame();
				hooks.setPending(false);
				hooks.setThinking(false);
				hooks.setThinkingAgent("");
			}
		}
	}
}

function delay(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

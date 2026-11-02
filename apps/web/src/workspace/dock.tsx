import { useNavigate, useRouterState } from "@tanstack/react-router";

import { css } from "#/screens/css.ts";

import { masterInitial } from "./agent-view.ts";
import { useWorkspace } from "./context.ts";
import { CloseIcon, SendIcon } from "./icons.tsx";
import type { FrameMessage } from "./types.ts";

const suggestions = [
	"Any refunds waiting?",
	"How did ads do this week?",
	"What is my profit?",
	"Is anything low on stock?",
];

export function Dock() {
	const workspace = useWorkspace();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const navigate = useNavigate();
	if (pathname.startsWith("/chat")) {
		return null;
	}
	return <VisibleDock workspace={workspace} navigate={navigate} />;
}

function VisibleDock({
	workspace,
	navigate,
}: {
	readonly workspace: ReturnType<typeof useWorkspace>;
	readonly navigate: ReturnType<typeof useNavigate>;
}) {
	const {
		frame,
		dockOpen,
		thinking,
		thinkingAgent,
		pending,
		messages,
		approvalCount,
		draft,
		setDraft,
		submit,
		toggleDock,
	} = workspace;
	const mark = masterInitial(frame.masterName);
	const online = frame.agents.filter((agent) => agent.on).length;
	const unread = dockUnread(dockOpen, approvalCount);
	const label = dockOpen ? "Hide chat" : `Ask ${frame.masterName}`;
	return (
		<div data-if="showDock" style={css("display: contents")}>
			<div
				style={css(
					"position: fixed; right: 20px; bottom: 20px; z-index: 5; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; max-width: calc(100vw - 40px)",
				)}
			>
				{dockOpen ? (
					<div data-if="dockOpen" style={css("display: contents")}>
						<DockPanel
							masterName={frame.masterName}
							mark={mark}
							online={online}
							messages={messages.slice(-6)}
							agents={frame.agents}
							thinking={thinking}
							thinkingAgent={thinkingAgent}
							draft={draft}
							pending={pending}
							onDraft={setDraft}
							onSubmit={submit}
							onClose={toggleDock}
							onOpenChat={() => void navigate({ to: "/chat" })}
						/>
					</div>
				) : null}
				<button
					type="button"
					data-handler="toggleDock"
					data-event="onClick"
					aria-expanded={dockOpen}
					onClick={toggleDock}
					style={css(
						"height: 48px; padding: 0 18px 0 6px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 8px 24px rgba(13,13,13,.24)",
					)}
				>
					<span
						style={css(
							"width: 36px; height: 36px; border-radius: 999px; background: #fff; color: #0d0d0d; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px",
						)}
					>
						{mark}
					</span>
					<span>{label}</span>
					{unread ? (
						<span
							data-if="dockUnread"
							style={css(
								"min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #fb6a22; color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center",
							)}
						>
							{approvalCount}
						</span>
					) : null}
				</button>
			</div>
		</div>
	);
}

function dockUnread(open: boolean, approvalCount: number): boolean {
	return !open && approvalCount > 0;
}

function DockPanel({
	masterName,
	mark,
	online,
	messages,
	agents,
	thinking,
	thinkingAgent,
	draft,
	pending,
	onDraft,
	onSubmit,
	onClose,
	onOpenChat,
}: {
	readonly masterName: string;
	readonly mark: string;
	readonly online: number;
	readonly messages: readonly FrameMessage[];
	readonly agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[];
	readonly thinking: boolean;
	readonly thinkingAgent: string;
	readonly draft: string;
	readonly pending: boolean;
	readonly onDraft: (value: string) => void;
	readonly onSubmit: (text?: string) => void;
	readonly onClose: () => void;
	readonly onOpenChat: () => void;
}) {
	return (
		<section
			aria-label="Chat with the master"
			style={css(
				"width: 380px; max-width: 100%; max-height: min(560px, calc(100vh - 100px)); background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.1), 0 16px 48px rgba(13,13,13,.16); display: flex; flex-direction: column; overflow: hidden",
			)}
		>
			<div
				style={css(
					"display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; border-bottom: 1px solid rgba(13,13,13,.06)",
				)}
			>
				<span
					style={css(
						"width: 28px; height: 28px; border-radius: 999px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px",
					)}
				>
					{mark}
				</span>
				<div style={css("display: flex; flex-direction: column; flex: 1; min-width: 0")}>
					<span style={css("font-weight: 600; color: #0d0d0d; font-size: 14px")}>{masterName}</span>
					<span
						style={css("font-size: 12px; color: #00692a; display: inline-flex; align-items: center; gap: 5px")}
					>
						<span style={css("width: 6px; height: 6px; border-radius: 999px; background: #00a240")} />
						{online} squads online
					</span>
				</div>
				<button
					type="button"
					className="row-btn"
					data-handler="goChat"
					data-event="onClick"
					onClick={onOpenChat}
					style={css(
						"height: 30px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: #0169cc; font-size: 12px; font-weight: 500",
					)}
				>
					Open full chat
				</button>
				<button
					type="button"
					className="soft-btn"
					data-handler="toggleDock"
					data-event="onClick"
					aria-label="Close chat"
					onClick={onClose}
					style={css(
						"width: 30px; height: 30px; border: 0; border-radius: 999px; background: rgba(13,13,13,.06); color: #282828; display: inline-flex; align-items: center; justify-content: center",
					)}
				>
					<CloseIcon />
				</button>
			</div>
			<div
				className="dock-log"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: The message list scrolls, so the keyboard must reach it.
				tabIndex={0}
				style={css(
					"flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px",
				)}
			>
				<div data-loop="dockChat" data-loop-as="m" style={css("display: contents")}>
					{messages.map((message, index) => (
						<DockBubble
							key={message.id}
							message={message}
							masterName={masterName}
							agents={agents}
							markTag={firstTag(messages, index)}
						/>
					))}
				</div>
				{thinking ? (
					<div
						data-if="thinking"
						style={css(
							"align-self: flex-start; padding: 8px 12px; border-radius: 14px; background: #ededed; color: #5d5d5d; font-size: 12px",
						)}
					>
						{thinkingAgent} agent is working on it…
					</div>
				) : null}
			</div>
			<div
				style={css(
					"padding: 10px 12px 12px; border-top: 1px solid rgba(13,13,13,.06); display: flex; flex-direction: column; gap: 8px",
				)}
			>
				<div
					style={css("display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px")}
					data-loop="dockSuggestions"
					data-loop-as="s"
				>
					{suggestions.slice(0, 3).map((text) => (
						<button
							key={text}
							type="button"
							className="soft-btn"
							data-handler="s.pick"
							data-event="onClick"
							onClick={() => onSubmit(text)}
							style={css(
								"height: 26px; padding: 0 10px; border: 0; border-radius: 999px; background: rgba(13,13,13,.06); color: #282828; font-size: 12px; white-space: nowrap; flex: none",
							)}
						>
							{text}
						</button>
					))}
				</div>
				<div
					style={css(
						"display: flex; gap: 6px; align-items: center; background: #f3f3f3; border-radius: 999px; padding: 4px 4px 4px 14px",
					)}
				>
					<label
						htmlFor="dock-input"
						style={css("position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)")}
					>
						Message {masterName}
					</label>
					<input
						id="dock-input"
						data-handler="onDraft"
						data-event="onChange"
						value={draft}
						onChange={(event) => onDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								onSubmit();
							}
						}}
						placeholder={`Ask ${masterName} anything`}
						style={css(
							"flex: 1; min-width: 0; border: 0; outline-offset: 4px; background: transparent; font: inherit; font-size: 14px; color: #0d0d0d; height: 30px",
						)}
					/>
					<button
						type="button"
						data-handler="send"
						data-event="onClick"
						aria-label="Send"
						disabled={pending}
						onClick={() => onSubmit()}
						style={css(
							"width: 32px; height: 32px; border: 0; border-radius: 999px; background: #181818; color: #fff; display: flex; align-items: center; justify-content: center; flex: none",
						)}
					>
						<SendIcon />
					</button>
				</div>
			</div>
		</section>
	);
}

function firstTag(messages: readonly FrameMessage[], index: number): boolean {
	const message = messages[index];
	if (!message || message.from === "user") {
		return false;
	}
	return messages.slice(0, index).every((item) => item.from === "user");
}

function DockBubble({
	message,
	masterName,
	agents,
	markTag,
}: {
	readonly message: FrameMessage;
	readonly masterName: string;
	readonly agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[];
	readonly markTag: boolean;
}) {
	const user = message.from === "user";
	const align = user ? "flex-end" : "flex-start";
	const { tint, tag } = bubbleTag(message, masterName, agents);
	return (
		<div style={css(`display: flex; flex-direction: column; align-items: ${align}; gap: 4px`)}>
			{user ? null : (
				<div style={css("display: contents")} {...(markTag ? { "data-if": "m.hasTag" } : {})}>
					<span
						style={css("font-size: 11px; color: #5d5d5d; display: inline-flex; align-items: center; gap: 6px")}
					>
						<span style={css(`width: 8px; height: 8px; border-radius: 2px; background: ${tint}`)} />
						{tag}
					</span>
				</div>
			)}
			<div style={css(dockBubble(message.from))}>{message.text}</div>
		</div>
	);
}

function bubbleAgent(
	message: FrameMessage,
	agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[],
) {
	return message.from === "agent" ? agents.find((item) => item.id === message.agent) : undefined;
}

function bubbleTag(
	message: FrameMessage,
	masterName: string,
	agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[],
) {
	const agent = bubbleAgent(message, agents);
	const tint = agent?.tint ?? "#181818";
	const tag = agent ? `${agent.name} squad, via ${masterName}` : masterName;
	return { tint, tag };
}

function dockBubble(from: FrameMessage["from"]): string {
	const base = "max-width: 86%; padding: 8px 12px; border-radius: 16px; font-size: 13px; line-height: 19px; ";
	if (from === "user") {
		return `${base}background: #181818; color: #fff`;
	}
	if (from === "agent") {
		return `${base}background: #fff; color: #0d0d0d; box-shadow: 0 0 0 1px rgba(13,13,13,.1)`;
	}
	return `${base}background: #ededed; color: #0d0d0d`;
}

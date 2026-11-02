import { css } from "#/screens/css.ts";
import type { ChatHandOff } from "#/server/chat.ts";
import { useWorkspace } from "#/workspace/context.ts";
import { useInspect } from "#/workspace/event-view.ts";
import { kindStyle } from "#/workspace/styles.ts";
import type { FrameMessage } from "#/workspace/types.ts";

const suggestions = [
	"Any refunds waiting?",
	"How did ads do this week?",
	"What is my profit?",
	"Is anything low on stock?",
];

export function ChatPage({ threadId, events }: { readonly threadId: string; readonly events: readonly ChatHandOff[] }) {
	const { frame, draft, setDraft, thinking, thinkingAgent, messages, submit } = useWorkspace();
	const inspect = useInspect();
	const names = agentNames(frame.agents);
	return (
		<div data-if="isChat" style={css("display: contents")}>
			<div style={css("display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start")}>
				<ChatColumn
					threadId={threadId}
					masterName={frame.masterName}
					messages={messages}
					agents={frame.agents}
					draft={draft}
					thinking={thinking}
					thinkingAgent={thinkingAgent}
					onDraft={setDraft}
					onSubmit={submit}
				/>
				<HandOffs masterName={frame.masterName} events={events} names={names} onInspect={inspect} />
			</div>
		</div>
	);
}

function ChatColumn({
	threadId,
	masterName,
	messages,
	agents,
	draft,
	thinking,
	thinkingAgent,
	onDraft,
	onSubmit,
}: {
	readonly threadId: string;
	readonly masterName: string;
	readonly messages: readonly FrameMessage[];
	readonly agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[];
	readonly draft: string;
	readonly thinking: boolean;
	readonly thinkingAgent: string;
	readonly onDraft: (value: string) => void;
	readonly onSubmit: (text?: string) => void;
}) {
	return (
		<div style={css("flex: 3 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 12px")}>
			<header>
				<h1
					style={css(
						"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
					)}
				>
					{masterName}
				</h1>
				<p style={css("margin: 4px 0 0; color: #5d5d5d")}>
					Ask for anything. {masterName} hands the work to the right squad and reports back here.
				</p>
			</header>
			<div style={css("display: flex; flex-direction: column; gap: 10px; padding: 8px 0")}>
				<div key={threadId} data-loop="chat" data-loop-as="m" style={css("display: contents")}>
					{messages.map((message, index) => (
						<ChatBubble
							key={message.id}
							message={message}
							masterName={masterName}
							agents={agents}
							markTag={firstTag(messages, index)}
						/>
					))}
				</div>
				{thinking ? (
					<div data-if="thinking" style={css("display: contents")}>
						<div
							style={css(
								"align-self: flex-start; padding: 10px 14px; border-radius: 16px; background: #ededed; color: #5d5d5d; font-size: 13px",
							)}
						>
							{thinkingAgent} agent is working on it…
						</div>
					</div>
				) : null}
			</div>
			<div style={css("display: flex; flex-wrap: wrap; gap: 8px")}>
				<div data-loop="suggestions" data-loop-as="s" style={css("display: contents")}>
					{suggestions.map((text) => (
						<button
							key={text}
							type="button"
							className="soft-btn"
							data-handler="s.pick"
							data-event="onClick"
							onClick={() => onSubmit(text)}
							style={css(
								"height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 13px",
							)}
						>
							{text}
						</button>
					))}
				</div>
			</div>
			<Composer masterName={masterName} draft={draft} onDraft={onDraft} onSubmit={onSubmit} />
		</div>
	);
}

function Composer({
	masterName,
	draft,
	onDraft,
	onSubmit,
}: {
	readonly masterName: string;
	readonly draft: string;
	readonly onDraft: (value: string) => void;
	readonly onSubmit: (text?: string) => void;
}) {
	const label = `Message ${masterName}`;
	return (
		<div
			style={css(
				"display: flex; gap: 8px; align-items: center; background: #fff; border-radius: 999px; box-shadow: 0 0 0 1px rgba(13,13,13,.12); padding: 6px 6px 6px 18px",
			)}
		>
			<label
				htmlFor="chat-input"
				style={css("position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)")}
			>
				{label}
			</label>
			<input
				id="chat-input"
				data-handler="onDraft"
				data-event="onChange"
				value={draft}
				onChange={(event) => onDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") onSubmit();
				}}
				placeholder={label}
				style={css(
					"flex: 1; min-width: 0; border: 0; outline-offset: 6px; background: transparent; font: inherit; font-size: 15px; color: #0d0d0d; height: 32px",
				)}
			/>
			<button
				type="button"
				data-handler="send"
				data-event="onClick"
				aria-label="Send"
				onClick={() => onSubmit()}
				style={css(
					"width: 36px; height: 36px; border: 0; border-radius: 999px; background: #181818; color: #fff; display: flex; align-items: center; justify-content: center",
				)}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
				</svg>
			</button>
		</div>
	);
}

function HandOffs({
	masterName,
	events,
	names,
	onInspect,
}: {
	readonly masterName: string;
	readonly events: readonly ChatHandOff[];
	readonly names: Readonly<Record<string, string>>;
	readonly onInspect: (id: string) => void;
}) {
	return (
		<aside
			aria-label="Hand-offs from this chat"
			style={css(
				"flex: 1 1 260px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 10px",
			)}
		>
			<h2 style={css("margin: 0; font-size: 14px; font-weight: 600; color: #0d0d0d")}>Hand-offs from this chat</h2>
			<p style={css("margin: 0; font-size: 12px; color: #5d5d5d")}>
				Each message here was sent between {masterName} and a squad. Open one to see its payload.
			</p>
			<div data-loop="chatBus" data-loop-as="e" style={css("display: contents")}>
				{events.map((event) => (
					<HandOffButton
						key={event.id}
						event={event}
						masterName={masterName}
						names={names}
						onInspect={onInspect}
					/>
				))}
			</div>
		</aside>
	);
}

function HandOffButton({
	event,
	masterName,
	names,
	onInspect,
}: {
	readonly event: ChatHandOff;
	readonly masterName: string;
	readonly names: Readonly<Record<string, string>>;
	readonly onInspect: (id: string) => void;
}) {
	const route = `${nameOf(event.from, masterName, names)} → ${nameOf(event.to, masterName, names)}`;
	return (
		<button
			type="button"
			className="row-btn"
			data-handler="e.inspect"
			data-event="onClick"
			onClick={() => onInspect(event.id)}
			style={css(
				"text-align: left; border: 0; background: transparent; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px; color: #282828",
			)}
		>
			<span style={css("display: flex; gap: 6px; align-items: center; font-size: 12px; color: #5d5d5d")}>
				<span style={css(kindStyle(event.kind))}>{event.kind}</span>
				{route} · {event.time}
			</span>
			<span style={css("font-size: 13px")}>{event.text}</span>
		</button>
	);
}

function ChatBubble({
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
						style={css("font-size: 12px; color: #5d5d5d; display: inline-flex; align-items: center; gap: 6px")}
					>
						<span style={css(`width: 10px; height: 10px; border-radius: 3px; background: ${tint}`)} />
						{tag}
					</span>
				</div>
			)}
			<div style={css(bubbleStyle(message.from))}>{message.text}</div>
		</div>
	);
}

function agentNames(
	agents: readonly { readonly id: string; readonly name: string }[],
): Readonly<Record<string, string>> {
	const names: Record<string, string> = {};
	for (const agent of agents) names[agent.id] = agent.name;
	return names;
}

function nameOf(id: string, masterName: string, names: Readonly<Record<string, string>>): string {
	return id === "master" ? masterName : (names[id] ?? id);
}

function firstTag(messages: readonly FrameMessage[], index: number): boolean {
	const message = messages[index];
	if (!message || message.from === "user") return false;
	return messages.slice(0, index).every((item) => item.from === "user");
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

function bubbleStyle(from: FrameMessage["from"]): string {
	const base = "max-width: 78%; padding: 10px 14px; border-radius: 16px; font-size: 15px; line-height: 22px; ";
	if (from === "user") return `${base}background: #181818; color: #fff`;
	if (from === "agent") return `${base}background: #fff; color: #0d0d0d; box-shadow: 0 0 0 1px rgba(13,13,13,.1)`;
	return `${base}background: #ededed; color: #0d0d0d`;
}

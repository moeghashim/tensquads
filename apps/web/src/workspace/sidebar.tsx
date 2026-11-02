import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { css } from "#/screens/css.ts";

import { agentStatus, initials, masterInitial, ownerText, squadLine } from "./agent-view.ts";
import { useWorkspace } from "./context.ts";
import { ChatIcon, FlowIcon, OverviewIcon, RulesIcon, SquadsIcon } from "./icons.tsx";
import { navStyle } from "./styles.ts";

const shell =
	"flex: 1 1 220px; max-width: 260px; min-width: 200px; display: flex; flex-direction: column; gap: 4px; padding: 12px 8px";
const agentRow =
	"display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: #282828; font-size: 14px; text-align: left";

export function Sidebar() {
	const { frame } = useWorkspace();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const navigate = useNavigate();
	const page = currentPage(pathname);
	const mark = masterInitial(frame.masterName);
	return (
		<nav aria-label="Workspace" data-if="notAdmin" style={css(shell)}>
			<div style={css("display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px")}>
				<div
					style={css(
						"width: 32px; height: 32px; border-radius: 999px; background: #181818; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px",
					)}
				>
					{mark}
				</div>
				<div style={css("display: flex; flex-direction: column")}>
					<span style={css("font-weight: 600; color: #0d0d0d")}>{frame.masterName}</span>
					<span style={css("font-size: 12px; color: #5d5d5d")}>
						{squadLine(frame.agents.length, frame.accountName)}
					</span>
				</div>
			</div>
			<NavButton
				handler="goOverview"
				selected={page === "overview"}
				onClick={() => void navigate({ to: "/overview" })}
				icon={<OverviewIcon />}
				label="Overview"
			/>
			<NavButton
				handler="goChat"
				selected={page === "chat"}
				onClick={() => void navigate({ to: "/chat" })}
				icon={<ChatIcon />}
				label="Chat with the master"
			/>
			<NavButton
				handler="goAgents"
				selected={page === "agents"}
				onClick={() => void navigate({ to: "/agents" })}
				icon={<SquadsIcon />}
				label="Squads"
			/>
			<NavButton
				handler="goFlow"
				selected={page === "flow"}
				onClick={() => void navigate({ to: "/traffic" })}
				icon={<FlowIcon />}
				label="Squad traffic"
			/>
			<NavButton
				handler="goRules"
				selected={page === "rules"}
				onClick={() => void navigate({ to: "/rules" })}
				icon={<RulesIcon />}
				label="Rules and limits"
			/>
			<div style={css("margin-top: 20px; padding: 0 10px; font-size: 12px; font-weight: 500; color: #5d5d5d")}>
				Squads
			</div>
			<div data-loop="agents" data-loop-as="a" style={css("display: contents")}>
				{frame.agents.map((agent) => {
					const status = agentStatus(agent.on);
					return (
						<button
							key={agent.id}
							type="button"
							className="nav-btn"
							data-handler="a.open"
							data-event="onClick"
							onClick={() => void navigate({ to: "/agents/$id", params: { id: agent.id } })}
							style={css(agentRow)}
						>
							<span
								style={css(
									`width: 22px; height: 22px; border-radius: 6px; background: ${agent.tint}; flex: none`,
								)}
							/>
							<span style={css("flex: 1")}>{agent.name}</span>
							<span
								role="img"
								aria-label={status.statusLabel}
								style={css(`width: 8px; height: 8px; border-radius: 999px; background: ${status.dot}`)}
							/>
						</button>
					);
				})}
			</div>
			<div style={css("margin-top: 20px; display: flex; align-items: center; gap: 10px; padding: 8px 10px")}>
				<div
					style={css(
						"width: 28px; height: 28px; border-radius: 999px; background: #dfdfdf; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600",
					)}
				>
					{initials(frame.owner)}
				</div>
				<span style={css("font-size: 14px")}>{ownerText(frame.owner)}</span>
			</div>
		</nav>
	);
}

function currentPage(pathname: string): "overview" | "chat" | "agents" | "flow" | "rules" | "" {
	const pages = [
		["/agents", "agents"],
		["/traffic", "flow"],
		["/rules", "rules"],
		["/chat", "chat"],
		["/overview", "overview"],
	] as const;
	return pages.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "";
}

function NavButton({
	handler,
	selected,
	onClick,
	icon,
	label,
}: {
	readonly handler: string;
	readonly selected: boolean;
	readonly onClick: () => void;
	readonly icon: ReactNode;
	readonly label: string;
}) {
	return (
		<button
			type="button"
			className="nav-btn"
			data-handler={handler}
			data-event="onClick"
			onClick={onClick}
			style={css(navStyle(selected))}
		>
			{icon}
			{label}
		</button>
	);
}

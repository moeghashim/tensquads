import { createContext, type Dispatch, type SetStateAction, useContext } from "react";

import type { missionBits } from "./agent-view.ts";
import type { decorate } from "./event-view.ts";
import type { gateStyle, kindStyle, navStyle, pill, switchParts } from "./styles.ts";
import type { RuleForm, WorkspaceFrameData } from "./types.ts";

export interface StartedTask {
	readonly id: string;
	readonly time: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly text: string;
}

export interface WorkspaceHelpers {
	readonly pill: typeof pill;
	readonly kindStyle: typeof kindStyle;
	readonly gateStyle: typeof gateStyle;
	readonly navStyle: typeof navStyle;
	readonly switchParts: typeof switchParts;
	readonly missionBits: typeof missionBits;
	readonly decorate: typeof decorate;
}

export interface WorkspaceValue {
	readonly frame: WorkspaceFrameData;
	readonly draft: string;
	readonly setDraft: (value: string) => void;
	readonly dockOpen: boolean;
	readonly toggleDock: () => void;
	readonly thinking: boolean;
	readonly thinkingAgent: string;
	readonly startedTask: StartedTask | null;
	readonly pending: boolean;
	readonly messages: WorkspaceFrameData["messages"];
	readonly approvalCount: number;
	readonly noteDecision: (count: number) => void;
	readonly submit: (text?: string) => void;
	readonly selEvent: string;
	readonly setSelEvent: (id: string) => void;
	readonly busFilter: string;
	readonly setBusFilter: (value: string) => void;
	readonly live: boolean;
	readonly setLive: (value: boolean) => void;
	readonly ruleForm: RuleForm;
	readonly setRuleForm: Dispatch<SetStateAction<RuleForm>>;
	readonly refresh: () => Promise<void>;
	readonly inspect: (id: string) => void;
	readonly helpers: WorkspaceHelpers;
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
	const value = useContext(WorkspaceContext);
	if (!value) {
		throw new Error("The workspace frame is missing.");
	}
	return value;
}

export function useWorkspacePage(accountId: string): WorkspaceValue {
	const workspace = useWorkspace();
	if (workspace.frame.accountId !== accountId) {
		throw new Error("The workspace write did not finish.");
	}
	return workspace;
}

export function useRefresh(): () => Promise<void> {
	return useWorkspace().refresh;
}

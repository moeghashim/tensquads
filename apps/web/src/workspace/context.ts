import { createContext, useContext } from "react";

import type { missionBits } from "./agent-view.ts";
import type { decorate } from "./event-view.ts";
import type { gateStyle, kindStyle, navStyle, pill, switchParts } from "./styles.ts";
import type { RuleForm, WorkspaceFrameData } from "./types.ts";

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
	readonly pending: boolean;
	readonly messages: WorkspaceFrameData["messages"];
	readonly approvalCount: number;
	readonly submit: (text?: string) => void;
	readonly selEvent: string;
	readonly setSelEvent: (id: string) => void;
	readonly busFilter: string;
	readonly setBusFilter: (value: string) => void;
	readonly live: boolean;
	readonly setLive: (value: boolean) => void;
	readonly ruleForm: RuleForm;
	readonly setRuleForm: (form: RuleForm) => void;
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

export function useRefresh(): () => Promise<void> {
	return useWorkspace().refresh;
}

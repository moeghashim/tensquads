import { isRedirect } from "@tanstack/react-router";

import type { WorkspaceFrameData } from "./types.ts";

/** A loader session that never matches the signed-in client, so the shell stays unmounted. */
export const hiddenSession = -1;

export function staySignedOut(cause: string, error: unknown): boolean {
	return cause === "stay" && isRedirect(error) && error.options.to === "/signin";
}

export function hiddenFrame(writeAt: number): WorkspaceFrameData & { readonly writeAt: number } {
	return {
		accountName: "",
		owner: "",
		masterName: "",
		agents: [],
		approvalCount: 0,
		messages: [],
		writeAt,
	};
}

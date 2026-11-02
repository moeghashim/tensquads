import type { AccountScope } from "../scope.ts";
import type { WrittenDecision } from "./types.ts";

export type DecideCommand = (
	scope: AccountScope,
	id: string,
	ok: boolean,
	deadlineAt?: number,
) => Promise<WrittenDecision>;

export type DecideMissionCommand = (
	scope: AccountScope,
	id: string,
	ok: boolean,
	deadlineAt?: number,
) => Promise<WrittenDecision>;

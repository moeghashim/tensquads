import type { AccountScope } from "../scope.ts";

export type DecideCommand = (scope: AccountScope, id: string, ok: boolean) => Promise<void>;

export type DecideMissionCommand = (scope: AccountScope, id: string, ok: boolean) => Promise<void>;

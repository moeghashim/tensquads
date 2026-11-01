import type { AccountScope } from "../scope.ts";

export type NextEventCommand = (scope: AccountScope) => Promise<void>;

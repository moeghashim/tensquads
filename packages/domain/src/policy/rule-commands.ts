import type { AccountScope } from "../scope.ts";
import type { RuleDraft } from "./repository.ts";

export type SetRuleOnCommand = (scope: AccountScope, id: string, on: boolean) => Promise<void>;

export type AddRuleCommand = (scope: AccountScope, draft: RuleDraft) => Promise<void>;

export type SetLimitCommand = (scope: AccountScope, key: string, value: number) => Promise<void>;

// A platform call still passes a non-empty accountId, and the repositories do not filter on it.
// An account call filters every tenant read and write to that accountId.
// The caller must authorize platform access. Scope validation is not authentication.

export interface AccountScope {
	readonly accountId: string;
	readonly mode: "account" | "platform";
}

export class MissingAccountScopeError extends Error {
	constructor() {
		super("Every repository call needs an AccountScope.");
		this.name = "MissingAccountScopeError";
	}
}

export function requireScope(scope: AccountScope | null | undefined): AccountScope {
	if (
		scope == null ||
		(scope.mode !== "account" && scope.mode !== "platform") ||
		typeof scope.accountId !== "string" ||
		scope.accountId.length === 0
	) {
		throw new MissingAccountScopeError();
	}
	return scope;
}

export function sameAccount(scope: AccountScope, accountId: string): boolean {
	return scope.mode === "platform" || scope.accountId === accountId;
}

import type { AccountOpened, AccountScope } from "@tensquads/domain";

export interface PlatformCommands {
	openAccount(scope: AccountScope): AccountOpened;
}

// The event is the record. Version 1 stores no row.
export function platform(context: { provide(name: string, service: unknown): unknown }): void {
	const commands: PlatformCommands = {
		openAccount(scope) {
			return { type: "account.opened", accountId: scope.accountId };
		},
	};
	context.provide("platformEvents", commands);
}

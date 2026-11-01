export interface AccountOpened {
	readonly type: "account.opened";
	readonly accountId: string;
}

export type PlatformEvent = AccountOpened;

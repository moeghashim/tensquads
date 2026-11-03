const sessionRefreshMessage = "The session needs a refresh.";

export class SessionRefreshNeeded extends Error {
	constructor() {
		super(sessionRefreshMessage);
		this.name = "SessionRefreshNeeded";
	}
}

export function isSessionRefreshNeeded(error: unknown): boolean {
	return error instanceof Error && error.message === sessionRefreshMessage;
}

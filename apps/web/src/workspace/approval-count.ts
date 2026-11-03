// One counter in the browser. A server render uses 0. A clock cannot order two reads.
let writes = 0;

function browserWrites(): number {
	if (import.meta.env?.SSR === true) {
		return 0;
	}
	return writes;
}

// The first line of a loader. The value travels back with that loader's data.
export function captureWrites(): number {
	return browserWrites();
}

export function currentWrites(): number {
	return browserWrites();
}

// A decision starts, or it settles: success, failure, or timeout.
export function advanceWrites(): number {
	if (import.meta.env?.SSR === true) {
		return 0;
	}
	writes += 1;
	return writes;
}

export interface ApprovalCount {
	readonly value: number;
	readonly writeAt: number;
}

export function seedApprovalCount(value: number): ApprovalCount {
	return { value, writeAt: 0 };
}

// The server count from a decision replaces an older one. The counter orders them.
export function noteDecisionCount(current: ApprovalCount, value: number, writeAt: number): ApprovalCount {
	if (writeAt < current.writeAt) {
		return current;
	}
	return { value, writeAt };
}

// A frame is the current count only when no write happened after it started.
export function noteFrameCount(current: ApprovalCount, value: number, startedAt: number, live: number): ApprovalCount {
	if (live !== startedAt || startedAt < current.writeAt) {
		return current;
	}
	return { value, writeAt: startedAt };
}

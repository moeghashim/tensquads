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

export function sameCount(current: ApprovalCount, next: ApprovalCount): boolean {
	return current.value === next.value && current.writeAt === next.writeAt;
}

export function overviewMatchStamp(data: unknown, accountId: string): string | null {
	if (!isDataRecord(data) || data.accountId !== accountId) return null;
	const read = countFields(data);
	if (read === null) {
		return null;
	}
	return `${read.writeAt}:${read.count}`;
}

export function overviewReadFromStamp(
	stamp: string | null,
	live: number,
): { readonly count: number; readonly writeAt: number } | null {
	const read = parseStamp(stamp);
	if (!sameWrite(read, live)) {
		return null;
	}
	return read;
}

function countFields(data: unknown): { readonly count: number; readonly writeAt: number } | null {
	if (!isCountRecord(data)) {
		return null;
	}
	return { count: data.count, writeAt: data.writeAt };
}

function isCountRecord(data: unknown): data is { count: number; writeAt: number } {
	return isDataRecord(data) && numberField(data, "count") && numberField(data, "writeAt");
}

function isDataRecord(data: unknown): data is Record<string, unknown> {
	return typeof data === "object" && data !== null;
}

function numberField(data: Record<string, unknown>, key: string): boolean {
	return typeof data[key] === "number";
}

function parseStamp(stamp: string | null): { readonly count: number; readonly writeAt: number } | null {
	if (stamp === null) {
		return null;
	}
	const parts = stamp.split(":");
	if (!integerParts(parts)) {
		return null;
	}
	return { writeAt: Number(parts[0]), count: Number(parts[1]) };
}

function integerParts(parts: readonly string[]): boolean {
	return parts.length === 2 && Number.isInteger(Number(parts[0])) && Number.isInteger(Number(parts[1]));
}

function sameWrite(read: { readonly writeAt: number } | null, live: number): read is { writeAt: number } {
	return read !== null && read.writeAt === live;
}

// The page on screen and a frame can share a counter. The page count is the one
// the cards use. A frame replaces it only after a later write.
export function noteOverviewCount(
	current: ApprovalCount,
	frameValue: number,
	frameStartedAt: number,
	live: number,
	overview: { readonly count: number; readonly writeAt: number } | null,
): ApprovalCount {
	if (overview !== null && live === overview.writeAt) {
		return noteDecisionCount(current, overview.count, overview.writeAt);
	}
	return noteFrameCount(current, frameValue, frameStartedAt, live);
}

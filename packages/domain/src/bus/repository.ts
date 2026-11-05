import type { AccountScope } from "../scope.ts";
import type { BusEvent } from "./types.ts";

export interface BusRepository {
	listEvents(scope: AccountScope): Promise<readonly BusEvent[]>;
	readStore(scope: AccountScope): Promise<Readonly<Record<string, unknown>>>;
	nextEvent(scope: AccountScope, deadlineAt?: number): Promise<BusEvent | undefined>;
}

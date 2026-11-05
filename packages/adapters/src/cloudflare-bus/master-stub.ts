import type { PublishedEvent } from "@tensquads/kernel";

export function openMaster(): Promise<{ accept: (event: unknown) => Promise<PublishedEvent[]> } | null> {
	return Promise.resolve(null);
}

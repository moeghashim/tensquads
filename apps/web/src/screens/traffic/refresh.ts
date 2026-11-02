import { consumeQueuedEvent } from "#/workspace/live.ts";

export function refreshTraffic(
	refresh: () => void | Promise<void>,
	setSelEvent: (id: string) => void,
): () => Promise<void> {
	return async () => {
		await refresh();
		const id = consumeQueuedEvent();
		if (id.length > 0) setSelEvent(id);
	};
}

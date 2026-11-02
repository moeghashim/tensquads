import { createServerFn } from "@tanstack/react-start";

export interface ChatHandOff {
	readonly id: string;
	readonly time: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly text: string;
}

export const loadChat = createServerFn({ method: "GET" }).handler(async () => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const repositories = createRepositories(db);
		const thread = await repositories.conversation.thread(scope);
		const events = await repositories.bus.listEvents(scope);
		// The bus list is oldest first. The panel shows the last six, newest first.
		const latest = events.slice(-6).reverse();
		const handoffs: ChatHandOff[] = latest.map((event) => ({
			id: event.id,
			time: event.time,
			from: event.from,
			to: event.to,
			kind: event.kind,
			text: event.text,
		}));
		return { threadId: thread?.id ?? "dock", events: handoffs };
	});
});

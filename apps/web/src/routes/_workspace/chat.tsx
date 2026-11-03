import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "#/screens/chat/ChatPage.tsx";
import { loadChat } from "#/server/chat.ts";
import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/chat")({
	head: () => ({
		meta: [{ title: "Chat with the master" }],
	}),
	loader: async () => {
		const writeAt = captureWrites();
		return { ...(await loadChat()), writeAt };
	},
	component: ChatRoute,
});

function ChatRoute() {
	const data = Route.useLoaderData();
	return <ChatPage threadId={data.threadId} events={data.events} />;
}

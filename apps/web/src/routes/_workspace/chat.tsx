import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "#/screens/chat/ChatPage.tsx";
import { loadChat } from "#/server/chat.ts";

export const Route = createFileRoute("/_workspace/chat")({
	head: () => ({
		meta: [{ title: "Chat with the master" }],
	}),
	loader: () => loadChat(),
	component: ChatRoute,
});

function ChatRoute() {
	const data = Route.useLoaderData();
	return <ChatPage threadId={data.threadId} events={data.events} />;
}

import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "#/screens/chat/ChatPage.tsx";
import { loadChat } from "#/server/chat.ts";
import { captureWrites } from "#/workspace/approval-count.ts";

type ChatData = Awaited<ReturnType<typeof loadChat>> & { readonly writeAt: ReturnType<typeof captureWrites> };
let lastChat: ChatData | undefined;

export const Route = createFileRoute("/_workspace/chat")({
	head: () => ({
		meta: [{ title: "Chat with Petra" }],
	}),
	loader: async () => {
		const writeAt = captureWrites();
		try {
			const data = { ...(await loadChat()), writeAt };
			if (typeof window !== "undefined") lastChat = data;
			return data;
		} catch (error) {
			// A failed background read keeps the last chat, so the live poll goes on.
			// Only the browser keeps it. The server never shares chat data between requests.
			if (typeof window !== "undefined" && lastChat) return lastChat;
			throw error;
		}
	},
	component: ChatRoute,
});

function ChatRoute() {
	const data = Route.useLoaderData();
	return <ChatPage threadId={data.threadId} events={data.events} liveBus={data.liveBus} />;
}

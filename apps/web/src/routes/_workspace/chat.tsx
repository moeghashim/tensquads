import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/chat")({
	head: () => ({
		meta: [{ title: "Chat with the master" }],
	}),
	component: ChatPage,
});

function ChatPage() {
	return null;
}

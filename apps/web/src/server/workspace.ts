import { createServerFn } from "@tanstack/react-start";

function validateText(input: unknown): string {
	if (typeof input !== "string") {
		throw new Error("The send request is not valid.");
	}
	return input;
}

export const loadWorkspaceFrame = createServerFn({ method: "GET" }).handler(async () => {
	const { readFrame, requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace((scope, db) => readFrame(db, scope));
});

export const beginWorkspaceSend = createServerFn({ method: "POST" })
	.validator(validateText)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(async (scope, db) => {
			const { beginSend } = await import("@tensquads/adapters");
			return beginSend(db, scope, data);
		});
	});

export const finishWorkspaceSend = createServerFn({ method: "POST" }).handler(async () => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { finishSend } = await import("@tensquads/adapters");
		return finishSend(db, scope);
	});
});

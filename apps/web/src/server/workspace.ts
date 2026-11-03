import { createServerFn } from "@tanstack/react-start";

function validateText(input: unknown): { accountId: string; text: string } {
	if (
		typeof input !== "object" ||
		input === null ||
		!("accountId" in input) ||
		typeof input.accountId !== "string" ||
		input.accountId.length === 0 ||
		!("text" in input) ||
		typeof input.text !== "string"
	) {
		throw new Error("The send request is not valid.");
	}
	return { accountId: input.accountId, text: input.text };
}

export const loadWorkspaceFrame = createServerFn({ method: "GET" }).handler(async () => {
	const { readFrame, requireWorkspace } = await import("./workspace-session.ts");
	const { isSuperAdmin } = await import("./super-admin.ts");
	const admin = await isSuperAdmin();
	return requireWorkspace(async (scope, db) => {
		const frame = await readFrame(db, scope);
		return { ...frame, accountId: scope.accountId, superAdmin: admin };
	});
});

export const beginWorkspaceSend = createServerFn({ method: "POST" })
	.validator(validateText)
	.handler(async ({ data }) => {
		const { sendWorkspace } = await import("./workspace-session.ts");
		return sendWorkspace("beginSend", data.text, data.accountId);
	});

export const finishWorkspaceSend = createServerFn({ method: "POST" })
	.validator(validateText)
	.handler(async ({ data }) => {
		const { sendWorkspace } = await import("./workspace-session.ts");
		return sendWorkspace("finishSend", data.text, data.accountId);
	});

import { type AppDatabase, writeAccount } from "@tensquads/adapters";

import { demoData, workspaceFromDesign } from "./workspace.ts";

export async function replaceDemoAccount(db: AppDatabase, accountId: string, clerkUserId: string): Promise<void> {
	const demo = workspaceFromDesign().accounts.find((entry) => entry.account.id === "demo");
	if (!demo) {
		throw new Error("The demo account is missing.");
	}
	await writeAccount(db, {
		...demoData(),
		masterName: demo.masterName,
		clerkUserId,
		account: { ...demo.account, id: accountId },
	});
}

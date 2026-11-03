import { createServerFn } from "@tanstack/react-start";

import { specialAccountPattern } from "./special-account.ts";

function accountId(input: unknown): string {
	if (typeof input !== "string" || !specialAccountPattern.test(input)) {
		throw new Error("The account id is not valid.");
	}
	return input;
}

export const platformOrgId = createServerFn({ method: "GET" }).handler(async () => {
	const { workerEnv } = await import("./worker-env.ts");
	return workerEnv("CLERK_PLATFORM_ORG_ID");
});

export const loadAdminAttention = createServerFn({ method: "GET" }).handler(async () => {
	const { attentionCount } = await import("@tensquads/domain");
	const { createRepositories } = await import("@tensquads/adapters");
	const { withPlatform } = await import("./platform-scope.ts");
	return withPlatform(async (scope, db) => {
		const images = await createRepositories(db).catalog.listImages(scope);
		return attentionCount(images);
	});
});

export const loadAdminAccounts = createServerFn({ method: "GET" }).handler(async () => {
	const { createRepositories } = await import("@tensquads/adapters");
	const { withPlatform } = await import("./platform-scope.ts");
	return withPlatform((scope, db) => createRepositories(db).platform.listAccounts(scope));
});

export const loadAdminImages = createServerFn({ method: "GET" }).handler(async () => {
	const { createRepositories } = await import("@tensquads/adapters");
	const { withPlatform } = await import("./platform-scope.ts");
	return withPlatform((scope, db) => createRepositories(db).catalog.listImages(scope));
});

export const openSpecialSession = createServerFn({ method: "POST" })
	.validator(accountId)
	.handler(async ({ data }) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const { Kernel } = await import("@tensquads/kernel");
		const { withPlatform } = await import("./platform-scope.ts");
		const found = await withPlatform(async (scope, db) => {
			const repositories = createRepositories(db);
			const rows = await repositories.platform.listAccounts(scope);
			if (!rows.some((row) => row.id === data)) {
				return false;
			}
			await new Kernel(repositories).openAccount({ accountId: data, mode: "account" });
			return true;
		});
		if (!found) {
			throw new Error("The account does not exist.");
		}
		const { writeSpecialAccount } = await import("./special-session.ts");
		writeSpecialAccount(data);
	});

export const endSpecialSession = createServerFn({ method: "POST" }).handler(async () => {
	const { isSuperAdmin } = await import("./super-admin.ts");
	if (!(await isSuperAdmin())) {
		return;
	}
	const { clearSpecialAccount } = await import("./special-session.ts");
	clearSpecialAccount();
});

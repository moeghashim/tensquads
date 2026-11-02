export async function advanceTrafficAccount(db, scope, startedAt) {

		const { createRepositories } = await import("@tensquads/adapters");
		const { Kernel } = await import("@tensquads/kernel");
		const repositories = createRepositories(db);
		const before = new Set((await repositories.bus.listEvents(scope)).map((event) => event.id));
		await new Kernel(repositories).nextEvent(scope);
		const after = await repositories.bus.listEvents(scope);
		return after.filter((event) => !before.has(event.id)).at(-1)?.id ?? "";
}

import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { squadById } from "#/screens/signup/catalog.ts";
import { workerEnv } from "./worker-env.ts";

interface CreateAccountInput {
	readonly name: string;
	readonly mission: string;
	readonly agentIds: readonly string[];
}

function validateCreateAccount(input: unknown): CreateAccountInput {
	if (typeof input !== "object" || input === null) {
		throw new Error("The create request is not valid.");
	}
	const record = input as Record<string, unknown>;
	if (typeof record.name !== "string" || typeof record.mission !== "string" || !Array.isArray(record.agentIds)) {
		throw new Error("The create request is not valid.");
	}
	const agentIds = record.agentIds.filter((id): id is string => typeof id === "string");
	if (agentIds.length !== record.agentIds.length) {
		throw new Error("The create request is not valid.");
	}
	return { name: record.name, mission: record.mission, agentIds };
}

async function databaseUrl(): Promise<string> {
	const test = await workerEnv("TEST_DATABASE_URL");
	if (test.length > 0) {
		return test;
	}
	return workerEnv("NEON_POSTGRES_CONNECTION_STRING");
}

export const createAccount = createServerFn({ method: "POST" })
	.validator(validateCreateAccount)
	.handler(async ({ data }) => {
		const { auth, clerkClient } = await import("@clerk/tanstack-react-start/server");
		const session = await auth();
		if (!session.userId) {
			throw redirect({ to: "/signin" });
		}
		const user = await clerkClient().users.getUser(session.userId);
		const primary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
		const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
		const agents = data.agentIds.map((id) => {
			const squad = squadById(id);
			if (!squad) {
				throw new Error("The create request is not valid.");
			}
			return { id: squad.id, name: squad.name, role: squad.role, tint: squad.tint };
		});
		const connection = await databaseUrl();
		if (connection.length === 0) {
			throw new Error("The database is not configured.");
		}
		const { openPostgres, createRepositories } = await import("@tensquads/adapters");
		const database = openPostgres(connection);
		try {
			await database.migrate();
			const repositories = createRepositories(database.db);
			return await repositories.platform.createWorkspace(
				{ accountId: crypto.randomUUID(), mode: "account" },
				{
					clerkUserId: session.userId,
					email,
					name: data.name,
					mission: data.mission,
					agents,
				},
			);
		} finally {
			await database.close();
		}
	});

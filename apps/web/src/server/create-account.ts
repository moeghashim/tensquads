import { createServerFn } from "@tanstack/react-start";

import { squadById } from "#/screens/signup/catalog.ts";
import { workerEnv } from "./worker-env.ts";

interface CreateAccountInput {
	readonly name: string;
	readonly mission: string;
	readonly agentIds: readonly string[];
}

function validateCreateAccount(input: unknown): CreateAccountInput {
	if (!isRecord(input)) {
		throw new Error("The create request is not valid.");
	}
	const record = input as Record<string, unknown>;
	if (!hasAccountFields(record)) {
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
		const { clerkClient } = await import("@clerk/tanstack-react-start/server");
		const { requireClerkUser } = await import("./session.ts");
		const userId = await requireClerkUser();
		const user = await clerkClient().users.getUser(userId);
		const primary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
		const email = accountEmail(primary, user.emailAddresses);
		const agents = workspaceAgents(data.agentIds);
		const connection = await databaseUrl();
		if (connection.length === 0) {
			throw new Error("The database is not configured.");
		}
		const { openPostgres, createRepositories } = await import("@tensquads/adapters");
		const database = openPostgres(connection);
		try {
			const repositories = createRepositories(database.db);
			return await repositories.platform.createWorkspace(
				{ accountId: crypto.randomUUID(), mode: "account" },
				{
					clerkUserId: userId,
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

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}

function workspaceAgents(agentIds: readonly string[]) {
	return agentIds.map((id) => {
		const squad = squadById(id);
		if (!squad) {
			throw new Error("The create request is not valid.");
		}
		return { id: squad.id, name: squad.name, role: squad.role, tint: squad.tint };
	});
}

function hasAccountFields(
	record: Record<string, unknown>,
): record is { name: string; mission: string; agentIds: unknown[] } {
	return typeof record.name === "string" && typeof record.mission === "string" && Array.isArray(record.agentIds);
}

function accountEmail(primary: { emailAddress: string } | undefined, addresses: { emailAddress: string }[]) {
	return primary?.emailAddress ?? firstEmail(addresses);
}
function firstEmail(addresses: { emailAddress: string }[]) {
	return addresses[0]?.emailAddress ?? "";
}

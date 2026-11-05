import { workerEnv } from "./worker-env.ts";

export async function databaseUrl(): Promise<string> {
	const test = await workerEnv("TEST_DATABASE_URL");
	if (test.length > 0) {
		return test;
	}
	return workerEnv("NEON_POSTGRES_CONNECTION_STRING");
}

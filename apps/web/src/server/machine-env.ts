import { workerEnv } from "./worker-env.ts";

// The Worker settings a boat.dev machine call needs. The model settings must be here,
// or a resume of a real-run agent fails before any boat request.
export async function machineEnvFrom(read: (name: string) => Promise<string>) {
	return {
		ADAPTERS: await read("ADAPTERS"),
		BOAT_TOKEN: await read("BOAT_TOKEN"),
		BOAT_ADMIN_TOKEN: await read("BOAT_ADMIN_TOKEN"),
		BOAT_PROFILE: await read("BOAT_PROFILE"),
		BOAT_BASE_PATH: await read("BOAT_BASE_PATH"),
		BOAT_SECRET_BASE_URL: await read("BOAT_SECRET_BASE_URL"),
		RESEARCH_MODEL: await read("RESEARCH_MODEL"),
		RESEARCH_REASONING_EFFORT: await read("RESEARCH_REASONING_EFFORT"),
		WEBSITE_MODEL: await read("WEBSITE_MODEL"),
		WEBSITE_REASONING_EFFORT: await read("WEBSITE_REASONING_EFFORT"),
	};
}

export function machineEnv() {
	return machineEnvFrom(workerEnv);
}

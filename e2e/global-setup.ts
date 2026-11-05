import type { FullConfig } from "@playwright/test";

// The first request compiles the route. Two dev servers do that under a high
// load, and the document request can time out. Each screen is requested once
// before any test.
const routes = ["/", "/signup", "/signin", "/overview", "/agents", "/agents/support", "/traffic", "/rules", "/chat"];

export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use.baseURL;
	if (!baseURL) {
		throw new Error("The e2e base URL is not set.");
	}
	for (const path of routes) {
		const url = new URL(path, baseURL);
		const started = Date.now();
		const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
		await response.arrayBuffer();
		console.log(`WARM ${path} ${response.status} ${Date.now() - started}`);
	}
}

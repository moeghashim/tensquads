import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Moe switches this constant to "10squads.com" when the new homepage replaces the current one.
export const HOME_V2_HOST = "tensquads.moe-678.workers.dev";

export function isHomeV2Request(request: Request): boolean {
	const headerHost = request.headers.get("host")?.split(":")[0]?.trim().toLowerCase();
	if (headerHost && headerHost.length > 0) {
		return headerHost === HOME_V2_HOST;
	}
	try {
		return new URL(request.url).hostname.toLowerCase() === HOME_V2_HOST;
	} catch {
		return false;
	}
}

export const getHomeV2 = createServerFn({ method: "GET" }).handler(() => {
	return isHomeV2Request(getRequest());
});

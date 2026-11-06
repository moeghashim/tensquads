const productionOrigin = "https://tensquads.moe-678.workers.dev";
const realOrigin = "https://tensquads-real.moe-678.workers.dev";

// adaptersMode returns "real" only for the real wrangler environment.
// Every other mode stays on the production Worker.
export function authorizedOrigin(mode: string): string {
	if (mode === "real") return realOrigin;
	return productionOrigin;
}

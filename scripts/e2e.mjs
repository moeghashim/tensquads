// The held account read locks the accounts table for 32 seconds.
// A parallel worker times out on that lock, so this test runs after the others.
// Playwright workers are process-global. The fence project therefore runs alone.
// GitHub macOS runners have 3 CPUs. Playwright's default is 50% of the CPUs,
// and floor(3 * 0.5) is 1. One worker runs the app project for 27 to 39 minutes.
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { sweepClerkTestUsers } from "./clerk-test-users.mjs";
import { suitePlan } from "./e2e-plan.mjs";

try {
	await sweepClerkTestUsers();
} catch (error) {
	console.error(error instanceof Error ? error.message : "Clerk test user sweep failed.");
	process.exit(1);
}

function run(args) {
	const result = spawnSync("playwright", ["test", ...args], { stdio: "inherit" });
	if (result.error) {
		console.error(result.error.message);
		return 1;
	}
	return result.status ?? 1;
}

const extra = process.argv.slice(2);
if (extra.length > 0) {
	process.exit(run(extra));
}

const results = suitePlan(Boolean(process.env.CI), process.platform, cpus().length).map(run);
const admin = run(["--project", "admin", "--workers=1"]);
process.exit(results.every((status) => status === 0) && admin === 0 ? 0 : 1);

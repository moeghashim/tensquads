// The held account read locks the accounts table for 32 seconds.
// A parallel worker times out on that lock, so this test runs after the others.
// Playwright workers are process-global. The fence project therefore runs alone.
// Playwright's default is 50% of the CPUs. On CI that left 1 worker on macOS (3 CPUs)
// and 2 on Linux (4 CPUs), and both runners reached the 45-minute job limit.
// On CI the app project uses one worker per CPU.
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { suitePlan } from "./e2e-plan.mjs";

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

const results = suitePlan(Boolean(process.env.CI), cpus().length).map(run);
const admin = run(["--project", "admin", "--workers=1"]);
process.exit(results.every((status) => status === 0) && admin === 0 ? 0 : 1);

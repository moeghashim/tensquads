// The held account read locks the accounts table for 32 seconds.
// A parallel worker times out on that lock, so this test runs after the others.
// Playwright workers are process-global. The fence project therefore runs alone.
// GitHub macOS runners have 3 CPUs. Playwright's default is 50% of the CPUs,
// and floor(3 * 0.5) is 1. One worker runs the app project for 27 to 39 minutes.
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";

const held = "a held account read commits no limit|a read held past the deadline cannot commit the queued writes";
const fenceProject = "rules-fence";

function appArgs(args) {
	const full = ["--project", "app", ...args];
	if (process.env.CI && process.platform === "darwin") {
		full.push(`--workers=${Math.max(2, cpus().length)}`);
	}
	return full;
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

const suite = run(appArgs(["--grep-invert", held]));
const fence = run(["--project", fenceProject, "--workers=1"]);
const locked = run(["--project", "app", "--workers=1", "--grep", held]);
process.exit(suite === 0 && fence === 0 && locked === 0 ? 0 : 1);

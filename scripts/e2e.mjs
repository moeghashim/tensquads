// The held account read locks the accounts table for 32 seconds.
// A parallel worker times out on that lock, so this test runs after the others.
// Playwright workers are process-global. The fence project therefore runs alone.
import { spawnSync } from "node:child_process";

const held = "a held account read commits no limit";
const fenceProject = "rules-fence";

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

const suite = run(["--project", "app", "--grep-invert", held]);
const fence = run(["--project", fenceProject, "--workers=1"]);
const locked = run(["--project", "app", "--workers=1", "--grep", held]);
process.exit(suite === 0 && fence === 0 && locked === 0 ? 0 : 1);

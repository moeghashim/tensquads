// The held account read locks the accounts table for 32 seconds.
// A parallel worker times out on that lock, so this test runs after the others.
import { spawnSync } from "node:child_process";

const held = "a held account read commits no limit";

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

const suite = run(["--grep-invert", held]);
const locked = run(["--workers=1", "--grep", held]);
process.exit(suite === 0 && locked === 0 ? 0 : 1);

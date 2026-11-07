import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const serial = [
	"test/bus-writer.test.ts",
	"test/bus-deadline-commit.test.ts",
	"test/late-lock.test.ts",
	"test/mandate.test.ts",
	"test/reset-lock.test.ts",
	"test/rules-deadline.test.ts",
	"test/agent-lock.test.ts",
	"test/writer-lock.test.ts",
	"test/create-lock.test.ts",
	"test/review-fourth.test.ts",
	"test/master-inbox.test.ts",
	"test/live-projection.test.ts",
	"test/review-monitor.test.ts",
	"test/approval-delivery.test.ts",
	"test/master-watch.test.ts",
	"test/master-live-run.test.ts",
];
// These files import the private agent kit, directly or through domain code.
// Without the kit they skip, as scripts/kit-optional.mjs does. CI sets CI=true,
// links the kit, and never skips: a missing kit fails there.
const kitTests = [
	"test/master-brief-live.test.ts",
	"test/master-live-run.test.ts",
	"test/master-watch.test.ts",
	"test/own-preview.test.ts",
	"test/publish-routes.test.ts",
	"test/publish-security.test.ts",
];
const kitHook = join(import.meta.dirname, "../../../scripts/register-kit.mjs");
const kitInstalled = existsSync(join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json"));
const kitSkipped = kitInstalled || process.env.CI === "true" ? [] : kitTests;
if (kitSkipped.length > 0) {
	console.log(`The agent kit is not installed. ${kitSkipped.length} kit tests were skipped.`);
}
const skip = (path: string) => !kitSkipped.includes(path);
const serialRun = serial.filter(skip);
const remaining = readdirSync("test")
	.filter((name) => name.endsWith(".test.ts"))
	.map((name) => `test/${name}`)
	.filter((path) => !serial.includes(path))
	.filter(skip)
	.sort();

const nodeArgs = ["--experimental-strip-types"];
if (kitInstalled) nodeArgs.push("--import", kitHook);

for (const args of [["--test-concurrency=1", ...serialRun], remaining]) {
	const result = spawnSync(process.execPath, [...nodeArgs, "--test", ...args], {
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}

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
];
const remaining = readdirSync("test")
	.filter((name) => name.endsWith(".test.ts"))
	.map((name) => `test/${name}`)
	.filter((path) => !serial.includes(path))
	.sort();

const kitHook = join(import.meta.dirname, "../../../scripts/register-kit.mjs");
const kitInstalled = existsSync(join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json"));
const nodeArgs = ["--experimental-strip-types"];
if (kitInstalled) nodeArgs.push("--import", kitHook);

for (const args of [["--test-concurrency=1", ...serial], remaining]) {
	const result = spawnSync(process.execPath, [...nodeArgs, "--test", ...args], {
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}

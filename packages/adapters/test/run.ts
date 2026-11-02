import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const serial = ["test/late-lock.test.ts", "test/mandate.test.ts", "test/reset-lock.test.ts"];
const remaining = readdirSync("test")
	.filter((name) => name.endsWith(".test.ts"))
	.map((name) => `test/${name}`)
	.filter((path) => !serial.includes(path))
	.sort();

for (const args of [["--test-concurrency=1", ...serial], remaining]) {
	const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...args], {
		stdio: "inherit",
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}

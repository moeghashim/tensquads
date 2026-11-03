import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const allowed = join(sourceRoot, "server/platform-scope.ts");

function files(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			found.push(...files(path));
			continue;
		}
		if (!/\.(ts|tsx)$/.test(name) || name.endsWith(".test.ts")) continue;
		found.push(path);
	}
	return found;
}

describe("platform scope", () => {
	it("builds a platform scope only in the platform server module", () => {
		const hits = files(sourceRoot).filter((path) => readFileSync(path, "utf8").includes('mode: "platform"'));
		assert.deepEqual(hits, [allowed]);
	});
});

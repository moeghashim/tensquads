// design-check: proves that design/ is the same as the canvas it was pulled from.
// Reads design/MANIFEST.json. Hashes each file. Exits 1 on any difference.
// Run: node scripts/design-check.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(resolve(root, "design/MANIFEST.json"), "utf8"));

let bad = 0;
for (const [file, expected] of Object.entries(manifest.files)) {
	const bytes = readFileSync(resolve(root, "design", file));
	const actual = createHash("sha256").update(bytes).digest("hex");
	const ok = actual === expected;
	if (!ok) bad += 1;
	console.log(`${ok ? "OK  " : "DIFF"} ${file}`);
}

console.log(`canvas ${manifest.canvas} version ${manifest.version}, pulled ${manifest.pulled}`);
if (bad > 0) {
	console.error(`${bad} file(s) differ from the canvas version in MANIFEST.json. Do not edit design/ by hand. Ask Moe to pull the canvas again.`);
	process.exit(1);
}
console.log("design/ matches the canvas.");

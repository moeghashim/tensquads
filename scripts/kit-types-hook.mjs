import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const KIT = "/node_modules/@tensquads/agent-kit/";

// The kit ships TypeScript source. Strip types only for that package.
export async function load(url, context, nextLoad) {
	if (!url.includes(KIT) || !url.endsWith(".ts")) return nextLoad(url, context);
	const source = await readFile(new URL(url), "utf8");
	return {
		format: "module",
		source: stripTypeScriptTypes(source, { mode: "strip" }),
		shortCircuit: true,
	};
}

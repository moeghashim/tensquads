import { readFileSync } from "node:fs";

// Loads a local env file without printing any value.
export function loadEnv(path = ".env"): void {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return;
	}
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq < 1) {
			continue;
		}
		const key = trimmed.slice(0, eq);
		let value = trimmed.slice(eq + 1);
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

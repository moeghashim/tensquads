import { readFileSync } from "node:fs";

function isQuoted(value: string, quote: string): boolean {
	return value.startsWith(quote) && value.endsWith(quote);
}

function unquote(value: string): string {
	if (isQuoted(value, '"') || isQuoted(value, "'")) {
		return value.slice(1, -1);
	}
	return value;
}

function loadLine(line: string): void {
	const trimmed = line.trim();
	if (/^(#|$)/.test(trimmed)) {
		return;
	}
	const eq = trimmed.indexOf("=");
	if (eq < 1) {
		return;
	}
	const key = trimmed.slice(0, eq);
	if (process.env[key] === undefined) {
		process.env[key] = unquote(trimmed.slice(eq + 1));
	}
}

// Loads a local env file without printing any value.
export function loadEnv(path = ".env"): void {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return;
	}
	for (const line of text.split("\n")) {
		loadLine(line);
	}
}

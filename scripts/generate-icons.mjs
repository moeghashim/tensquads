import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Names only. The drawing comes from design/*.dc.html. Distinct path data stays distinct.
const names = [
	["M8 2.5V5M6 9h0M10 9h0", "agent"],
	["M3 8h10M9 4l4 4-4 4", "arrow-right"],
	["M8 13V3M3.5 7.5 8 3l4.5 4.5", "arrow-up"],
	["M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z", "chat"],
	["M3 8.5 6.5 12 13 4.5", "check-wide"],
	["M2.5 8.5 6 12l7.5-8", "check"],
	["M10 3.5 5.5 8l4.5 4.5", "chevron-left-sm"],
	["M10 3 5 8l5 5", "chevron-left"],
	["M4 4l8 8M12 4l-8 8", "close"],
	["M8 1.8 13.5 5v6L8 14.2 2.5 11V5z", "cube"],
	['cx="8" cy="3.5"', "flow"],
	['x="2" y="2" width="5" height="5"', "grid"],
	["M2.5 13.5v-8l5.5-3 5.5 3v8", "house"],
	["M8 7v4M8 5h0", "info"],
	["M2.5 4.5h11v8h-11z", "mail"],
	['cx="5.5" cy="5.5"', "people"],
	["M8 2.5v11M2.5 8h11", "plus"],
	["M5 5h0M5 11h0", "server"],
	["M2.5 4h7M12.5 4h1", "sliders"],
	["M2.5 6.5 8 2.5l5.5 4v7h-11z", "store"],
	["M2 7h12M6 7v6", "table"],
];

function normalizeBody(body) {
	return body.replace(/\s+/g, " ").replace(/> </g, "><").trim();
}

function designBodies() {
	const files = readdirSync(join(root, "design"))
		.filter((name) => name.endsWith(".dc.html"))
		.sort();
	const bodies = [];
	const seen = new Set();
	for (const name of files) {
		const text = readFileSync(join(root, "design", name), "utf8");
		for (const match of text.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gi)) {
			const body = normalizeBody(match[1]);
			if (!seen.has(body)) {
				seen.add(body);
				bodies.push(body);
			}
		}
	}
	return bodies;
}

function nameFor(body) {
	const hits = names.filter(([fragment]) => body.includes(fragment));
	if (hits.length !== 1) {
		throw new Error(`Icon ${body.slice(0, 80)} matched ${hits.length} names.`);
	}
	return hits[0][1];
}

function svg(body) {
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
		`\t${body}`,
		"</svg>",
		"",
	].join("\n");
}

export function buildIcons() {
	const bodies = designBodies();
	const used = new Set();
	const built = {};
	for (const body of bodies) {
		const name = nameFor(body);
		if (used.has(name)) {
			throw new Error(`Icon name ${name} is used twice.`);
		}
		used.add(name);
		built[`${name}.svg`] = svg(body);
	}
	return built;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const dir = join(root, "apps/web/src/design/icons");
	mkdirSync(dir, { recursive: true });
	const built = buildIcons();
	for (const [name, text] of Object.entries(built)) {
		writeFileSync(join(dir, name), text);
	}
	console.log(`icons ${Object.keys(built).length}`);
}

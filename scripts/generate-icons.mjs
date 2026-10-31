import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// One file per drawing. Repeated sizes and stroke colours in the design share a file.
// Two check paths and two chevron paths draw the same icon, so each keeps the 1.5 path.
const icons = [
	["agent", '<rect x="3" y="5" width="10" height="8" rx="2"></rect><path d="M8 2.5V5M6 9h0M10 9h0"></path>'],
	["arrow-right", '<path d="M3 8h10M9 4l4 4-4 4"></path>'],
	["arrow-up", '<path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"></path>'],
	[
		"chat",
		'<path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z"></path>',
	],
	["check", '<path d="M2.5 8.5 6 12l7.5-8"></path>'],
	["chevron-left", '<path d="M10 3 5 8l5 5"></path>'],
	["close", '<path d="M4 4l8 8M12 4l-8 8"></path>'],
	["cube", '<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"></path><path d="M2.5 5 8 8l5.5-3M8 8v6.2"></path>'],
	[
		"flow",
		'<circle cx="8" cy="3.5" r="1.8"></circle><circle cx="3" cy="12.5" r="1.8"></circle><circle cx="13" cy="12.5" r="1.8"></circle><path d="M7 5 4 11M9 5l3 6M4.8 12.5h6.4"></path>',
	],
	[
		"grid",
		'<rect x="2" y="2" width="5" height="5" rx="1"></rect><rect x="9" y="2" width="5" height="5" rx="1"></rect><rect x="2" y="9" width="5" height="5" rx="1"></rect><rect x="9" y="9" width="5" height="5" rx="1"></rect>',
	],
	["house", '<path d="M2.5 13.5v-8l5.5-3 5.5 3v8"></path><path d="M2.5 13.5h11M6.5 13.5v-4h3v4"></path>'],
	["info", '<circle cx="8" cy="8" r="6"></circle><path d="M8 7v4M8 5h0"></path>'],
	["mail", '<path d="M2.5 4.5h11v8h-11z"></path><path d="M2.5 5l5.5 4 5.5-4"></path>'],
	[
		"people",
		'<circle cx="5.5" cy="5.5" r="2.5"></circle><circle cx="11" cy="6.5" r="2"></circle><path d="M1.5 13.5c.5-2.2 2-3.5 4-3.5s3.5 1.3 4 3.5M10 10.2c1.8 0 3.2 1.2 3.6 3.3"></path>',
	],
	["plus", '<path d="M8 2.5v11M2.5 8h11"></path>'],
	[
		"server",
		'<rect x="2" y="3" width="12" height="4" rx="1"></rect><rect x="2" y="9" width="12" height="4" rx="1"></rect><path d="M5 5h0M5 11h0"></path>',
	],
	[
		"sliders",
		'<path d="M2.5 4h7M12.5 4h1M2.5 8h2M7.5 8h6M2.5 12h5M10.5 12h3"></path><circle cx="11" cy="4" r="1.5"></circle><circle cx="6" cy="8" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle>',
	],
	["store", '<path d="M2.5 6.5 8 2.5l5.5 4v7h-11z"></path><path d="M6.5 13.5v-4h3v4"></path>'],
	["table", '<rect x="2" y="3" width="12" height="10" rx="2"></rect><path d="M2 7h12M6 7v6"></path>'],
];

function svg(body) {
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
		`\t${body}`,
		"</svg>",
		"",
	].join("\n");
}

export function buildIcons() {
	return Object.fromEntries(icons.map(([name, body]) => [`${name}.svg`, svg(body)]));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const dir = join(root, "apps/web/src/design/icons");
	mkdirSync(dir, { recursive: true });
	for (const [name, text] of Object.entries(buildIcons())) {
		writeFileSync(join(dir, name), text);
	}
	console.log(`icons ${icons.length}`);
}

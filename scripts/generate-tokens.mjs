import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Answer 14. These spellings are the custom property values.
const REQUIRED = [
	"#c9c9c9",
	"#3a3a3a",
	"rgba(252,252,252,.9)",
	"rgba(255,255,255,.14)",
	"rgba(0,0,0,.2)",
	"rgba(0,0,0,.12)",
	"rgba(13,13,13,.24)",
	"#0169cc33",
	"rgba(1,105,204,.08)",
	"#95bf47",
	"#7f54b3",
	"#ff9900",
	"#f1641e",
	"#fde2f3",
	"#e5e9f0",
];

const BRIEF = [
	["Page background", "#f3f3f3"],
	["Surface", "#fcfcfc"],
	["Surface border", "#ededed"],
	["Card", "#fff"],
	["Card ring", "rgba(13,13,13,.08)"],
	["Inset", "#f9f9f9"],
	["Primary", "#181818"],
	["Primary hover", "#000"],
	["Primary text", "#fff"],
	["Soft button", "rgba(13,13,13,.08)"],
	["Soft button hover", "rgba(13,13,13,.12)"],
	["Heading", "#0d0d0d"],
	["Body", "#282828"],
	["Nav", "#414141"],
	["Secondary", "#5d5d5d"],
	["Muted", "#8f8f8f"],
	["Link", "#0169cc"],
	["Link hover", "#004f99"],
	["Green surface", "#04b84c14"],
	["Green text", "#00692a"],
	["Green dot", "#00a240"],
	["Blue surface", "#0285ff14"],
	["Blue text", "#004f99"],
	["Purple surface", "#924ff714"],
	["Purple text", "#532d8d"],
	["Orange surface", "#fb6a2214"],
	["Orange text", "#923b0f"],
	["Red surface", "#fa423e14"],
	["Red text", "#911e1b"],
	["Orders tint", "#e7efff"],
	["Support tint", "#def5ee"],
	["Marketing tint", "#ece3ff"],
	["Finance tint", "#ffefa4"],
	["Inventory tint", "#fee7c2"],
	["Card radius", "16px"],
	["KPI and inset radius", "12px"],
	["Primary radius", "999px"],
	["Body tracking", "-0.01em"],
	["Heading tracking", "-0.02em"],
	["Tight heading tracking", "-0.035em"],
	["Workspace body size", "14px"],
	["Workspace body line", "20px"],
	["Public body size", "15px"],
	["Public body line", "22px"],
	["Workspace h1 size", "28px"],
	["Workspace h1 line", "34px"],
	["Hero size", "64px"],
	["Hero line", "68px"],
	["Section h2 size", "40px"],
	["Section h2 line", "46px"],
	["KPI value size", "24px"],
	["KPI value line", "30px"],
];

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const SKIP_VALUES = new Set(["none", "transparent", "inherit", "initial", "currentcolor"]);

function hexColorKey(input) {
	let digits = input;
	if ([3, 4].includes(digits.length)) {
		digits = [...digits].map((part) => part + part).join("");
	}
	if (![6, 8].includes(digits.length)) {
		return null;
	}
	const red = Number.parseInt(digits.slice(0, 2), 16);
	const green = Number.parseInt(digits.slice(2, 4), 16);
	const blue = Number.parseInt(digits.slice(4, 6), 16);
	const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
	return `${red},${green},${blue},${Math.round(alpha * 10000) / 10000}`;
}

function colorKey(raw) {
	const text = raw.trim().toLowerCase().replace(/\s+/g, "");
	const hex = text.match(/^#([0-9a-f]{3,8})$/);
	if (hex) {
		return hexColorKey(hex[1]);
	}
	const channels = text.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
	if (!channels) {
		return null;
	}
	const alpha = channels[4] === undefined ? 1 : Number(channels[4]);
	return `${channels[1]},${channels[2]},${channels[3]},${Math.round(alpha * 10000) / 10000}`;
}

function flat(value) {
	return String(value).trim().replace(/\s+/g, " ");
}

function cssValue(value) {
	return flat(value).replace(/\{([a-z0-9-]+)\}/g, "var(--$1)");
}

function slug(value) {
	return flat(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function lightValue(value) {
	if (value && typeof value === "object" && "light" in value) {
		return value.light;
	}
	return value;
}

function addValue(set, value) {
	if (typeof value === "number") {
		set.add(String(value));
		return;
	}
	if (typeof value === "string") {
		set.add(flat(value));
	}
}

function declare(lines, name, value) {
	lines.push(`\t--${name}: ${cssValue(value)};`);
}

function readDesignFiles() {
	return readdirSync(join(root, "design"))
		.filter((name) => name.endsWith(".dc.html"))
		.sort()
		.map((name) => ({ name, text: readFileSync(join(root, "design", name), "utf8") }));
}

function addColor(byKey, raw, fileName) {
	const key = colorKey(raw);
	if (!key) {
		return;
	}
	const entry = byKey.get(key) ?? { counts: new Map(), files: new Set() };
	entry.counts.set(raw, (entry.counts.get(raw) ?? 0) + 1);
	entry.files.add(fileName);
	byKey.set(key, entry);
}

function collectColors(files) {
	const byKey = new Map();
	for (const file of files) {
		for (const match of file.text.matchAll(COLOR_RE)) {
			addColor(byKey, match[0], file.name);
		}
	}
	return byKey;
}

function chooseSpelling(entry) {
	for (const required of REQUIRED) {
		if (entry.counts.has(required)) {
			return required;
		}
	}
	return [...entry.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

const declarationValidators = new Map([
	["box-shadow", (value) => /^(inset\s+)?0\b/.test(value) && value.includes("px") && !/['"]/.test(value)],
	["border-radius", (value) => /^(\d+px|0)( (\d+px|0)){0,3}$/.test(value)],
	["font-size", (value) => /^\d+(\.\d+)?px$/.test(value)],
	["line-height", (value) => /^\d+(\.\d+)?px$/.test(value)],
	["letter-spacing", (value) => /^-?\d*\.?\d+em$/.test(value)],
	["font-weight", (value) => /^[1-9]00$/.test(value)],
	["font-family", (value) => !/['+]/.test(value) || value.includes("JetBrains")],
]);

function acceptDeclaration(property, raw) {
	const important = /!important\s*$/i.test(raw.trim());
	const value = flat(raw).replace(/\s*!important\s*$/i, "");
	if (value.length === 0 || /{{|[+?]/.test(value)) {
		return null;
	}
	return validateDeclaration(property, value, important);
}

function validateDeclaration(property, value, important) {
	if (SKIP_VALUES.has(value.toLowerCase())) {
		return null;
	}
	const validate = declarationValidators.get(property) ?? (() => false);
	return validate(value) ? { value, important } : null;
}

function addDeclaration(found, accepted, fileName) {
	if (!accepted) {
		return;
	}
	const entry = found.get(accepted.value) ?? { files: new Set(), important: false };
	entry.files.add(fileName);
	entry.important = entry.important || accepted.important;
	found.set(accepted.value, entry);
}

function collectDeclarations(files, property) {
	const found = new Map();
	const pattern = new RegExp(
		property === "font-family" ? `${property}:\\s*([^;}"]+)` : `${property}:\\s*([^;}'"]+)`,
		"gi",
	);
	for (const file of files) {
		for (const match of file.text.matchAll(pattern)) {
			const accepted = acceptDeclaration(property, match[1]);
			addDeclaration(found, accepted, file.name);
		}
	}
	return found;
}

function quotedShadows(files) {
	const found = new Map();
	for (const file of files) {
		for (const match of file.text.matchAll(/['"]((?:inset\s+)?0 [^'"]+)['"]/g)) {
			const accepted = acceptDeclaration("box-shadow", match[1]);
			if (accepted) {
				addDeclaration(found, { ...accepted, important: false }, file.name);
			}
		}
	}
	return found;
}

function rowsFrom(found, prefix) {
	return [...found.entries()]
		.map(([value, used]) => ({
			value,
			name: `${prefix}-${slug(value)}`,
			files: [...used.files].sort().map((file) => (used.important ? `${file} (important)` : file)),
		}))
		.sort((a, b) => a.value.localeCompare(b.value));
}

function registerColor(colorNames, value, name) {
	const key = colorKey(value);
	if (key && !colorNames.has(key)) {
		colorNames.set(key, name);
	}
}

function appendBaseColors(tokens, css, colorNames) {
	for (const token of tokens.color.tokens) {
		const value = lightValue(token.value);
		declare(css, token.name, value);
		registerColor(colorNames, String(value), token.name);
	}
}

function appendTypeTokens(tokens, css) {
	declare(css, "font-sans", tokens.type.families.sans);
	declare(css, "font-mono", tokens.type.families.mono);

	for (const group of tokens.type.groups) {
		for (const style of group.styles) {
			declare(css, `${style.name}-size`, style.fontSize);
			declare(css, `${style.name}-line`, style.lineHeight);
			declare(css, `${style.name}-weight`, style.fontWeight);
			declare(css, `${style.name}-tracking`, style.letterSpacing);
		}
	}
}

function appendSimpleTokens(tokens, css) {
	for (const group of [tokens.spacing, tokens.radius, tokens.easing, tokens.duration]) {
		for (const token of group.tokens) {
			declare(css, token.name, token.value);
		}
	}
}

function appendShadowTokens(tokens, css, colorNames) {
	for (const token of tokens.shadow.tokens) {
		const value = lightValue(token.value);
		declare(css, token.name, value);
		for (const match of String(value).matchAll(COLOR_RE)) {
			registerColor(colorNames, match[0], token.name);
		}
	}
}

function addTypeValues(sets, groups) {
	for (const group of groups) {
		for (const style of group.styles) {
			addValue(sets["font-size"], style.fontSize);
			addValue(sets["line-height"], style.lineHeight);
			addValue(sets["font-weight"], style.fontWeight);
			addValue(sets["letter-spacing"], style.letterSpacing);
		}
	}
}

function tokenSets(tokens) {
	const sets = {
		radius: new Set(),
		shadow: new Set(),
		"font-size": new Set(),
		"line-height": new Set(),
		"letter-spacing": new Set(),
		"font-weight": new Set(),
		"font-family": new Set(),
	};
	for (const token of tokens.radius.tokens) {
		addValue(sets.radius, token.value);
	}
	for (const token of tokens.shadow.tokens) {
		addValue(sets.shadow, lightValue(token.value));
	}
	addValue(sets["font-family"], tokens.type.families.sans);
	addValue(sets["font-family"], tokens.type.families.mono);
	addTypeValues(sets, tokens.type.groups);
	return sets;
}

function inlineColorRows(files, colorNames) {
	const colors = collectColors(files);
	const colorRows = [];
	for (const [key, entry] of colors) {
		const value = chooseSpelling(entry);
		// --alpha-20 is #0d0d0d33. That is the same colour as rgba(13,13,13,.2).
		// The traffic design writes the rgba spelling, so the override list keeps that name.
		if (colorNames.has(key) && value !== "rgba(13,13,13,.2)") {
			continue;
		}
		const name = `color-${slug(value)}`;
		colorRows.push({ value, name, files: [...entry.files].sort() });
	}
	colorRows.sort((a, b) => a.value.localeCompare(b.value));
	return colorRows;
}

function mergeUsage(entry, used) {
	for (const file of used.files) {
		entry.files.add(file);
	}
	entry.important = entry.important || used.important;
}

function mergeFound(target, extra) {
	for (const [value, used] of extra) {
		const entry = target.get(value) ?? { files: new Set(), important: false };
		mergeUsage(entry, used);
		target.set(value, entry);
	}
}

function addBuiltDeclaration(found, match, property, fileName) {
	if (match[1] !== property) {
		return;
	}
	for (const tail of [match[3], match[4]]) {
		addDeclaration(found, acceptDeclaration(property, match[2] + tail), fileName);
	}
}

// A script joins a prefix to one of two quoted tails. The joined value is the token.
function builtDeclarations(files, property) {
	const found = new Map();
	const pattern =
		/(box-shadow|border-radius|font-size|line-height):\s*([^'"+]*)['"]\s*\+\s*\((?:[^)]*)\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]\)/g;
	for (const file of files) {
		for (const match of file.text.matchAll(pattern)) {
			addBuiltDeclaration(found, match, property, file.name);
		}
	}
	return found;
}

function inlineShadowRows(files, shadowSet) {
	const shadows = collectDeclarations(files, "box-shadow");
	mergeFound(shadows, quotedShadows(files));
	mergeFound(shadows, builtDeclarations(files, "box-shadow"));
	return rowsFrom(shadows, "shadow").filter((row) => !shadowSet.has(row.value));
}

function inlineTypeRows(files, sets) {
	const typeRows = [];
	for (const property of ["font-size", "line-height", "letter-spacing", "font-weight", "font-family"]) {
		const found = collectDeclarations(files, property);
		if (property === "font-size" || property === "line-height") {
			mergeFound(found, builtDeclarations(files, property));
		}
		const known = sets[property];
		const rows = rowsFrom(found, property).filter(
			(row) => !known.has(row.value) && !known.has(row.value.replaceAll('"', "")),
		);
		typeRows.push(...rows.map((row) => ({ ...row, property })));
	}
	typeRows.sort((a, b) => a.property.localeCompare(b.property) || a.value.localeCompare(b.value));
	return typeRows;
}

function appendOverrides(css, overrides) {
	const names = new Set();
	overrides.forEach((row) => {
		if (names.has(row.name)) {
			throw new Error(`Duplicate custom property --${row.name}`);
		}
		names.add(row.name);
	});
	if (overrides.length > 0) {
		css.push("\t/* Inline values. See apps/web/src/design/OVERRIDES.md. */");
		for (const row of overrides) {
			declare(css, row.name, row.value);
		}
	}
}

function briefCategory(label) {
	const categories = [
		["radius", "radius"],
		["tracking", "letter-spacing"],
		["size", "font-size"],
		["line", "line-height"],
	];
	return categories.find(([suffix]) => label.endsWith(suffix))?.[1] ?? null;
}

function briefToken(label, value, colorNames, sets) {
	const key = colorKey(value);
	if (key) {
		return colorNames.get(key);
	}
	const category = briefCategory(label);
	return category && sets[category].has(value) ? "value" : undefined;
}

function missingBriefRows(colorNames, sets) {
	return BRIEF.map(([label, value]) => ({
		label,
		value,
		token: briefToken(label, value, colorNames, sets) ?? null,
	})).filter((row) => row.token === null);
}

function requiredColorResult(value, colorNames, colorRows) {
	const key = colorKey(value);
	const token = key ? colorNames.get(key) : undefined;
	const added = colorRows.find((row) => row.value === value || colorKey(row.value) === key);
	const result = token
		? `already \`--${token}\``
		: added
			? `added \`--${added.name}\``
			: "missing from the design files";
	return result;
}

function renderOverrides({ colorRows, radii, shadowRows, typeRows, briefRows, colorNames }) {
	const lines = [
		"# Design token overrides",
		"",
		"The base is the light theme in `design/ds/agent-ui/tokens.json`.",
		"Each row is an inline or script-built value from `design/*.dc.html` that is not a light token of the same category.",
		"A spacing token does not hide a radius, a font size, or a line height that uses the same pixels.",
		"A script that joins two strings is included. The joined value is the token, not each half.",
		"`docs/BRIEF.md` says the inline value wins. `apps/web/src/design/tokens.css` adds one custom property for each row.",
		"Dark theme values are not copied. `transparent` and `none` are CSS keywords and are not tokens.",
		"",
		"## Colours",
		"",
		"| Value | Custom property | Files |",
		"| --- | --- | --- |",
		...colorRows.map((row) => `| \`${row.value}\` | \`--${row.name}\` | ${row.files.join(", ")} |`),
		"",
		"## Radius",
		"",
		"| Value | Custom property | Files |",
		"| --- | --- | --- |",
		...radii.map((row) => `| \`${row.value}\` | \`--${row.name}\` | ${row.files.join(", ")} |`),
		"",
		"## Shadow",
		"",
		"| Value | Custom property | Files |",
		"| --- | --- | --- |",
		...shadowRows.map((row) => `| \`${row.value}\` | \`--${row.name}\` | ${row.files.join(", ")} |`),
		"",
		"## Type",
		"",
		"| Value | Custom property | Files |",
		"| --- | --- | --- |",
		...typeRows.map((row) => `| \`${row.value}\` | \`--${row.name}\` | ${row.files.join(", ")} |`),
		"",
		"## Brief values that are not a light token",
		"",
		"These are the `docs/BRIEF.md` Design tokens rows whose value is not a light token.",
		"An inline use of the same value is already in the tables above.",
		"",
		"| Brief row | Value |",
		"| --- | --- |",
		...briefRows.map((row) => `| ${row.label} | \`${row.value}\` |`),
		"",
		"## Required colours",
		"",
		"Answer 14 adds thirteen colours. Decision 27 adds the two proof-of-concept tints.",
		"",
		"| Value | Result |",
		"| --- | --- |",
	];
	for (const value of REQUIRED) {
		const result = requiredColorResult(value, colorNames, colorRows);
		lines.push(`| \`${value}\` | ${result} |`);
	}
	lines.push("");

	return lines;
}

export function buildTokens() {
	const tokens = JSON.parse(readFileSync(join(root, "design/ds/agent-ui/tokens.json"), "utf8"));
	const files = readDesignFiles();
	const sets = tokenSets(tokens);
	const colorNames = new Map();
	const css = [
		"/* Light theme from design/ds/agent-ui/tokens.json.",
		"   A token alias is written as var(--name).",
		"   The override block is every inline or script-built colour, radius, shadow, and type value",
		"   that is not a light token of the same category. A spacing token does not hide another category.",
		"   docs/BRIEF.md: those inline values win. Dark values are not copied. */",
		":root {",
	];

	appendBaseColors(tokens, css, colorNames);
	appendTypeTokens(tokens, css);
	appendSimpleTokens(tokens, css);
	appendShadowTokens(tokens, css, colorNames);

	const colorRows = inlineColorRows(files, colorNames);
	const radiiFound = collectDeclarations(files, "border-radius");
	mergeFound(radiiFound, builtDeclarations(files, "border-radius"));
	const radii = rowsFrom(radiiFound, "radius").filter((row) => !sets.radius.has(row.value));
	const shadowRows = inlineShadowRows(files, sets.shadow);
	const typeRows = inlineTypeRows(files, sets);

	const overrides = [...colorRows, ...radii, ...shadowRows, ...typeRows];
	appendOverrides(css, overrides);
	css.push("}", "");

	const briefRows = missingBriefRows(colorNames, sets);

	const lines = renderOverrides({ colorRows, radii, shadowRows, typeRows, briefRows, colorNames });

	return { css: css.join("\n"), overrides: lines.join("\n") };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const built = buildTokens();
	const dir = join(root, "apps/web/src/design");
	writeFileSync(join(dir, "tokens.css"), built.css);
	writeFileSync(join(dir, "OVERRIDES.md"), built.overrides);
	console.log(`tokens.css ${built.css.split("\n").length} lines`);
	console.log(`OVERRIDES.md ${built.overrides.split("\n").length} lines`);
}

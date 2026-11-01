// design-inventory: lists everything in a design file that the build must reproduce.
// For each .dc.html under design/ it writes design/inventory/<name>.json with:
//   texts     every visible text string in the markup, in document order
//   styles    every inline style declaration, with a count
//   colors    every colour value found in styles and in the script
//   handlers  every control and the handler it calls (onClick, onChange)
//   templates every {{hole}} used in the markup
//   loops     every <sc-for> list and <sc-if> value
//   links     every href
//   strings   every string literal in the script (mock data, copy, keys)
//   keys      every object key used in the script (data field names)
//   props     the data-props declaration
// Nothing is read by eye. A build is complete when its own inventory has the same texts,
// handlers, loops and strings. The reviewer compares the two files.
// Run: node scripts/design-inventory.mjs            (all files)
//      node scripts/design-inventory.mjs Home       (one file)
//      node scripts/design-inventory.mjs --html FILE --out FILE.json
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const designDir = resolve(root, "design");
const outDir = resolve(designDir, "inventory");

const count = (list) => {
	const m = new Map();
	for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
	return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};
const uniq = (list) => [...new Set(list)];
const decode = (s) =>
	s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/\s+/g, " ")
		.trim();

function extractTexts(body, pattern) {
	return [...body.matchAll(pattern)].map((m) => decode(m[1])).filter((t) => t.length > 0);
}

export function designInventory(file, src) {
	const markup = (src.match(/<x-dc>([\s\S]*?)<\/x-dc>/) ?? ["", ""])[1];
	const script = (src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) ?? ["", ""])[1];
	const props = (src.match(/data-props='([^']*)'/) ?? ["", "{}"])[1];

	const body = markup.replace(/<helmet>[\s\S]*?<\/helmet>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
	const texts = extractTexts(body, />([^<>{}]+?)</g);
	const attrTexts = [...body.matchAll(/\b(placeholder|aria-label|alt|title)="([^"{}]+)"/g)].map(
		(m) => `${m[1]}: ${decode(m[2])}`,
	);

	const styles = [...body.matchAll(/style="([^"]*)"/g)]
		.flatMap((m) => m[1].split(";"))
		.map((d) => d.trim())
		.filter((d) => d.length > 0 && !d.includes("{{"));

	const colors = uniq([...(body + script).matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]));

	const handlers = [
		...body.matchAll(/<(button|a|input|textarea|select)\b[^>]*?\b(onClick|onChange)="\{\{([^}]+)\}\}"[^>]*>/g),
	].map((m) => ({
		tag: m[1],
		event: m[2],
		handler: m[3],
	}));
	const templates = uniq([...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim()));
	const loops = [
		...[...body.matchAll(/<sc-for list="\{\{([^}]+)\}\}" as="([^"]+)"/g)].map((m) => ({
			kind: "for",
			list: m[1],
			as: m[2],
		})),
		...[...body.matchAll(/<sc-if value="\{\{([^}]+)\}\}"/g)].map((m) => ({ kind: "if", value: m[1] })),
	];
	const links = uniq([...body.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));

	const strings = [...script.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
		.map((m) => m[1].replace(/\\'/g, "'"))
		.filter((s) => s.length > 0);
	const keys = uniq([...script.matchAll(/(?:\{|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]));
	const imports = [...markup.matchAll(/<dc-import\b([^>]*)>/g)].map((m) => m[1].trim());

	return {
		file,
		counts: {
			texts: texts.length,
			styles: styles.length,
			colors: colors.length,
			handlers: handlers.length,
			loops: loops.length,
			strings: strings.length,
		},
		imports,
		props: JSON.parse(props),
		texts,
		attrTexts,
		templates,
		loops,
		handlers,
		links,
		styles: count(styles),
		colors,
		strings: count(strings),
		keys,
	};
}

function visibleHtml(html) {
	return html
		.replace(/<head[\s\S]*?<\/head>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<svg[\s\S]*?<\/svg>/gi, "")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "");
}

function controlText(html, tag) {
	return tag === "input" ? "" : decode(html.replace(/<[^>]*>/g, " "));
}

export function inventoryHtml(html) {
	const body = visibleHtml(html);
	const texts = extractTexts(body, />([^<]+?)</g);
	const handlers = [];
	const loops = [];
	for (const tag of body.matchAll(/<(button|a|input|textarea|select)\b([^>]*)>/g)) {
		const name = tag[2].match(/\bdata-handler="([^"]+)"/);
		if (!name) continue;
		const control = tag[1];
		handlers.push({
			tag: control,
			event:
				tag[2].match(/\bdata-event="([^"]+)"/)?.[1] ??
				(control === "input" || control === "textarea" || control === "select" ? "onChange" : "onClick"),
			handler: name[1],
			text: controlText(body.slice(tag.index + tag[0].length).split(`</${control}>`)[0], control),
		});
	}
	for (const tag of body.matchAll(/<[^>]+>/g)) {
		const list = tag[0].match(/\bdata-loop="([^"]+)"/);
		const as = tag[0].match(/\bdata-loop-as="([^"]+)"/);
		if (list && as) loops.push({ kind: "for", list: list[1], as: as[1] });
		const condition = tag[0].match(/\bdata-if="([^"]+)"/);
		if (condition) loops.push({ kind: "if", value: condition[1] });
	}
	const links = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
		text: controlText(m[2], "a"),
		href: decode(m[1]),
	}));
	return { texts, handlers, loops, links, strings: {} };
}

function occurrenceDiff(expected, actual) {
	const remaining = [...actual];
	const missing = [];
	for (const item of expected) {
		const index = remaining.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item));
		if (index === -1) missing.push(item);
		else remaining.splice(index, 1);
	}
	return { extra: remaining, missing };
}

export function compareInventory(design, built) {
	const texts = occurrenceDiff(design.texts ?? [], built.texts ?? []);
	const links = occurrenceDiff(design.links ?? [], built.links ?? []);
	const handlers = occurrenceDiff(design.handlers ?? [], built.handlers ?? []);
	const loops = occurrenceDiff(design.loops ?? [], built.loops ?? []);
	return {
		extraTexts: texts.extra,
		missingTexts: texts.missing,
		extraLinks: links.extra,
		missingLinks: links.missing,
		extraHandlers: handlers.extra,
		missingHandlers: handlers.missing,
		extraLoops: loops.extra,
		missingLoops: loops.missing,
	};
}

function writeDesignInventories(only) {
	mkdirSync(outDir, { recursive: true });
	const files = readdirSync(designDir).filter((f) => f.endsWith(".dc.html") && (!only || f.startsWith(only)));
	for (const file of files) {
		const src = readFileSync(resolve(designDir, file), "utf8");
		const inventory = designInventory(file, src);
		const out = resolve(outDir, file.replace(".dc.html", ".json"));
		writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
		console.log(
			`${file}: ${inventory.texts.length} texts, ${Object.keys(inventory.styles).length} style declarations, ${inventory.colors.length} colours, ${inventory.handlers.length} handlers, ${inventory.strings.length === undefined ? 0 : Object.values(inventory.strings).reduce((sum, n) => sum + n, 0)} script strings -> ${out.replace(`${root}/`, "")}`,
		);
	}
}

function writeHtmlInventory(args) {
	const file = args[1];
	const outFlag = args.indexOf("--out");
	const html = readFileSync(resolve(file), "utf8");
	const json = `${JSON.stringify(inventoryHtml(html), null, 2)}\n`;
	if (outFlag === -1) {
		process.stdout.write(json);
		return;
	}
	writeFileSync(resolve(args[outFlag + 1]), json);
}

const invoked = import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
	const args = process.argv.slice(2);
	if (args[0] === "--html") writeHtmlInventory(args);
	else writeDesignInventories(args[0]);
}

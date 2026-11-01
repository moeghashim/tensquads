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
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const designDir = resolve(root, "design");
const outDir = resolve(designDir, "inventory");
mkdirSync(outDir, { recursive: true });

const only = process.argv[2];
const files = readdirSync(designDir).filter((f) => f.endsWith(".dc.html") && (!only || f.startsWith(only)));

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
		.replace(/\s+/g, " ")
		.trim();

for (const file of files) {
	const src = readFileSync(resolve(designDir, file), "utf8");
	const markup = (src.match(/<x-dc>([\s\S]*?)<\/x-dc>/) ?? ["", ""])[1];
	const script = (src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) ?? ["", ""])[1];
	const props = (src.match(/data-props='([^']*)'/) ?? ["", "{}"])[1];

	const body = markup.replace(/<helmet>[\s\S]*?<\/helmet>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
	const texts = [...body.matchAll(/>([^<>{}]+?)</g)].map((m) => decode(m[1])).filter((t) => t.length > 0);
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

	const inventory = {
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
	const out = resolve(outDir, file.replace(".dc.html", ".json"));
	writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(
		`${file}: ${texts.length} texts, ${Object.keys(inventory.styles).length} style declarations, ${colors.length} colours, ${handlers.length} handlers, ${strings.length} script strings -> ${out.replace(`${root}/`, "")}`,
	);
}

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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

const linkMap = {
	"Home.dc.html": "/",
	"SignIn.dc.html": "/signin",
	"Onboarding.dc.html": "/signup",
	"Main.dc.html": "/overview",
	"Chat.dc.html": "/chat",
};

function designInventory(file, src) {
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

export function inventoryHtml(html) {
	const body = visibleHtml(html);
	const texts = [...body.matchAll(/>([^<>{}]+?)</g)].map((m) => decode(m[1])).filter((t) => t.length > 0);
	const handlers = [];
	const loops = [];
	for (const tag of body.matchAll(/<(button|a|input|textarea|select)\b([^>]*)>/g)) {
		const name = tag[2].match(/\bdata-handler="([^"]+)"/);
		if (!name) continue;
		const control = tag[1];
		handlers.push({
			tag: control,
			event: control === "input" || control === "textarea" || control === "select" ? "onChange" : "onClick",
			handler: name[1],
		});
	}
	for (const tag of body.matchAll(/<[^>]+>/g)) {
		const list = tag[0].match(/\bdata-loop="([^"]+)"/);
		const as = tag[0].match(/\bdata-loop-as="([^"]+)"/);
		if (list && as) loops.push({ kind: "for", list: list[1], as: as[1] });
		const condition = tag[0].match(/\bdata-if="([^"]+)"/);
		if (condition) loops.push({ kind: "if", value: condition[1] });
	}
	const links = uniq([...body.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1]));
	return { texts, handlers, loops, links, strings: {} };
}

function loopKey(loop) {
	return loop.kind === "if" ? `if\u0000${loop.value}` : `for\u0000${loop.list}\u0000${loop.as}`;
}

function loopFromKey(key) {
	const [kind, a, b] = key.split("\u0000");
	return kind === "if" ? { kind, value: a } : { kind, list: a, as: b };
}

function loopCounts(loops) {
	const counts = new Map();
	for (const loop of loops) counts.set(loopKey(loop), (counts.get(loopKey(loop)) ?? 0) + 1);
	return counts;
}

function loopDiff(designLoops, builtLoops) {
	const design = loopCounts(designLoops ?? []);
	const built = loopCounts(builtLoops ?? []);
	const extra = [];
	const missing = [];
	for (const key of new Set([...design.keys(), ...built.keys()])) {
		const gap = (built.get(key) ?? 0) - (design.get(key) ?? 0);
		const loop = loopFromKey(key);
		for (let i = 0; i < gap; i += 1) extra.push(loop);
		for (let i = 0; i < -gap; i += 1) missing.push(loop);
	}
	return { extra, missing };
}

export function mergeInventories(parts) {
	const texts = [];
	const seenText = new Set();
	const handlers = [];
	const seenHandler = new Set();
	const links = [];
	const seenLink = new Set();
	const loops = new Map();
	for (const part of parts) {
		for (const text of part.texts ?? []) {
			if (seenText.has(text)) continue;
			seenText.add(text);
			texts.push(text);
		}
		for (const handler of part.handlers ?? []) {
			if (seenHandler.has(handler.handler)) continue;
			seenHandler.add(handler.handler);
			handlers.push(handler);
		}
		for (const link of part.links ?? []) {
			if (seenLink.has(link)) continue;
			seenLink.add(link);
			links.push(link);
		}
		for (const [key, seen] of loopCounts(part.loops ?? [])) {
			loops.set(key, Math.max(loops.get(key) ?? 0, seen));
		}
	}
	const merged = [];
	for (const [key, seen] of loops) {
		const loop = loopFromKey(key);
		for (let i = 0; i < seen; i += 1) merged.push(loop);
	}
	return { texts, handlers, loops: merged, links, strings: {} };
}

function markupRuns(markup) {
	const body = markup.replace(/<helmet>[\s\S]*?<\/helmet>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
	const plain = body.replace(/\{\{[^}]+\}\}/g, "\u0000");
	const runs = [];
	for (const match of plain.matchAll(/>([^<]+)</g)) {
		for (const piece of match[1].split("\u0000")) {
			const text = decode(piece);
			if (text.length > 0) runs.push(text);
		}
	}
	return runs;
}

function scriptNumbers(script) {
	const numbers = new Set([...script.matchAll(/\b\d+\b/g)].map((match) => match[0]));
	for (const match of script.matchAll(/\[([^[\]]*)\]/g)) {
		const items = [...match[1].matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g)];
		const rest = match[1].replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "").replace(/[\s,]/g, "");
		if (items.length > 0 && rest.length === 0) numbers.add(String(items.length));
	}
	return numbers;
}

function designSources(design) {
	if (typeof design.file !== "string") return { runs: [], numbers: new Set() };
	const path = resolve(designDir, design.file);
	if (!existsSync(path)) return { runs: [], numbers: new Set() };
	const src = readFileSync(path, "utf8");
	const markup = (src.match(/<x-dc>([\s\S]*?)<\/x-dc>/) ?? ["", ""])[1];
	const script = (src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) ?? ["", ""])[1];
	return { runs: markupRuns(markup), numbers: scriptNumbers(script) };
}

function fragmentsOf(design, allow, runs) {
	const fragments = [...(design.texts ?? []), ...Object.keys(design.strings ?? {}), ...(allow.texts ?? []), ...runs];
	return [...new Set(fragments.map((item) => decode(item)).filter((item) => item.length > 0))].sort(
		(a, b) => b.length - a.length,
	);
}

function hasText(joined, item) {
	let from = 0;
	while (from <= joined.length) {
		const at = joined.indexOf(item, from);
		if (at === -1) return false;
		const before = at === 0 ? "" : joined[at - 1];
		const after = joined[at + item.length] ?? "";
		const edge = (char) => char === "" || !/[0-9A-Za-z]/.test(char);
		if (edge(before) && edge(after)) return true;
		from = at + 1;
	}
	return false;
}

function covered(text, fragments, numbers) {
	if (fragments.includes(text)) return true;
	let rest = text;
	for (const fragment of fragments) {
		if (fragment.length < 2 || !rest.includes(fragment)) continue;
		rest = rest.split(fragment).join(" ");
	}
	for (const fragment of fragments) {
		if (fragment.length !== 1 || /[0-9A-Za-z]/.test(fragment) || !rest.includes(fragment)) continue;
		rest = rest.split(fragment).join(" ");
	}
	rest = rest.replace(/\s+/g, " ").trim();
	if (rest.length === 0) return true;
	return rest.split(" ").every((token) => /^\d+$/.test(token) && numbers.has(token));
}

function namesOf(handlers) {
	return uniq((handlers ?? []).map((item) => item.handler));
}

export function compareInventory(design, built, allow = {}) {
	const sources = designSources(design);
	const fragments = fragmentsOf(design, allow, sources.runs);
	const builtTexts = (built.texts ?? []).map((item) => decode(item)).filter((item) => item.length > 0);
	const joined = decode(builtTexts.join(" "));
	const extraTexts = builtTexts.filter((text) => !covered(text, fragments, sources.numbers));
	const missingTexts = [];
	const seenText = new Set();
	for (const text of design.texts ?? []) {
		const item = decode(text);
		if (item.length === 0 || seenText.has(item)) continue;
		seenText.add(item);
		if (!hasText(joined, item)) missingTexts.push(item);
	}
	const allowedLinks = new Set(allow.links ?? []);
	const mapped = [];
	const seenMapped = new Set();
	for (const href of design.links ?? []) {
		if (allowedLinks.has(href)) continue;
		const target = linkMap[href] ?? href;
		if (seenMapped.has(target)) continue;
		seenMapped.add(target);
		mapped.push(target);
	}
	const builtLinks = uniq(built.links ?? []);
	const builtLinkSet = new Set(builtLinks);
	const missingLinks = mapped.filter((href) => !builtLinkSet.has(href));
	const extraLinks = builtLinks.filter((href) => !seenMapped.has(href));
	const designNames = namesOf(design.handlers);
	const builtNames = namesOf(built.handlers);
	const allowedHandlers = new Set(allow.handlers ?? []);
	const designNameSet = new Set(designNames);
	const builtNameSet = new Set(builtNames);
	const missingHandlers = designNames.filter((name) => !builtNameSet.has(name));
	const extraHandlers = builtNames.filter((name) => !designNameSet.has(name) && !allowedHandlers.has(name));
	const handlerTags = [];
	for (const name of designNames) {
		const designTag = (design.handlers ?? []).find((item) => item.handler === name)?.tag;
		const builtTag = (built.handlers ?? []).find((item) => item.handler === name)?.tag;
		if (designTag && builtTag && designTag !== builtTag)
			handlerTags.push({ handler: name, design: designTag, built: builtTag });
	}
	const loops = loopDiff(design.loops, built.loops);
	return {
		extraTexts,
		missingTexts,
		extraLinks,
		missingLinks,
		extraHandlers,
		missingHandlers,
		extraLoops: loops.extra,
		missingLoops: loops.missing,
		handlerTags,
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

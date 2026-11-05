function skipSpace(text: string, index: number): number {
	let cursor = index;
	while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
	return cursor;
}

function readName(text: string, index: number): { readonly name: string; readonly index: number } {
	const start = index;
	let cursor = index;
	while (cursor < text.length && /[A-Za-z0-9_:-]/.test(text[cursor] ?? "")) cursor += 1;
	return { name: text.slice(start, cursor).toLowerCase(), index: cursor };
}

function readValue(text: string, index: number): { readonly value: string; readonly index: number } {
	const quote = text[index] ?? "";
	if (quote === '"' || quote === "'") {
		const end = text.indexOf(quote, index + 1);
		if (end < 0) return { value: text.slice(index + 1), index: text.length };
		return { value: text.slice(index + 1, end), index: end + 1 };
	}
	let cursor = index;
	while (cursor < text.length && !/\s/.test(text[cursor] ?? "")) cursor += 1;
	return { value: text.slice(index, cursor), index: cursor };
}

function attributeValue(tag: string, name: string): string | null {
	const text = tag.endsWith(">") ? tag.slice(0, -1) : tag;
	let index = text.startsWith("<") ? 1 : 0;
	index = readName(text, skipSpace(text, index)).index;
	const wanted = name.toLowerCase();
	while (index < text.length) {
		index = skipSpace(text, index);
		if (index >= text.length) break;
		const key = readName(text, index);
		if (key.name.length === 0) {
			index += 1;
			continue;
		}
		index = skipSpace(text, key.index);
		if ((text[index] ?? "") !== "=") continue;
		const read = readValue(text, skipSpace(text, index + 1));
		index = read.index;
		if (key.name === wanted) return read.value;
	}
	return null;
}

function resolveHref(href: string, previewUrl: string): string | null {
	if (href.length === 0 || href.startsWith("#")) return null;
	try {
		const url = new URL(href, previewUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.href;
	} catch {
		return null;
	}
}

export function pageLinks(html: string, previewUrl: string): string[] {
	const links: string[] = [];
	for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
		const href = attributeValue(match[0] ?? "", "href");
		if (href === null) continue;
		const resolved = resolveHref(href, previewUrl);
		if (resolved) links.push(resolved);
	}
	return links;
}

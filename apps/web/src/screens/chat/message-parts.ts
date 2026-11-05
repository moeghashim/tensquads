const URL_RE = /https?:\/\/[^\s<>"']+/g;

export type MessagePart =
	| { readonly kind: "text"; readonly value: string; readonly start: number }
	| { readonly kind: "link"; readonly href: string; readonly start: number };

export function messageParts(text: string): readonly MessagePart[] {
	const parts: MessagePart[] = [];
	let cursor = 0;
	for (const match of text.matchAll(URL_RE)) {
		const raw = match[0];
		const href = raw.replace(/[.,);]+$/u, "");
		const index = match.index ?? 0;
		if (index > cursor) parts.push({ kind: "text", value: text.slice(cursor, index), start: cursor });
		parts.push({ kind: "link", href, start: index });
		cursor = index + href.length;
	}
	if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor), start: cursor });
	if (parts.length === 0) return [{ kind: "text", value: text, start: 0 }];
	return parts;
}

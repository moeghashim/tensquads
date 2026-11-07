// The text a reader sees on a page, the way Scrapling reads it: tags removed,
// entities decoded, and one space between text nodes. No DOM library: this runs in the Worker.

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
	["amp", "&"],
	["lt", "<"],
	["gt", ">"],
	["quot", '"'],
	["apos", "'"],
	["nbsp", " "],
	["ndash", "–"],
	["mdash", "—"],
	["rsquo", "’"],
	["lsquo", "‘"],
	["ldquo", "“"],
	["rdquo", "”"],
	["hellip", "…"],
]);

// Comments, and script, style, noscript and template elements with their content, go first.
// An unclosed one runs to the end of the page, as an HTML parser reads it.
// Every other tag is a space. Alternatives match left to right, so a comment that opens first hides any script in it.
const SKIPPED_OR_TAG =
	/<!--[\s\S]*?(?:-->|$)|<(script|style|noscript|template)(?=[\s/>])[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<\/?[A-Za-z][^>]*>|<![^>]*>/gi;

// One pass only, so "&amp;lt;" becomes "&lt;" and not "<".
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g;

function decodeEntity(match: string, body: string): string {
	if (body.startsWith("#")) {
		const hex = body[1] === "x" || body[1] === "X";
		const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
	}
	return NAMED_ENTITIES.get(body) ?? match;
}

// Turns raw HTML into the page text. Runs of white space, including non-breaking spaces, become one space.
export function pageText(html: string): string {
	const withoutTags = html.replace(SKIPPED_OR_TAG, " ");
	const decoded = withoutTags.replace(ENTITY, decodeEntity);
	return decoded.replace(/\s+/g, " ").trim();
}

const WHITE_SPACE = /\s+/g;

// True when the text appears on the page. White space is ignored on both sides.
// Tags become spaces, so "<span>$</span>12" reads "$ 12" and still matches "$12".
// Text that is empty without its white space never counts as found.
export function pageHas(html: string, text: string): boolean {
	const wanted = text.replace(WHITE_SPACE, "");
	if (wanted.length === 0) return false;
	return pageText(html).replace(WHITE_SPACE, "").includes(wanted);
}

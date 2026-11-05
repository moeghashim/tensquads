const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

interface Frame {
	readonly name: string;
	readonly hidden: boolean;
}

function tagName(tag: string): string {
	const match = /^<\/?\s*([a-zA-Z0-9]+)/.exec(tag);
	return (match?.[1] ?? "").toLowerCase();
}

function concealed(tag: string, name: string): boolean {
	if (name === "script" || name === "style") return true;
	if (/(?:\s)hidden(?:=|\s|>|\/>)/i.test(tag)) return true;
	if (/\saria-hidden\s*=\s*(?:"true"|'true'|true)(?=[\s>/])/i.test(tag)) return true;
	const style = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
	const css = (style?.[1] ?? style?.[2] ?? "").toLowerCase().replace(/\s+/g, "");
	return css.includes("display:none") || css.includes("visibility:hidden");
}

function hiddenNow(stack: readonly Frame[]): boolean {
	return stack.some((frame) => frame.hidden);
}

function closeTag(stack: Frame[], name: string): void {
	for (let index = stack.length - 1; index >= 0; index -= 1) {
		if (stack[index]?.name !== name) continue;
		stack.splice(index, 1);
		return;
	}
}

function openTag(stack: Frame[], tag: string): void {
	const name = tagName(tag);
	if (name.length === 0 || VOID_TAGS.has(name) || tag.endsWith("/>")) return;
	stack.push({ name, hidden: hiddenNow(stack) || concealed(tag, name) });
}

function applyTag(stack: Frame[], tag: string): void {
	if (tag.startsWith("</")) {
		closeTag(stack, tagName(tag));
		return;
	}
	openTag(stack, tag);
}

function keepText(parts: string[], stack: readonly Frame[], text: string): void {
	if (text.length > 0 && !hiddenNow(stack)) parts.push(text);
}

function commentEnd(html: string, open: number): number {
	const end = html.indexOf("-->", open + 4);
	return end < 0 ? html.length : end + 3;
}

function readChunk(html: string, index: number, stack: Frame[], parts: string[]): number {
	const open = html.indexOf("<", index);
	if (open < 0) {
		keepText(parts, stack, html.slice(index));
		return html.length;
	}
	keepText(parts, stack, html.slice(index, open));
	if (html.startsWith("<!--", open)) return commentEnd(html, open);
	const close = html.indexOf(">", open + 1);
	if (close < 0) return html.length;
	applyTag(stack, html.slice(open, close + 1));
	return close + 1;
}

export function visibleText(html: string): string {
	const parts: string[] = [];
	const stack: Frame[] = [];
	let index = 0;
	while (index < html.length) index = readChunk(html, index, stack, parts);
	return parts.join("");
}

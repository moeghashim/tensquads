export interface RenderedPage {
	readonly visibleText: string;
	readonly cssContent: readonly string[];
	readonly linkTexts: readonly string[];
	readonly imageCount: number;
	readonly horizontalScroll: boolean;
	readonly keyboard: boolean;
	readonly contrast: boolean;
}

export function pageDocument(html: string): string {
	const start = html.trimStart().toLowerCase();
	if (start.startsWith("<!doctype") || start.startsWith("<html")) return html;
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>${html}</body></html>`;
}

interface Rgb {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

interface ElementLike {
	readonly tagName: string;
	readonly parentElement: ElementLike | null;
	readonly childNodes: ArrayLike<NodeLike>;
	readonly scrollWidth?: number;
	readonly clientWidth?: number;
	getAttribute(name: string): string | null;
	getBoundingClientRect(): { top: number; right: number; bottom: number; left: number; width: number; height: number };
}

interface NodeLike {
	readonly nodeType: number;
	readonly textContent: string | null;
}

interface Probe {
	texts: string[];
	cssContent: string[];
	linkTexts: string[];
	imageCount: number;
	keyboard: boolean;
	contrast: boolean;
}

declare const document: {
	readonly documentElement: ElementLike;
	readonly body: ElementLike;
	querySelectorAll(selector: string): ArrayLike<ElementLike>;
};
declare const window: { readonly innerHeight: number };
declare function getComputedStyle(
	element: ElementLike,
	pseudo?: string,
): { display: string; visibility: string; content: string; color: string; backgroundColor: string };

// Playwright and Puppeteer serialize this function alone. Nested functions travel with it.
export function collectRendered(): RenderedPage {
	const viewWidth = 390;

	function skipTag(el: ElementLike): boolean {
		return el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT";
	}

	function styleHidden(el: ElementLike): boolean {
		let node: ElementLike | null = el;
		while (node) {
			const style = getComputedStyle(node);
			if (style.display === "none" || style.visibility === "hidden") return true;
			node = node.parentElement;
		}
		return false;
	}

	function ariaHidden(el: ElementLike): boolean {
		let node: ElementLike | null = el;
		while (node) {
			if (node.getAttribute("aria-hidden") === "true") return true;
			node = node.parentElement;
		}
		return false;
	}

	function inView(el: ElementLike): boolean {
		const box = el.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) return false;
		return box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < viewWidth;
	}

	function interactive(el: ElementLike): boolean {
		if (el.tagName === "A" || el.tagName === "BUTTON" || el.tagName === "INPUT") return true;
		if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
		return el.getAttribute("tabindex") !== null;
	}

	function directText(el: ElementLike): string {
		let text = "";
		for (let index = 0; index < el.childNodes.length; index += 1) {
			const child = el.childNodes[index];
			if (child && child.nodeType === 3) text += child.textContent ?? "";
		}
		return text.replace(/\s+/g, " ").trim();
	}

	function unwrapContent(raw: string): string {
		if (raw === "none" || raw === "normal" || raw === '""' || raw === "''") return "";
		const quoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
		if (!quoted || raw.length < 2) return "";
		return raw.slice(1, -1);
	}

	function pushPseudo(el: ElementLike, state: Probe): void {
		for (const pseudo of ["::before", "::after"]) {
			const text = unwrapContent(getComputedStyle(el, pseudo).content);
			if (text.length > 0) state.cssContent.push(text);
		}
	}

	function parseColor(value: string): Rgb | null {
		const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(value);
		if (!match) return null;
		return {
			r: Number(match[1]),
			g: Number(match[2]),
			b: Number(match[3]),
			a: match[4] === undefined ? 1 : Number(match[4]),
		};
	}

	function channel(value: number): number {
		const scaled = value / 255;
		if (scaled <= 0.03928) return scaled / 12.92;
		return ((scaled + 0.055) / 1.055) ** 2.4;
	}

	function luminance(color: Rgb): number {
		return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
	}

	function backdrop(el: ElementLike): Rgb {
		let node: ElementLike | null = el;
		while (node) {
			const parsed = parseColor(getComputedStyle(node).backgroundColor);
			if (parsed && parsed.a > 0) return parsed;
			node = node.parentElement;
		}
		return { r: 255, g: 255, b: 255, a: 1 };
	}

	function contrastOk(el: ElementLike): boolean {
		const fore = parseColor(getComputedStyle(el).color);
		if (!fore) return false;
		const back = backdrop(el);
		const left = luminance(fore);
		const right = luminance(back);
		const lighter = Math.max(left, right);
		const darker = Math.min(left, right);
		return (lighter + 0.05) / (darker + 0.05) >= 4.5;
	}

	function noteUnreachable(el: ElementLike, state: Probe): void {
		if (interactive(el)) state.keyboard = false;
	}

	function noteVisible(el: ElementLike, state: Probe): void {
		const text = directText(el);
		if (text.length > 0) state.texts.push(text);
		if (el.tagName === "A" && text.length > 0) state.linkTexts.push(text);
		if (interactive(el) && el.getAttribute("tabindex") === "-1") state.keyboard = false;
		if (text.length > 0 && !contrastOk(el)) state.contrast = false;
	}

	function noteElement(el: ElementLike, state: Probe): void {
		if (skipTag(el) || styleHidden(el)) return;
		if (el.tagName === "IMG") state.imageCount += 1;
		pushPseudo(el, state);
		if (ariaHidden(el) || !inView(el)) {
			noteUnreachable(el, state);
			return;
		}
		noteVisible(el, state);
	}

	function scrollWide(el: ElementLike): boolean {
		return (el.scrollWidth ?? 0) > (el.clientWidth ?? 0);
	}

	const state: Probe = { texts: [], cssContent: [], linkTexts: [], imageCount: 0, keyboard: true, contrast: true };
	const nodes = document.querySelectorAll("body *");
	for (let index = 0; index < nodes.length; index += 1) {
		const el = nodes[index];
		if (el) noteElement(el, state);
	}
	return {
		visibleText: state.texts.join(" "),
		cssContent: state.cssContent,
		linkTexts: state.linkTexts,
		imageCount: state.imageCount,
		horizontalScroll: scrollWide(document.documentElement) || scrollWide(document.body),
		keyboard: state.keyboard,
		contrast: state.contrast,
	};
}

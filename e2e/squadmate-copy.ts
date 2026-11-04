// Task 06 shows the character name beside the design's agent name. The design
// files stay as approved. Screen inventories compare a rewritten design copy.

const characterByTitle: Readonly<Record<string, string>> = {
	Orders: "Pisa",
	Support: "Kyoto",
	Marketing: "Rio",
	Finance: "Zurich",
	Inventory: "Giza",
	"Market researcher": "Machu",
	"Website builder": "Angkor",
	Analytics: "Delphi",
	People: "Sydney",
};

const titlesByLength = Object.keys(characterByTitle).sort((left, right) => right.length - left.length);

type Handler = { tag: string; event: string; handler: string; text?: string };
type Link = { text?: string; href: string };

export type SquadmateInventory = {
	texts: string[];
	handlers: Handler[];
	loops: unknown[];
	links: Link[];
};

export type CopyMode = {
	readonly titles: "tag" | "tag-then-option";
	readonly preserveFirst?: Readonly<Record<string, number>>;
	readonly squadLine?: "heading" | "split";
};

export const agentNames: CopyMode = { titles: "tag" };
export const overviewNames: CopyMode = { titles: "tag", preserveFirst: { Orders: 1 }, squadLine: "split" };
export const chipsThenOptions: CopyMode = { titles: "tag-then-option" };
export const detailHeading: CopyMode = { titles: "tag", squadLine: "heading" };

type LooseInventory = {
	texts: readonly string[];
	handlers: readonly { text?: string }[];
	links: readonly unknown[];
};

export function rewriteBuiltInventory<T extends LooseInventory>(design: T, mode: CopyMode): T {
	return {
		...design,
		texts: rewriteTexts(design.texts, mode),
		handlers: design.handlers.map((handler) =>
			handler.text === undefined ? handler : { ...handler, text: rewriteHandler(handler.text, mode) },
		),
		links: design.links.map((link) => rewriteLink(link, mode)),
	};
}

export function rewriteFrameInventory<T extends SquadmateInventory>(design: T): T {
	return {
		...design,
		texts: design.texts.flatMap((text) => rewriteFrameText(text)),
		handlers: design.handlers.map((handler) =>
			handler.text === undefined ? handler : { ...handler, text: rewriteFrameHandler(handler.text) },
		),
		links: design.links.map((link) =>
			link.text === undefined ? link : { ...link, text: rewriteFrameHandler(link.text) },
		),
	};
}

function rewriteTexts(texts: readonly string[], mode: CopyMode): string[] {
	const seen = new Map<string, number>();
	const preserved = new Map(Object.entries(mode.preserveFirst ?? {}));
	return texts.flatMap((text) => rewriteText(text, mode, seen, preserved));
}

function rewriteText(
	text: string,
	mode: CopyMode,
	seen: Map<string, number>,
	preserved: Map<string, number>,
): string[] {
	const route = text.match(/^(.+?) → (.+?)(?: · (.+))?$/);
	const from = route ? characterOf(route[1]) : null;
	const to = route ? characterOf(route[2]) : null;
	if (route && from && to) {
		const parts = [from, "→", to];
		if (route[3]) parts.push(`· ${route[3]}`);
		return parts;
	}
	const via = text.match(/^(.+) squad, via Master$/);
	const viaCharacter = via ? characterOf(via[1]) : null;
	if (via && viaCharacter) return [`${viaCharacter} squad, via Petra`];
	const squad = text.match(/^(.+) squad$/);
	const squadCharacter = squad && squad[1] !== "Master" ? characterOf(squad[1]) : null;
	if (squad && squadCharacter && mode.squadLine === "heading") return [`${squadCharacter} squad`, squad[1]];
	if (squad && squadCharacter && mode.squadLine === "split") return [squadCharacter, squad[1], "squad"];
	const character = characterByTitle[text];
	if (character) {
		const keep = preserved.get(text) ?? 0;
		if (keep > 0) {
			preserved.set(text, keep - 1);
			return [text];
		}
		const seenCount = seen.get(text) ?? 0;
		seen.set(text, seenCount + 1);
		if (mode.titles === "tag-then-option" && seenCount > 0) return [character];
		return [text, character];
	}
	return [rewriteProse(text)];
}

function rewriteHandler(text: string, mode: CopyMode): string {
	const routed = replaceRoutes(text).replace(/^(.+) squad, via Master$/, (whole, title: string) => {
		const character = characterOf(title);
		return character ? `${character} squad, via Petra` : whole;
	});
	const prose = rewriteProse(routed);
	const exact = characterByTitle[prose];
	if (exact) return mode.titles === "tag-then-option" ? exact : `${exact} ${prose}`;
	if (mode.titles === "tag-then-option") {
		const options = optionList(prose) ?? embeddedOptions(prose);
		if (options) return options;
	}
	for (const title of titlesByLength) {
		if (prose.startsWith(`${title} `)) return `${characterByTitle[title]} ${prose}`;
	}
	return prose;
}

// A select's handler text is every option joined. Chips and hub buttons keep the design name.
function optionList(text: string): string | null {
	const names: string[] = [];
	let rest = text;
	while (rest.length > 0) {
		const title = titlesByLength.find((candidate) => rest === candidate || rest.startsWith(`${candidate} `));
		if (!title) return null;
		const character = characterByTitle[title];
		if (!character) return null;
		names.push(character);
		rest = rest.slice(title.length).replace(/^ /, "");
	}
	return names.join(" ");
}

// The action field has no id, so its handler text is the previous label: "Agent" plus every option.
function embeddedOptions(text: string): string | null {
	let start = -1;
	for (const title of titlesByLength) {
		let from = 0;
		while (from < text.length) {
			const at = text.indexOf(title, from);
			if (at < 0) break;
			const before = at === 0 || text[at - 1] === " ";
			const after = at + title.length === text.length || text[at + title.length] === " ";
			if (before && after && at > 0 && (start === -1 || at < start)) start = at;
			from = at + title.length;
		}
	}
	if (start < 0) return null;
	const options = optionList(text.slice(start));
	if (!options?.includes(" ")) return null;
	return `${text.slice(0, start)}${options}`;
}

function rewriteLink(link: unknown, mode: CopyMode): unknown {
	if (typeof link !== "object" || link === null || !("text" in link) || typeof link.text !== "string") return link;
	return { ...link, text: rewriteHandler(link.text, mode) };
}

function rewriteFrameText(text: string): string[] {
	if (text === "M") return [];
	const character = characterByTitle[text];
	if (character) return [text, character];
	return [rewriteFrameLabel(text)];
}

function rewriteFrameHandler(text: string): string {
	const stripped = text.replace(/^M /, "");
	const character = characterByTitle[stripped];
	if (character) return `${character} ${stripped}`;
	return rewriteFrameLabel(stripped);
}

function rewriteFrameLabel(text: string): string {
	if (text === "Chat with the master") return "Chat with Petra";
	if (text === "Master") return "Petra";
	if (text === "Message Master") return "Message Petra";
	if (/^Ask Master( \d+)?$/.test(text)) return text.replace("Ask Master", "Ask Petra");
	const via = text.match(/^(.+) squad, via Master$/);
	const character = via ? characterByTitle[via[1]] : undefined;
	if (via && character) return `${character} squad, via Petra`;
	return text;
}

function characterOf(name: string): string | null {
	if (name === "Master") return "Petra";
	return characterByTitle[name] ?? null;
}

function replaceRoutes(text: string): string {
	const names = ["Master", ...titlesByLength];
	let value = text;
	for (const from of names) {
		for (const to of names) {
			const needle = `${from} → ${to}`;
			if (!value.includes(needle)) continue;
			value = value.replaceAll(needle, `${characterOf(from)} → ${characterOf(to)}`);
		}
	}
	return value;
}

function rewriteProse(text: string): string {
	return text
		.replaceAll("Chat with the master", "Chat with Petra")
		.replaceAll("A master squad coordinates them", "Petra coordinates them")
		.replaceAll(
			"Ask the master what's going on; it routes the question to the right squad.",
			"Ask Petra what's going on; Petra routes the question to the right squad.",
		)
		.replaceAll("The master uses this to brief every squad.", "Petra uses this to brief every squad.")
		.replaceAll("The master will propose a mission for each squad", "Petra will propose a mission for each squad")
		.replaceAll("and one master squad will be created.", "and Petra's squad will be created.")
		.replaceAll("the master", "Petra")
		.replaceAll(/\bMaster\b/g, "Petra");
}

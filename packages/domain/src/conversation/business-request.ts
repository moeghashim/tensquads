export interface BusinessChat {
	readonly businessName: string;
	readonly businessType: "restaurant" | "grocer";
	readonly items: readonly { readonly name: string; readonly price: string; readonly section: string }[];
	readonly cuisine?: string;
	readonly sections?: readonly string[];
}

const KIND = /^(restaurant|grocer):\s*(.+)$/i;
const CUISINE = /^cuisine:\s*(.+)$/i;
const ITEM = /^([^|]+)\|([^|]*)\|([^|]+)$/;

function businessKind(line: string | undefined): { kind: "restaurant" | "grocer"; businessName: string } | null {
	const head = line ? KIND.exec(line) : null;
	const kind = head?.[1]?.toLowerCase();
	const businessName = head?.[2]?.trim() ?? "";
	if (kind !== "restaurant" && kind !== "grocer") return null;
	if (businessName.length === 0) return null;
	return { kind, businessName };
}

function cuisineOf(kind: "restaurant" | "grocer", line: string | undefined): string | null | undefined {
	const match = line ? CUISINE.exec(line) : null;
	if (!match) return undefined;
	if (kind !== "restaurant") return null;
	const cuisine = match[1]?.trim() ?? "";
	return cuisine.length > 0 ? cuisine : null;
}

function itemOf(line: string): { name: string; price: string; section: string } | null {
	const match = ITEM.exec(line);
	const name = match?.[1]?.trim() ?? "";
	const section = match?.[3]?.trim() ?? "";
	if (!match || name.length === 0 || section.length === 0) return null;
	return { name, price: match[2]?.trim() ?? "", section };
}

function itemsOf(lines: readonly string[]): BusinessChat["items"] | null {
	const items = [];
	for (const line of lines) {
		const item = itemOf(line);
		if (!item) return null;
		items.push(item);
	}
	return items.length > 0 ? items : null;
}

// A real-run chat uses this shape. Test mode does not call it, so the design seed stays on the five routes.
// The chat box is one line, so a semicolon also ends a line.
export function parseBusinessChat(text: string): BusinessChat | null {
	const lines = text
		.split(/\r?\n|;/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const head = businessKind(lines[0]);
	if (!head) return null;
	const cuisine = cuisineOf(head.kind, lines[1]);
	if (cuisine === null) return null;
	const items = itemsOf(lines.slice(cuisine ? 2 : 1));
	if (!items) return null;
	return {
		businessName: head.businessName,
		businessType: head.kind,
		items,
		...(cuisine ? { cuisine } : {}),
	};
}

export function researchFields(request: BusinessChat): {
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly set: Readonly<Record<string, unknown>>;
} {
	return {
		text: "Research this business.",
		payload: {
			businessName: request.businessName,
			businessType: request.businessType,
			items: request.items,
			...(request.cuisine ? { cuisine: request.cuisine } : {}),
			...(request.sections ? { sections: request.sections } : {}),
		},
		writes: ["business"],
		set: { business: request },
	};
}

export function researchStart(request: BusinessChat, id: string) {
	const fields = researchFields(request);
	return {
		id,
		time: "12:01",
		from: "master",
		to: "market",
		kind: "Task" as const,
		skill: "task.route",
		text: fields.text,
		payload: fields.payload,
		writes: fields.writes,
		set: fields.set,
		trace: `tr_${id}`,
	};
}

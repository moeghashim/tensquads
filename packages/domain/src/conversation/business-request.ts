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

// A real-run chat uses this shape. Test mode does not call it, so the design seed stays on the five routes.
export function parseBusinessChat(text: string): BusinessChat | null {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const head = lines[0] ? KIND.exec(lines[0]) : null;
	const kind = head?.[1]?.toLowerCase();
	const businessName = head?.[2]?.trim() ?? "";
	if ((kind !== "restaurant" && kind !== "grocer") || businessName.length === 0) return null;
	let index = 1;
	let cuisine: string | undefined;
	const cuisineLine = lines[1] ? CUISINE.exec(lines[1]) : null;
	if (cuisineLine) {
		if (kind !== "restaurant") return null;
		cuisine = cuisineLine[1]?.trim();
		if (!cuisine) return null;
		index = 2;
	}
	const items = [];
	for (const line of lines.slice(index)) {
		const match = ITEM.exec(line);
		const name = match?.[1]?.trim() ?? "";
		const section = match?.[3]?.trim() ?? "";
		if (!match || name.length === 0 || section.length === 0) return null;
		items.push({ name, price: match[2]?.trim() ?? "", section });
	}
	if (items.length === 0) return null;
	return {
		businessName,
		businessType: kind,
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

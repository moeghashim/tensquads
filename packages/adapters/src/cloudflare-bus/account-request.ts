import type { BusinessRequest } from "@tensquads/domain/master";

export const BUSINESS_KEY = "state:business";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readItem(value: unknown): BusinessRequest["items"][number] | null {
	if (!isRecord(value)) return null;
	if (typeof value.name !== "string" || typeof value.price !== "string" || typeof value.section !== "string") {
		return null;
	}
	return { name: value.name, price: value.price, section: value.section };
}

function readSections(value: unknown): readonly string[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	if (value.some((item) => typeof item !== "string" || item.length === 0)) return null;
	return value as string[];
}

export function parseStoredRequest(value: unknown): BusinessRequest | null {
	if (!isRecord(value)) return null;
	if (typeof value.businessName !== "string" || value.businessName.trim().length === 0) return null;
	if (value.businessType !== "restaurant" && value.businessType !== "grocer") return null;
	if (!Array.isArray(value.items)) return null;
	const items = [];
	for (const entry of value.items) {
		const item = readItem(entry);
		if (!item) return null;
		items.push(item);
	}
	const sections = readSections(value.sections);
	if (sections === null) return null;
	const cuisine = typeof value.cuisine === "string" && value.cuisine.length > 0 ? value.cuisine : undefined;
	return {
		businessName: value.businessName,
		businessType: value.businessType,
		items,
		...(cuisine ? { cuisine } : {}),
		...(sections ? { sections } : {}),
	};
}

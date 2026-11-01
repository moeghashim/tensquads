import type { CSSProperties } from "react";

export function css(value: string): CSSProperties {
	const style: Record<string, string> = {};
	for (const declaration of value.split(";")) {
		const splitAt = declaration.indexOf(":");
		if (splitAt === -1) {
			continue;
		}
		const property = declaration.slice(0, splitAt).trim();
		const propertyValue = declaration.slice(splitAt + 1).trim();
		if (property === "" || propertyValue === "") {
			continue;
		}
		const camel = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
		style[camel] = propertyValue;
	}
	return style;
}

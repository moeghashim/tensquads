// TanStack Start posts a seroval graph. A field lives on the data object's key list.
// Reading that node keeps a tab id, a retire list, or another field from choosing the request.

interface SerovalNode {
	readonly t?: number;
	readonly s?: string | number;
	readonly p?: { readonly k?: readonly string[]; readonly v?: readonly SerovalNode[] };
}

function isNode(value: unknown): value is SerovalNode {
	return typeof value === "object" && value !== null;
}

function field(node: SerovalNode, name: string): SerovalNode | undefined {
	if (node.t !== 10) return undefined;
	const keys = node.p?.k;
	const values = node.p?.v;
	if (!keys || !values) return undefined;
	const index = keys.indexOf(name);
	if (index < 0) return undefined;
	return values[index];
}

function decode(node: SerovalNode): unknown {
	if (node.t === 0 || node.t === 1) return node.s;
	if (node.t === 2) return node.s === 2;
	return undefined;
}

export function postedField(body: string, name: string): unknown {
	try {
		const parsed: unknown = JSON.parse(body);
		if (!isNode(parsed) || !isNode(parsed.t)) return undefined;
		const data = field(parsed.t, "data");
		if (!data) return undefined;
		const value = field(data, name);
		if (!value) return undefined;
		return decode(value);
	} catch {
		return undefined;
	}
}

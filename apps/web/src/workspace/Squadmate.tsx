import { characterName, shownRoleTag, squadmateMarkup } from "@tensquads/squadmates";

import { css } from "#/screens/css.ts";

// The drawing is a constant. It contains no text a customer typed.
// Blink rules live once in the document head. A style element inside a button is part of textContent.
function markup(id: string, on: boolean, size: number, decorative: boolean): string {
	const drawn = squadmateMarkup(id, on ? "idle" : "dropped", size);
	return decorative ? drawn.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"') : drawn;
}

export function Squadmate({
	id,
	on,
	size,
	decorative = false,
}: {
	readonly id: string;
	readonly on: boolean;
	readonly size: number;
	readonly decorative?: boolean;
}) {
	return (
		<span
			style={css(`width: ${size}px; height: ${size}px; display: inline-flex; flex: none; line-height: 0`)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markup is a constant with no user text
			dangerouslySetInnerHTML={{ __html: markup(id, on, size, decorative) }}
		/>
	);
}

export function RoleTag({ id }: { readonly id: string }) {
	const tag = shownRoleTag(id);
	if (!tag) return null;
	return (
		<span
			data-design-contrast="squadmate-role-tag"
			style={css("margin-left: 6px; font-size: 12px; font-weight: 400; color: #8f8f8f")}
		>
			{tag}
		</span>
	);
}

export function RouteFaces({
	from,
	to,
	masterName,
	names,
	onFor,
}: {
	readonly from: string;
	readonly to: string;
	readonly masterName: string;
	readonly names: Readonly<Record<string, string>>;
	readonly onFor?: (id: string) => boolean;
}) {
	return (
		<span style={css("display: inline-flex; align-items: center; gap: 4px")}>
			<Face id={from} masterName={masterName} names={names} on={faceOn(from, onFor)} />
			<span aria-hidden="true"> → </span>
			<Face id={to} masterName={masterName} names={names} on={faceOn(to, onFor)} />
		</span>
	);
}

function faceOn(id: string, onFor: ((id: string) => boolean) | undefined): boolean {
	if (id === "master") return true;
	return onFor?.(id) ?? true;
}

function Face({
	id,
	masterName,
	names,
	on,
}: {
	readonly id: string;
	readonly masterName: string;
	readonly names: Readonly<Record<string, string>>;
	readonly on: boolean;
}) {
	const name = id === "master" ? masterName : (names[id] ?? id);
	return (
		<span style={css("display: inline-flex; align-items: center; gap: 4px")}>
			{characterName(id) ? <Squadmate id={id} on={on} size={16} decorative /> : null}
			{name}
		</span>
	);
}

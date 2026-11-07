import { type SquadmateDrawState, shownRoleTag, squadmateMarkup } from "@tensquads/squadmates";

function v2SquadmateMarkup(id: string, state: SquadmateDrawState, size: number): string {
	const raw = squadmateMarkup(id, state, size);
	if (shownRoleTag(id) !== null) {
		return raw;
	}
	return raw.replace(/aria-label="([^",]+), [^",]+(, [^"]+)?"/, 'aria-label="$1$2"');
}

export function MateV2({
	id,
	state = "idle",
	size,
}: {
	readonly id: string;
	readonly state?: SquadmateDrawState;
	readonly size: number;
}) {
	return (
		<span
			className="mate-v2"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markup is a constant with no user text
			dangerouslySetInnerHTML={{ __html: v2SquadmateMarkup(id, state, size) }}
		/>
	);
}

export function CheckV2() {
	return (
		<svg className="ck" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path
				d="M3.5 8.5l3 3 6-7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

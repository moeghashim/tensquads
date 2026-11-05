import { type SquadmateDrawState, squadmateMarkup } from "@tensquads/squadmates";

export function Mate({
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
			className="mate"
			style={{ width: size, maxWidth: "100%" }}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: markup is a constant with no user text
			dangerouslySetInnerHTML={{ __html: squadmateMarkup(id, state, size) }}
		/>
	);
}

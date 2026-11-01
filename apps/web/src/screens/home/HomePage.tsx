import { useState } from "react";

import { css } from "../css.ts";
import type { BusinessKind } from "./data.ts";
import { HomeRest } from "./HomeRest.tsx";
import { HomeTop } from "./HomeTop.tsx";

export function HomePage() {
	const [kind, setKind] = useState<BusinessKind>("existing");
	const [draft, setDraft] = useState("");
	return (
		<main
			style={css(
				"min-height: 100vh; background: #fcfcfc; color: #282828; font-family: Inter, system-ui, sans-serif; font-size: 15px; line-height: 22px; letter-spacing: -0.01em; display: flex; flex-direction: column",
			)}
		>
			<HomeTop kind={kind} draft={draft} onKind={setKind} onDraft={setDraft} />
			<HomeRest />
		</main>
	);
}

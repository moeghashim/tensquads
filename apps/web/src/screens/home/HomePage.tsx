import { useState } from "react";

import type { BusinessKind } from "./data.ts";
import { HomeFooter, HomeRest } from "./HomeRest.tsx";
import { HomeHeader, HomeTop } from "./HomeTop.tsx";
import "./home.css";

export function HomePage() {
	const [kind, setKind] = useState<BusinessKind>("existing");
	const [draft, setDraft] = useState("");
	return (
		<div className="home-page">
			<HomeHeader />
			<main>
				<HomeTop kind={kind} draft={draft} onKind={setKind} onDraft={setDraft} />
				<HomeRest />
			</main>
			<HomeFooter />
		</div>
	);
}

import { useState } from "react";

import type { BusinessKind } from "./data.ts";
import { HomeV2Rest } from "./HomeV2Rest.tsx";
import { HomeV2Hero, HomeV2Nav } from "./HomeV2Top.tsx";
import "./home-v2.css";

// Hide the hero cards before the first paint, so the arrival sequence starts from nothing.
const PRE_PAINT_SCRIPT =
	'if(!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("intro");setTimeout(function(){document.documentElement.classList.add("intro-done")},6000)}';

function runApprovalMoment(root: HTMLDivElement): () => void {
	const timers: ReturnType<typeof setTimeout>[] = [];
	const schedule = (fn: () => void, ms: number) => {
		const id = setTimeout(fn, ms);
		timers.push(id);
	};

	const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const cards = Array.from(root.querySelectorAll<HTMLElement>(".c"));
	const first = cards[0];
	const cnt = root.querySelector<HTMLElement>(".cnt");
	const sr = root.querySelector<HTMLElement>(".ask .sr");

	if (!calm) {
		document.documentElement.classList.add("intro");
		schedule(() => {
			cards.forEach((card, index) => {
				schedule(() => {
					card.classList.add("in");
				}, index * 450);
			});
		}, 700);
	}

	const pressAt = calm ? 1200 : 700 + 3770;
	const approveAt = pressAt + (calm ? 300 : 650);
	const settleAt = approveAt + 4500;

	schedule(() => {
		first?.classList.add("press");
	}, pressAt);

	schedule(() => {
		first?.classList.remove("press");
		first?.classList.add("approved");
		cnt?.classList.add("down");
		if (sr) {
			sr.textContent = "3";
		}
	}, approveAt);

	schedule(() => {
		first?.classList.add("settled");
	}, settleAt);

	return () => {
		for (const id of timers) {
			clearTimeout(id);
		}
		document.documentElement.classList.remove("intro", "intro-done");
	};
}

function mountApprovalMoment(node: HTMLDivElement | null) {
	if (!node) return;
	return runApprovalMoment(node);
}

export function HomeV2Page() {
	const [kind, setKind] = useState<BusinessKind>("existing");
	const [draft, setDraft] = useState("");

	return (
		<div className="home-v2" ref={mountApprovalMoment}>
			<script
				// biome-ignore lint/security/noDangerouslySetInnerHtml: constant script to hide hero cards before first paint
				dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }}
			/>
			<div className="w">
				<HomeV2Nav />
				<HomeV2Hero kind={kind} draft={draft} onKind={setKind} onDraft={setDraft} />
				<HomeV2Rest />
			</div>
		</div>
	);
}

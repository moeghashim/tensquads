import { useRef } from "react";

import { type BusinessKind, examplesFor, heroCards, logos, nameOf, placeholderFor } from "./data.ts";
import { CheckV2, MateV2 } from "./MateV2.tsx";

export function HomeV2Nav() {
	return (
		<nav className="nav">
			{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
			<a className="brand" href="#">
				<MateV2 id="master" state="idle" size={28} /> tensquads
			</a>
			<a className="hide" href="#agents">
				Agents
			</a>
			<a className="hide" href="#how">
				How it works
			</a>
			<a className="hide" href="#control">
				Control
			</a>
			<a className="hide" href="#pricing">
				Pricing
			</a>
			<span className="sp" />
			<a href="/signin">Sign in</a>
			<a className="btn" href="/signup">
				Start free
			</a>
		</nav>
	);
}

export function HomeV2Hero({
	kind,
	draft,
	onKind,
	onDraft,
}: {
	readonly kind: BusinessKind;
	readonly draft: string;
	readonly onKind: (kind: BusinessKind) => void;
	readonly onDraft: (draft: string) => void;
}) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const toggleRef = useRef<HTMLDivElement | null>(null);
	const examples = examplesFor(kind);

	const slideThumb = (tg: HTMLDivElement | null) => {
		if (!tg) return;
		const thumb = tg.querySelector<HTMLElement>(".thumb");
		const active = tg.querySelector<HTMLElement>('[aria-pressed="true"]');
		if (!thumb || !active) return;
		thumb.style.width = `${active.offsetWidth}px`;
		thumb.style.transform = `translateX(${active.offsetLeft}px)`;
	};

	return (
		<header>
			<div className="new">
				<span>
					<MateV2 id="analytics" state="idle" size={22} /> New: Analytics agent in beta
				</span>
			</div>
			<h1>Your squad does the work.</h1>
			<div className="ask">
				<MateV2 id="master" state="running" size={40} />
				<span>
					<b>{nameOf("master")}</b> has{" "}
					<span className="cnt" aria-hidden="true">
						<span>4</span>
						<span>3</span>
					</span>
					<span className="sr">4</span> decisions for you today · sample day at Harbor Prints
				</span>
			</div>
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: The design uses div.cards with aria-label="Sample approvals". */}
			<div className="cards" aria-label="Sample approvals">
				{heroCards.map((card) => (
					<div key={card.id} className="c">
						<div className="hd">
							<MateV2 id={card.id} state="waiting" size={34} />
							<b>{nameOf(card.id)}</b>
							<span className="tag">{card.tag}</span>
							<span className="amt">{card.amt}</span>
						</div>
						<h3>{card.title}</h3>
						<p>{card.body}</p>
						<span className="ok">
							<CheckV2 /> {card.check}
						</span>
						<div className="act" aria-hidden="true">
							<span className="yes">
								<CheckV2 /> Approve
							</span>
							<span className="no">Decline</span>
							<span className="done">
								<CheckV2 /> Approved by you · in the log
							</span>
						</div>
					</div>
				))}
			</div>
			<div className="dock">
				<form className="prompt" action="/signup">
					{/* biome-ignore lint/a11y/useSemanticElements: The design uses div role="group" for the business toggle. */}
					<div
						className="tg"
						role="group"
						aria-label="Business type"
						ref={(node) => {
							toggleRef.current = node;
							if (!node) return;
							node.classList.add("js");
							const onResize = () => slideThumb(node);
							onResize();
							window.addEventListener("resize", onResize);
							void document.fonts?.ready.then(onResize);
							return () => {
								window.removeEventListener("resize", onResize);
							};
						}}
					>
						<i className="thumb" aria-hidden="true" />
						<button
							type="button"
							data-k="new"
							aria-pressed={kind === "new"}
							data-handler="k.pick"
							data-event="onClick"
							onClick={() => {
								onKind("new");
								requestAnimationFrame(() => slideThumb(toggleRef.current));
							}}
						>
							New business
						</button>
						<button
							type="button"
							data-k="existing"
							aria-pressed={kind === "existing"}
							data-handler="k.pick"
							data-event="onClick"
							onClick={() => {
								onKind("existing");
								requestAnimationFrame(() => slideThumb(toggleRef.current));
							}}
						>
							Existing business
						</button>
					</div>
					<label htmlFor="draft">Describe your business</label>
					<textarea
						ref={textareaRef}
						id="draft"
						name="draft"
						rows={1}
						placeholder={placeholderFor(kind)}
						value={draft}
						data-handler="onDraft"
						data-event="onChange"
						onChange={(event) => onDraft(event.target.value)}
					/>
					<div className="row">
						<span id="ex" className="row">
							{examples.map((label) => (
								<button
									key={label}
									type="button"
									className="chip"
									data-handler="ex.pick"
									data-event="onClick"
									onClick={() => {
										onDraft(label);
										textareaRef.current?.focus();
									}}
								>
									{label}
								</button>
							))}
						</span>
						<button className="btn lg" type="submit">
							Build my squad →
						</button>
					</div>
				</form>
				<div className="fine">Free for 14 days · No credit card · Cancel from the dashboard</div>
			</div>
			<div className="logos">
				<span>Running the day-to-day at</span>
				{logos.map((logo) => (
					<b key={logo}>{logo}</b>
				))}
			</div>
		</header>
	);
}

import { type ReactNode, useCallback, useRef, useState } from "react";

import { css } from "../css.ts";
import { Arrow, Check, Mark } from "../marks.tsx";
import {
	type BusinessKind,
	channelLabels,
	missionExamples,
	platformLabels,
	squadChoices,
	summaryLine,
	volumeLabels,
} from "./catalog.ts";
import { fieldsComplete, openAccount, pickKind, type SignupState, togglePicked, toggleValue } from "./machine.ts";
import {
	type AccountCreateResult,
	AccountStep,
	BackButton,
	heading,
	labelStyle,
	rowStyle,
	StepButtons,
} from "./signup-ui.tsx";
import { areaStyle, checkStyle, fieldStyle, optionStyle, pill, squadStyle, stepDot } from "./styles.ts";

const stepLabels = ["Business type", "Details", "Squads"] as const;

export function SignupCard({
	state,
	onChange,
	onCreate,
	credentialsLocked,
}: {
	state: SignupState;
	onChange: (state: SignupState) => void;
	onCreate: (state: SignupState, isCurrent: () => boolean) => Promise<AccountCreateResult>;
	credentialsLocked: boolean;
}) {
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<"" | "wrong" | "failed">("");
	const request = useRef<symbol | null>(null);
	const bindSection = useCallback((node: HTMLElement | null) => {
		if (node === null) request.current = null;
	}, []);
	function change(next: SignupState) {
		if (request.current) return;
		setNotice("");
		onChange(next);
	}
	async function submit() {
		if (request.current) return;
		const next = { ...state, tried: true };
		onChange(next);
		setNotice("");
		if (!fieldsComplete(next.email, next.password)) return;
		const token = Symbol();
		request.current = token;
		setPending(true);
		const isCurrent = () => request.current === token;
		await finishSubmission(next, isCurrent);
	}
	async function finishSubmission(next: SignupState, isCurrent: () => boolean) {
		try {
			const outcome = await onCreate(next, isCurrent);
			if (isCurrent()) setNotice(submissionNotice(outcome));
		} catch {
			if (isCurrent()) setNotice("failed");
		} finally {
			clearSubmission(isCurrent);
		}
	}
	function clearSubmission(isCurrent: () => boolean) {
		if (isCurrent()) {
			request.current = null;
			setPending(false);
		}
	}
	const current = stepIndex(state.step);

	return (
		<section
			ref={bindSection}
			aria-label="Create your business"
			style={css(
				"flex: 1 1 460px; max-width: 620px; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 28px 32px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 24px",
			)}
		>
			<StepRow current={current} />
			{state.step === "choose" ? <ChooseStep state={state} onChange={change} /> : null}
			<CurrentDetails state={state} onChange={change} />
			<CurrentSquads state={state} onChange={change} />
			{state.step === "account" ? (
				<AccountStep
					state={state}
					onChange={change}
					onSubmit={submit}
					pending={pending}
					credentialsLocked={credentialsLocked}
					notice={notice}
				/>
			) : null}
			<p
				data-design-contrast="signup-terms"
				style={css("margin: 0; font-size: 12px; color: #8f8f8f; text-align: center")}
			>
				By continuing you agree to the [TERMS] and [PRIVACY POLICY].
			</p>
		</section>
	);
}

function ChooseStep({ state, onChange }: { state: SignupState; onChange: (state: SignupState) => void }) {
	return (
		<div data-if="isChoose" style={css("display: flex; flex-direction: column; gap: 20px")}>
			<div>
				<h2 style={heading()}>Where are you starting from?</h2>
				<p style={css("margin: 6px 0 0; color: #5d5d5d")}>
					This decides which squads we set up first and what we ask you to connect.
				</p>
			</div>
			<div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px")}>
				<KindButton
					kind="new"
					pressed={state.kind === "new"}
					handler="pickNew"
					tint="#ffefa4"
					title="A new business"
					body="I have an idea or a product and nothing is set up yet. Squads help me launch: store, first products, first campaign."
					onChange={onChange}
					state={state}
				>
					<path d="M8 2.5v11M2.5 8h11" />
				</KindButton>
				<KindButton
					kind="existing"
					pressed={state.kind === "existing"}
					handler="pickExisting"
					tint="#def5ee"
					title="An existing business"
					body="I already sell. Connect my store and inbox and let the squads take over the daily work."
					onChange={onChange}
					state={state}
				>
					<path d="M2.5 6.5 8 2.5l5.5 4v7h-11z" />
					<path d="M6.5 13.5v-4h3v4" />
				</KindButton>
			</div>
		</div>
	);
}

function KindButton({
	kind,
	pressed,
	handler,
	tint,
	title,
	body,
	state,
	onChange,
	children,
}: {
	kind: BusinessKind;
	pressed: boolean;
	handler: string;
	tint: string;
	title: string;
	body: string;
	state: SignupState;
	onChange: (state: SignupState) => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className="opt"
			data-handler={handler}
			aria-pressed={pressed}
			onClick={() => onChange(pickKind(state, kind))}
			style={css(optionStyle(pressed))}
		>
			<span
				style={css(
					`width: 40px; height: 40px; border-radius: 10px; background: ${tint}; display: inline-flex; align-items: center; justify-content: center`,
				)}
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 16 16"
					fill="none"
					stroke="#0d0d0d"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					{children}
				</svg>
			</span>
			<span style={css("font-size: 16px; font-weight: 600; color: #0d0d0d")}>{title}</span>
			<span style={css("font-size: 13px; line-height: 19px; color: #5d5d5d")}>{body}</span>
		</button>
	);
}

function DetailsStep({
	state,
	kind,
	onChange,
}: {
	state: SignupState;
	kind: BusinessKind;
	onChange: (state: SignupState) => void;
}) {
	const isNew = kind === "new";
	return (
		<div data-if="isDetails" style={css("display: flex; flex-direction: column; gap: 20px")}>
			<DetailsHeading isNew={isNew} />
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="biz-name" style={labelStyle()}>
					Business name
				</label>
				<input
					id="biz-name"
					type="text"
					placeholder="e.g. Harbor Coffee Roasters"
					value={state.name}
					data-handler="onName"
					onChange={(event) => onChange({ ...state, name: event.target.value })}
					style={css(fieldStyle)}
				/>
			</div>
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="biz-mission" style={labelStyle()}>
					Company mission <span style={css("font-weight: 400; color: #5d5d5d")}>(required)</span>
				</label>
				<textarea
					id="biz-mission"
					rows={2}
					placeholder={
						isNew
							? "e.g. Launch and reach 500 paying customers in the first year"
							: "e.g. Reach $1M in annual sales with repeat customers by the end of 2027"
					}
					value={state.mission}
					data-handler="onMission"
					onChange={(event) => onChange({ ...state, mission: event.target.value })}
					style={css(areaStyle)}
				/>
				<span style={css("font-size: 12px; color: #5d5d5d")}>
					One or two sentences. Every squad works toward this.
				</span>
				<div data-loop="missionExamples" data-loop-as="m" style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
					{missionExamples[kind].map((label) => (
						<button
							key={label}
							type="button"
							className="chip"
							data-handler="m.pick"
							onClick={() => onChange({ ...state, mission: label })}
							style={css(
								"height: 28px; padding: 0 10px; border: 0; border-radius: 999px; background: rgba(13,13,13,.06); color: #414141; font-size: 12px; font-weight: 500",
							)}
						>
							{label}
						</button>
					))}
				</div>
			</div>
			{isNew ? (
				<NewFields state={state} onChange={onChange} />
			) : (
				<ExistingFields state={state} onChange={onChange} />
			)}
			<StepButtons
				backHandler="back"
				onBack={() => onChange({ ...state, step: "choose" })}
				nextLabel="Choose my squads"
				nextHandler="next"
				onNext={() => onChange({ ...state, step: "agents" })}
			/>
		</div>
	);
}

function NewFields({ state, onChange }: { state: SignupState; onChange: (state: SignupState) => void }) {
	return (
		<div data-if="isNew" style={css("display: contents")}>
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="biz-idea" style={labelStyle()}>
					What will you sell, and to whom?
				</label>
				<textarea
					id="biz-idea"
					rows={3}
					placeholder="e.g. Naturally caffeine-free date-seed coffee for people who love the ritual but not the jitters"
					value={state.idea}
					data-handler="onIdea"
					onChange={(event) => onChange({ ...state, idea: event.target.value })}
					style={css(areaStyle)}
				/>
				<span style={css("font-size: 12px; color: #5d5d5d")}>
					The master uses this to brief every squad. You can change it later.
				</span>
			</div>
			<div style={css("display: flex; flex-direction: column; gap: 8px")}>
				<span style={labelStyle()}>Where do you plan to sell?</span>
				<div data-loop="channels" data-loop-as="c" style={css("display: flex; flex-wrap: wrap; gap: 8px")}>
					{channelLabels.map((label) => {
						const on = state.channels.includes(label);
						return (
							<button
								key={label}
								type="button"
								className="chip"
								data-handler="c.toggle"
								aria-pressed={on}
								onClick={() => onChange({ ...state, channels: toggleValue(state.channels, label) })}
								style={css(pill(on))}
							>
								{label}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function ExistingFields({ state, onChange }: { state: SignupState; onChange: (state: SignupState) => void }) {
	return (
		<div data-if="isExisting" style={css("display: contents")}>
			<div style={css("display: flex; flex-direction: column; gap: 8px")}>
				<span style={labelStyle()}>Where do you sell today?</span>
				<div
					data-loop="platforms"
					data-loop-as="p"
					style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px")}
				>
					{platformLabels.map((platform) => {
						const on = state.platforms.includes(platform.label);
						return (
							<button
								key={platform.label}
								type="button"
								className="chip"
								data-handler="p.toggle"
								aria-pressed={on}
								onClick={() => onChange({ ...state, platforms: toggleValue(state.platforms, platform.label) })}
								style={css(`${pill(on)}; justify-content: flex-start`)}
							>
								<span
									style={css(
										`width: 8px; height: 8px; border-radius: 999px; background: ${on ? platform.dot : "#c9c9c9"}; flex: none`,
									)}
								/>
								{platform.label}
							</button>
						);
					})}
				</div>
				<span style={css("font-size: 12px; color: #5d5d5d")}>
					We'll ask you to connect these on the next step. Nothing is changed in your store without your say-so.
				</span>
			</div>
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="biz-url" style={labelStyle()}>
					Website <span style={css("font-weight: 400; color: #5d5d5d")}>(optional)</span>
				</label>
				<input
					id="biz-url"
					type="url"
					placeholder="https://"
					value={state.url}
					data-handler="onUrl"
					onChange={(event) => onChange({ ...state, url: event.target.value })}
					style={css(fieldStyle)}
				/>
			</div>
			<div style={css("display: flex; flex-direction: column; gap: 8px")}>
				<span style={labelStyle()}>Roughly how many orders a month?</span>
				<div data-loop="volumes" data-loop-as="v" style={css("display: flex; flex-wrap: wrap; gap: 8px")}>
					{volumeLabels.map((label) => {
						const on = state.volume === label;
						return (
							<button
								key={label}
								type="button"
								className="chip"
								data-handler="v.pick"
								aria-pressed={on}
								onClick={() => onChange({ ...state, volume: label })}
								style={css(pill(on))}
							>
								{label}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function SquadStep({
	state,
	kind,
	onChange,
}: {
	state: SignupState;
	kind: BusinessKind;
	onChange: (state: SignupState) => void;
}) {
	const name = state.name.trim() || "your business";
	return (
		<div data-if="isAgents" style={css("display: flex; flex-direction: column; gap: 20px")}>
			<div>
				<h2 style={heading()}>Your first squads for {name}</h2>
				<p style={css("margin: 6px 0 0; color: #5d5d5d")}>
					{kind === "new"
						? "We picked the squads that help a launch. Untick any you do not want yet."
						: "We picked the squads that take over day-to-day work. Untick any you do not want yet."}
				</p>
			</div>
			<div data-loop="agents" data-loop-as="a" style={css("display: flex; flex-direction: column; gap: 8px")}>
				{squadChoices.map((squad) => {
					const on = state.picked.includes(squad.id);
					return (
						<button
							key={squad.id}
							type="button"
							data-handler="a.toggle"
							aria-pressed={on}
							onClick={() => onChange(togglePicked(state, squad.id))}
							style={css(squadStyle(on))}
						>
							<span
								style={css(
									`width: 32px; height: 32px; border-radius: 8px; background: ${squad.tint}; display: inline-flex; align-items: center; justify-content: center; flex: none; color: #0d0d0d`,
								)}
							>
								<Mark />
							</span>
							<span
								style={css("display: flex; flex-direction: column; flex: 1; min-width: 0; text-align: left")}
							>
								<span style={css("font-weight: 600; color: #0d0d0d")}>
									{squad.name} <span style={css("font-weight: 400; color: #5d5d5d")}>· {squad.role}</span>
								</span>
								<span style={css("font-size: 12px; color: #5d5d5d")}>
									{kind === "new" ? squad.whyNew : squad.whyExisting}
								</span>
							</span>
							<span style={css(checkStyle(on))}>
								<Check />
							</span>
						</button>
					);
				})}
			</div>
			<div
				style={css(
					"padding: 12px 14px; border-radius: 12px; background: #f9f9f9; display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: #5d5d5d",
				)}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					stroke="#5d5d5d"
					strokeWidth="1.5"
					strokeLinecap="round"
					aria-hidden="true"
				>
					<circle cx="8" cy="8" r="6" />
					<path d="M8 7v4M8 5h0" />
				</svg>
				<span>
					{summaryLine(state.picked.length)} Every squad starts in{" "}
					<strong style={css("color: #0d0d0d")}>ask-first</strong> mode; you loosen the limits once you trust it.
					The master will propose a mission for each squad; you approve them in your inbox.
				</span>
			</div>
			<div style={rowStyle()}>
				<BackButton handler="back" onClick={() => onChange({ ...state, step: "details" })} />
				<button
					type="button"
					onClick={() => onChange(openAccount(state))}
					style={css(
						"height: 40px; padding: 0 18px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px",
					)}
				>
					Create my workspace
					<Arrow />
				</button>
			</div>
		</div>
	);
}

function StepRow({ current }: { current: number }) {
	return (
		<ol
			data-loop="steps"
			data-loop-as="st"
			style={css(
				"margin: 0; padding: 0; list-style: none; display: flex; gap: 8px; align-items: center; font-size: 12px; font-weight: 500",
			)}
		>
			{stepLabels.map((label, index) => (
				<StepLabel key={label} label={label} index={index} current={current} />
			))}
		</ol>
	);
}

function StepLabel({ label, index, current }: { label: string; index: number; current: number }) {
	const done = index < current;
	const on = index === current;
	const color = stepColor(on, done);
	return (
		<li style={css("display: flex; align-items: center; gap: 8px")}>
			<span style={css(stepDot(on || done))}>{done ? "✓" : String(index + 1)}</span>
			<span data-design-contrast={inactiveContrast(on, done)} style={{ color }}>
				{label}
			</span>
			{index < 2 ? (
				<span
					data-if={index === 0 ? "st.hasLine" : undefined}
					style={css("width: 24px; height: 1px; background: rgba(13,13,13,.15); margin: 0 4px")}
				/>
			) : null}
		</li>
	);
}

function stepColor(on: boolean, done: boolean) {
	if (on) return "#0d0d0d";
	return done ? "#282828" : "#8f8f8f";
}
function inactiveContrast(on: boolean, done: boolean) {
	return !on && !done ? "signup-inactive-step" : undefined;
}

function DetailsHeading({ isNew }: { isNew: boolean }) {
	return (
		<div>
			<h2 style={heading()}>
				{isNew ? "Tell us about the business you want to start" : "Tell us about your business"}
			</h2>
			<p style={css("margin: 6px 0 0; color: #5d5d5d")}>
				{isNew
					? "A sentence or two is enough. The agents fill in the rest with you."
					: "We use this to pick the right agents and what to connect."}
			</p>
		</div>
	);
}

function stepIndex(step: SignupState["step"]) {
	return step === "choose" ? 0 : step === "details" ? 1 : 2;
}
function CurrentDetails({ state, onChange }: { state: SignupState; onChange: (state: SignupState) => void }) {
	return state.step === "details" && state.kind ? (
		<DetailsStep state={state} kind={state.kind} onChange={onChange} />
	) : null;
}
function CurrentSquads({ state, onChange }: { state: SignupState; onChange: (state: SignupState) => void }) {
	return state.step === "agents" ? (
		<SquadStep state={state} kind={state.kind ?? "existing"} onChange={onChange} />
	) : null;
}

function submissionNotice(outcome: AccountCreateResult) {
	return outcome === "wrong" || outcome === "failed" ? outcome : "";
}

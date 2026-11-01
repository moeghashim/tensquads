import { css } from "../css.ts";
import { Arrow } from "../marks.tsx";
import { fieldsComplete, type SignupState } from "./machine.ts";
import { fieldStyle } from "./styles.ts";

const emptyError = "Enter your email and password to sign in.";
const wrongError = "That email or password is wrong.";
const failedError = "Something went wrong. Try again.";

export type AccountCreateResult = "ok" | "wrong" | "failed" | "blocked";
const primaryButton =
	"height: 40px; padding: 0 18px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px";

export function heading() {
	return css(
		"margin: 0; font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
	);
}

export function labelStyle() {
	return css("font-size: 13px; font-weight: 500; color: #0d0d0d");
}

export function rowStyle() {
	return css(
		"display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding-top: 4px",
	);
}

export function BackButton({
	handler,
	onClick,
	disabled = false,
}: {
	handler: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			className="soft-btn"
			disabled={disabled}
			data-handler={handler}
			onClick={onClick}
			style={css(
				"height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 14px; font-weight: 500",
			)}
		>
			Back
		</button>
	);
}

export function StepButtons({
	onBack,
	onNext,
	nextLabel,
	backHandler,
	nextHandler,
}: {
	onBack: () => void;
	onNext: () => void;
	nextLabel: string;
	backHandler: string;
	nextHandler: string;
}) {
	return (
		<div style={rowStyle()}>
			<BackButton handler={backHandler} onClick={onBack} />
			<button type="button" data-handler={nextHandler} onClick={onNext} style={css(primaryButton)}>
				{nextLabel}
			</button>
		</div>
	);
}

export function AccountStep({
	state,
	onChange,
	onSubmit,
	pending,
	credentialsLocked,
	notice,
}: {
	state: SignupState;
	onChange: (state: SignupState) => void;
	onSubmit: () => void;
	pending: boolean;
	credentialsLocked: boolean;
	notice: "" | "wrong" | "failed";
}) {
	const message = accountMessage(state, notice);
	const fieldsDisabled = pending || credentialsLocked;
	return (
		<div style={css("display: flex; flex-direction: column; gap: 20px")}>
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="email" style={labelStyle()}>
					Email
				</label>
				<input
					id="email"
					type="email"
					autoComplete="email"
					placeholder="you@company.com"
					value={state.email}
					disabled={fieldsDisabled}
					data-handler="onEmail"
					onChange={(event) => {
						onChange({ ...state, email: event.target.value });
					}}
					style={css(fieldStyle)}
				/>
			</div>
			<div style={css("display: flex; flex-direction: column; gap: 6px")}>
				<label htmlFor="password" style={labelStyle()}>
					Password
				</label>
				<input
					id="password"
					type="password"
					autoComplete="new-password"
					placeholder="Your password"
					value={state.password}
					disabled={fieldsDisabled}
					data-handler="onPassword"
					onChange={(event) => {
						onChange({ ...state, password: event.target.value });
					}}
					style={css(fieldStyle)}
				/>
			</div>
			{message.length > 0 ? (
				<div
					role="alert"
					style={css(
						"padding: 10px 12px; border-radius: 10px; background: #fa423e14; color: #911e1b; font-size: 13px",
					)}
				>
					{message}
				</div>
			) : null}
			<div style={rowStyle()}>
				<BackButton
					disabled={pending}
					handler="back"
					onClick={() => onChange({ ...state, step: "agents", tried: false })}
				/>
				<button type="button" disabled={pending} onClick={onSubmit} style={css(primaryButton)}>
					Create my workspace
					<Arrow />
				</button>
			</div>
		</div>
	);
}

function accountMessage(state: SignupState, notice: "" | "wrong" | "failed") {
	if (state.tried && !fieldsComplete(state.email, state.password)) return emptyError;
	return { "": "", wrong: wrongError, failed: failedError }[notice];
}

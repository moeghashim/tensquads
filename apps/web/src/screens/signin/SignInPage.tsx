import { useSignIn } from "@clerk/tanstack-react-start";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { css } from "../css.ts";
import { Arrow, Mark } from "../marks.tsx";
import { fieldsComplete } from "../signup/machine.ts";

const inputStyle = css(
	"height: 40px; box-sizing: border-box; padding: 0 12px; border: 0; border-radius: 10px; background: rgba(13,13,13,.06); font-family: inherit; font-size: 14px; color: #0d0d0d",
);

const emptyError = "Enter your email and password to sign in.";
const wrongError = "That email or password is wrong.";

export function SignInPage({ publishableKey }: { publishableKey: string }) {
	if (publishableKey.length === 0) {
		return <SignInScreen onAttempt={async () => "stay"} />;
	}
	return <SignInClerk />;
}

function SignInClerk() {
	const { signIn } = useSignIn();
	const navigate = useNavigate();
	return (
		<SignInScreen
			onAttempt={async (email, password) => {
				try {
					const result = await signIn.password({ emailAddress: email, password });
					if (result.error || signIn.status !== "complete" || !signIn.createdSessionId) {
						return "wrong";
					}
					await signIn.finalize();
					await navigate({ to: "/overview" });
					return "ok";
				} catch {
					return "wrong";
				}
			}}
		/>
	);
}

function SignInScreen({
	onAttempt,
}: {
	onAttempt: (email: string, password: string) => Promise<"ok" | "wrong" | "stay">;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [tried, setTried] = useState(false);
	const [rejected, setRejected] = useState(false);
	const [pending, setPending] = useState(false);
	const pendingRef = useRef(false);
	const complete = fieldsComplete(email, password);
	const message = tried && !complete ? emptyError : tried && rejected ? wrongError : "";
	return (
		<div
			style={css(
				"min-height: 100vh; box-sizing: border-box; background: #f3f3f3; color: #282828; font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 20px; letter-spacing: -0.01em; display: flex; flex-direction: column",
			)}
		>
			<header
				style={css(
					"display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 32px; flex-wrap: wrap",
				)}
			>
				<a
					href="/"
					style={css("display: flex; align-items: center; gap: 10px; text-decoration: none; color: #0d0d0d")}
				>
					<span
						style={css(
							"width: 28px; height: 28px; border-radius: 8px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center",
						)}
					>
						<Mark />
					</span>
					<span style={css("font-weight: 600; color: #0d0d0d")}>tensquads</span>
				</a>
				<div style={css("display: flex; align-items: center; gap: 8px; font-size: 13px; color: #5d5d5d")}>
					<span>New here?</span>
					<a href="/signup" style={css("font-weight: 500; text-decoration: none")}>
						Start free
					</a>
				</div>
			</header>
			<main
				style={css(
					"flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 48px 32px 64px; box-sizing: border-box",
				)}
			>
				<section
					aria-label="Sign in"
					style={css(
						"width: 100%; max-width: 420px; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 28px 32px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 20px",
					)}
				>
					<div>
						<h1
							style={css(
								"margin: 0; font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
							)}
						>
							Sign in to tensquads
						</h1>
						<p style={css("margin: 6px 0 0; color: #5d5d5d")}>Your squads kept working while you were away.</p>
					</div>
					<div style={css("display: flex; flex-direction: column; gap: 6px")}>
						<label htmlFor="email" style={css("font-size: 13px; font-weight: 500; color: #0d0d0d")}>
							Email
						</label>
						<input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="you@company.com"
							value={email}
							data-handler="onEmail"
							onChange={(event) => {
								setEmail(event.target.value);
								setRejected(false);
							}}
							style={inputStyle}
						/>
					</div>
					<div style={css("display: flex; flex-direction: column; gap: 6px")}>
						<div style={css("display: flex; justify-content: space-between; align-items: center")}>
							<label htmlFor="password" style={css("font-size: 13px; font-weight: 500; color: #0d0d0d")}>
								Password
							</label>
							<button type="button" className="text-link">
								Forgot password?
							</button>
						</div>
						<input
							id="password"
							type="password"
							autoComplete="current-password"
							placeholder="Your password"
							value={password}
							data-handler="onPassword"
							onChange={(event) => {
								setPassword(event.target.value);
								setRejected(false);
							}}
							style={inputStyle}
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
					<button
						type="button"
						className="btn-dark"
						data-handler="submit"
						disabled={pending}
						onClick={() => {
							if (pendingRef.current) {
								return;
							}
							setTried(true);
							if (!complete) {
								setRejected(false);
								return;
							}
							pendingRef.current = true;
							setPending(true);
							void onAttempt(email.trim(), password)
								.then((outcome) => {
									setRejected(outcome === "wrong");
								})
								.finally(() => {
									pendingRef.current = false;
									setPending(false);
								});
						}}
						style={css(
							"height: 42px; border-radius: 999px; background: #181818; color: #fff; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 8px",
						)}
					>
						Sign in
						<Arrow />
					</button>
					<div style={css("display: flex; align-items: center; gap: 12px; color: #8f8f8f; font-size: 12px")}>
						<span style={css("flex: 1; height: 1px; background: rgba(13,13,13,.08)")} />
						or
						<span style={css("flex: 1; height: 1px; background: rgba(13,13,13,.08)")} />
					</div>
					<button
						type="button"
						className="btn-soft"
						style={css(
							"height: 40px; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 8px",
						)}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M2.5 4.5h11v8h-11z" />
							<path d="M2.5 5l5.5 4 5.5-4" />
						</svg>
						Email me a sign-in link
					</button>
					<p style={css("margin: 0; font-size: 12px; color: #8f8f8f; text-align: center")}>
						By signing in you agree to the [TERMS] and [PRIVACY POLICY].
					</p>
				</section>
			</main>
		</div>
	);
}

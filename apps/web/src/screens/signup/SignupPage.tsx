import { useSignUp } from "@clerk/tanstack-react-start";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { createAccount } from "#/server/create-account.ts";
import { css } from "../css.ts";
import { Mark } from "../marks.tsx";
import { initialSignup, type SignupState } from "./machine.ts";
import { SignupCard } from "./SignupCard.tsx";
import { SignupPitch } from "./SignupPitch.tsx";
import type { AccountCreateResult } from "./signup-ui.tsx";

export function SignupPage({ publishableKey }: { publishableKey: string }) {
	if (publishableKey.length === 0) {
		return <SignupScreen onCreate={async () => "blocked"} />;
	}
	return <SignupClerk />;
}

function SignupClerk() {
	const { signUp } = useSignUp();
	const navigate = useNavigate();
	const ready = useRef(false);
	const [credentialsLocked, setCredentialsLocked] = useState(false);
	return (
		<SignupScreen
			credentialsLocked={credentialsLocked}
			onCreate={async (state, isCurrent) => {
				try {
					if (!ready.current) {
						if (signUp.status !== "complete") {
							const result = await signUp.password({
								emailAddress: state.email.trim(),
								password: state.password,
							});
							if (result.error) {
								return "wrong";
							}
						}
						if (signUp.status !== "complete" || !signUp.createdSessionId) {
							return "wrong";
						}
						const finalized = await signUp.finalize();
						if (finalized.error) return "wrong";
						ready.current = true;
						setCredentialsLocked(true);
					}
				} catch {
					return "wrong";
				}
				if (!isCurrent()) return "blocked";
				try {
					await createAccount({
						data: {
							name: state.name.trim(),
							mission: state.mission,
							agentIds: state.picked,
						},
					});
					if (!isCurrent()) return "blocked";
					await navigate({ to: "/overview" });
					return "ok";
				} catch {
					return "failed";
				}
			}}
		/>
	);
}

function SignupScreen({
	onCreate,
	credentialsLocked = false,
}: {
	onCreate: (state: SignupState, isCurrent: () => boolean) => Promise<AccountCreateResult>;
	credentialsLocked?: boolean;
}) {
	const [state, setState] = useState<SignupState>(initialSignup);
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
				<div style={css("display: flex; align-items: center; gap: 10px")}>
					<span
						style={css(
							"width: 28px; height: 28px; border-radius: 8px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center",
						)}
					>
						<Mark />
					</span>
					<span style={css("font-weight: 600; color: #0d0d0d")}>tensquads</span>
				</div>
				<div style={css("display: flex; align-items: center; gap: 8px; font-size: 13px; color: #5d5d5d")}>
					<span>Already have an account?</span>
					<a href="/signin" style={css("font-weight: 500; text-decoration: none")}>
						Sign in
					</a>
				</div>
			</header>
			<main
				style={css(
					"flex: 1; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; justify-content: center; padding: 16px 32px 48px; box-sizing: border-box; max-width: 1180px; width: 100%; margin: 0 auto",
				)}
			>
				<SignupPitch />
				<SignupCard
					state={state}
					onChange={setState}
					onCreate={onCreate}
					credentialsLocked={credentialsLocked}
				/>
			</main>
		</div>
	);
}

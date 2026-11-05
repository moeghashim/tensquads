import type { ReactNode } from "react";

import { css } from "../css.ts";

export function SignupPitch() {
	return (
		<section
			aria-label="What you get"
			style={css(
				"flex: 1 1 320px; max-width: 420px; display: flex; flex-direction: column; gap: 24px; padding-top: 24px",
			)}
		>
			<div>
				<span
					style={css(
						"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.08); font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; color: #5d5d5d",
					)}
				>
					Free for 14 days
				</span>
				<h1
					style={css(
						"margin: 12px 0 0; font-size: 36px; line-height: 42px; font-weight: 600; letter-spacing: -0.03em; color: #0d0d0d",
					)}
				>
					Run your business with a team of squads
				</h1>
				<p style={css("margin: 12px 0 0; font-size: 16px; line-height: 24px; color: #5d5d5d")}>
					Each part of your business gets its own squad: one agent with its tools. Petra coordinates them, and
					every squad works toward your mission.
				</p>
			</div>
			<ul style={css("margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px")}>
				<PitchItem
					tint="#e7efff"
					title="Orders, support, marketing, finance, stock"
					body="Start with the squads you need. Add more later."
				>
					<path d="M2.5 8.5 6 12l7.5-8" />
				</PitchItem>
				<PitchItem
					tint="#def5ee"
					title="You set the limits"
					body="Refunds, ad spend, reorders: squads stay inside them or ask first."
				>
					<path d="M2.5 4h7M12.5 4h1M2.5 8h2M7.5 8h6M2.5 12h5M10.5 12h3" />
					<circle cx="11" cy="4" r="1.5" />
					<circle cx="6" cy="8" r="1.5" />
					<circle cx="9" cy="12" r="1.5" />
				</PitchItem>
				<PitchItem
					tint="#ece3ff"
					title="One chat for everything"
					body="Ask Petra what's going on; Petra routes the question to the right squad."
				>
					<path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z" />
				</PitchItem>
			</ul>
			<div
				style={css(
					"padding: 16px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px rgba(13,13,13,.08); display: flex; flex-direction: column; gap: 6px",
				)}
			>
				<div style={css("font-size: 13px; line-height: 20px; color: #282828")}>[CUSTOMER QUOTE]</div>
				<div style={css("font-size: 12px; color: #5d5d5d")}>[CUSTOMER NAME], [BUSINESS]</div>
			</div>
		</section>
	);
}

function PitchItem({
	tint,
	title,
	body,
	children,
}: {
	tint: string;
	title: string;
	body: string;
	children: ReactNode;
}) {
	return (
		<li style={css("display: flex; gap: 12px; align-items: flex-start")}>
			<span
				style={css(
					`width: 28px; height: 28px; border-radius: 8px; background: ${tint}; display: inline-flex; align-items: center; justify-content: center; flex: none`,
				)}
			>
				<svg
					width="16"
					height="16"
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
			<div>
				<div style={css("font-weight: 500; color: #0d0d0d")}>{title}</div>
				<div style={css("font-size: 13px; color: #5d5d5d")}>{body}</div>
			</div>
		</li>
	);
}
